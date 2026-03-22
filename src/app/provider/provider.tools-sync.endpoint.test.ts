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

const createRequest = ({
  body,
  idempotencyKey,
}: {
  body: ProviderToolSyncInput;
  idempotencyKey?: string;
}) =>
  new Request("https://example.com/api/v1/providers/provider_a/users/user_123/tools/sync", {
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
  provider_id: "provider_a",
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
  });

  const response = await endpoint({
    request: createRequest({ body: createInput() }),
    params: {
      providerId: "provider_a",
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

test("tools sync endpoint replays idempotent responses", async () => {
  const storageKey = buildIdempotencyKey({
    method: "POST",
    path: "/api/v1/providers/provider_a/users/user_123/tools/sync",
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
  });

  const response = await endpoint({
    request: createRequest({
      body: createInput(),
      idempotencyKey: "idem_123",
    }),
    params: {
      providerId: "provider_a",
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
  });

  const response = await endpoint({
    request: createRequest({
      body: {
        ...createInput(),
        user_id: "user_999",
      },
    }),
    params: {
      providerId: "provider_a",
      userId: "user_123",
    },
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: {
      code: "forbidden",
      message: "Provider or user mismatch.",
      details: null,
    },
    request_id: "req_123",
  });
});
