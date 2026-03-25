import assert from "node:assert/strict";
import test from "node:test";

import { createHandleToolsSyncEndpoint } from "./provider.tools-sync.endpoint.core.ts";
import {
  buildIdempotencyKey,
  createReplayContext,
  createTestContext,
  okAuth,
  sharedEndpointDeps,
} from "./provider.endpoint.test-helpers.ts";
import type { ProviderToolSyncInput } from "./provider.types.ts";

const isNeverRateLimitError = (
  _error: unknown,
): _error is Error & { retryAfterSeconds: number } => false;

const createRequest = ({
  body,
  idempotencyKey,
}: {
  body: ProviderToolSyncInput;
  idempotencyKey?: string;
}) =>
  new Request("https://example.com/api/v1/integrations/provider_a/users/user_123/tools/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test-token",
      "X-Request-Id": "req_123",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });

const createInput = (): ProviderToolSyncInput => ({
  integration_id: "provider_a",
  user_id: "user_123",
  tools: [
    {
      tool_name: "spreadsheet.update_row",
      description: "Update a row in a spreadsheet",
      input_schema: {
        type: "object",
      },
    },
  ],
});

test("tools sync endpoint includes request tracing on success", async () => {
  const endpoint = createHandleToolsSyncEndpoint({
    ...sharedEndpointDeps,
    authenticateProviderRequest: okAuth,
    loadOrCreateProviderUserContext: async () => createTestContext(),
    saveProviderUserContext: async (context) => context,
    buildIdempotencyKey,
    hashIdempotencyRequest: async () => "hash_123",
    readIdempotencyReplay: () => ({ kind: "miss" }),
    storeIdempotencyReplay: ({ context }) => context,
    syncProviderTools: async (_input, requestId) => ({
      synced: true,
      request_id_seen_by_service: requestId,
    }),
    isProviderRateLimitError: isNeverRateLimitError,
  });

  const response = await endpoint({
    request: createRequest({ body: createInput() }),
    params: {
      integrationId: "provider_a",
      userId: "user_123",
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Request-Id"), "req_123");
  assert.deepEqual(await response.json(), {
    synced: true,
    request_id_seen_by_service: "req_123",
    request_id: "req_123",
  });
});

test("tools sync endpoint can derive integration_id from auth on token-scoped route", async () => {
  let seenIntegrationId: string | undefined;

  const endpoint = createHandleToolsSyncEndpoint({
    ...sharedEndpointDeps,
    authenticateProviderRequest: okAuth,
    loadOrCreateProviderUserContext: async () => createTestContext(),
    saveProviderUserContext: async (context) => context,
    buildIdempotencyKey,
    hashIdempotencyRequest: async () => "hash_123",
    readIdempotencyReplay: () => ({ kind: "miss" }),
    storeIdempotencyReplay: ({ context }) => context,
    syncProviderTools: async (input) => {
      seenIntegrationId = input.integration_id;
      return {
        synced: true,
      };
    },
    isProviderRateLimitError: isNeverRateLimitError,
  });

  const body = createInput();
  delete body.integration_id;

  const response = await endpoint({
    request: new Request("https://example.com/api/v1/tools/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-token",
        "X-Request-Id": "req_123",
      },
      body: JSON.stringify(body),
    }),
    params: {},
  });

  assert.equal(response.status, 200);
  assert.equal(seenIntegrationId, "provider_a");
});

test("tools sync endpoint replays idempotent responses", async () => {
  const storageKey = buildIdempotencyKey({
    method: "POST",
    path: "/api/v1/integrations/provider_a/users/user_123/tools/sync",
    idempotencyKey: "idem_123",
  });
  const context = createReplayContext({
    storageKey,
    requestHash: "hash_123",
    status: 200,
    body: {
      synced: true,
      count: 1,
    },
  });

  const endpoint = createHandleToolsSyncEndpoint({
    ...sharedEndpointDeps,
    authenticateProviderRequest: okAuth,
    loadOrCreateProviderUserContext: async () => context,
    saveProviderUserContext: async (value) => value,
    buildIdempotencyKey,
    hashIdempotencyRequest: async () => "hash_123",
    readIdempotencyReplay: ({ context, storageKey, requestHash }) => {
      const entry = context.idempotency[storageKey];

      if (entry?.requestHash === requestHash) {
        return {
          kind: "replay" as const,
          status: entry.status,
          body: entry.body,
        };
      }

      return { kind: "miss" as const };
    },
    storeIdempotencyReplay: ({ context }) => context,
    syncProviderTools: async () => {
      throw new Error("should not sync on replay");
    },
    isProviderRateLimitError: isNeverRateLimitError,
  });

  const response = await endpoint({
    request: createRequest({
      body: createInput(),
      idempotencyKey: "idem_123",
    }),
    params: {
      integrationId: "provider_a",
      userId: "user_123",
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Idempotent-Replay"), "true");
  assert.deepEqual(await response.json(), {
    synced: true,
    count: 1,
    request_id: "req_123",
  });
});

test("tools sync endpoint rejects provider and user mismatches", async () => {
  const endpoint = createHandleToolsSyncEndpoint({
    ...sharedEndpointDeps,
    authenticateProviderRequest: okAuth,
    loadOrCreateProviderUserContext: async () => createTestContext(),
    saveProviderUserContext: async (context) => context,
    buildIdempotencyKey,
    hashIdempotencyRequest: async () => "hash_123",
    readIdempotencyReplay: () => ({ kind: "miss" }),
    storeIdempotencyReplay: ({ context }) => context,
    syncProviderTools: async () => ({
      synced: true,
    }),
    isProviderRateLimitError: isNeverRateLimitError,
  });

  const response = await endpoint({
    request: createRequest({
      body: {
        ...createInput(),
        user_id: "user_999",
      },
    }),
    params: {
      integrationId: "provider_a",
      userId: "user_123",
    },
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: {
      code: "forbidden",
      message: "User mismatch.",
      details: null,
    },
    request_id: "req_123",
  });
});

test("tools sync endpoint returns a traced 429 for rate-limited requests", async () => {
  const endpoint = createHandleToolsSyncEndpoint({
    ...sharedEndpointDeps,
    authenticateProviderRequest: okAuth,
    loadOrCreateProviderUserContext: async () => createTestContext(),
    saveProviderUserContext: async (context) => context,
    buildIdempotencyKey,
    hashIdempotencyRequest: async () => "hash_123",
    readIdempotencyReplay: () => ({ kind: "miss" }),
    storeIdempotencyReplay: ({ context }) => context,
    syncProviderTools: async () => {
      const error = new Error("Rate limit exceeded.") as Error & {
        retryAfterSeconds: number;
      };
      error.retryAfterSeconds = 21;
      throw error;
    },
    isProviderRateLimitError: (error): error is Error & { retryAfterSeconds: number } =>
      Boolean(
        error &&
          typeof error === "object" &&
          "retryAfterSeconds" in error &&
          typeof error.retryAfterSeconds === "number",
      ),
  });

  const response = await endpoint({
    request: createRequest({ body: createInput() }),
    params: {
      integrationId: "provider_a",
      userId: "user_123",
    },
  });

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("X-Request-Id"), "req_123");
  assert.equal(response.headers.get("Retry-After"), "21");
  assert.deepEqual(await response.json(), {
    error: {
      code: "rate_limited",
      message: "Too many tool sync requests. Try again shortly.",
      details: {
        retry_after_seconds: 21,
      },
    },
    request_id: "req_123",
  });
});
