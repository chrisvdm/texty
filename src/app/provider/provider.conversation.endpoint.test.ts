import assert from "node:assert/strict";
import test from "node:test";

import { createHandleConversationInputEndpoint } from "./provider.conversation.endpoint.core.ts";
import {
  buildIdempotencyKey,
  createReplayContext,
  createTestContext,
  okAuth,
  sharedEndpointDeps,
} from "./provider.endpoint.test-helpers.ts";
import type { ProviderConversationInput } from "./provider.types.ts";

const isNeverRateLimitError = (
  _error: unknown,
): _error is Error & { retryAfterSeconds: number } => false;

const createConversationRequest = ({
  body,
  requestId = "req_123",
  idempotencyKey,
  path = "/api/v1/conversation/input",
}: {
  body: ProviderConversationInput;
  requestId?: string;
  idempotencyKey?: string;
  path?: string;
}) =>
  new Request(`https://example.com${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test-token",
      "X-Request-Id": requestId,
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });

const createInput = (): ProviderConversationInput => ({
  integration_id: "provider_a",
  user_id: "user_123",
  channel: {
    type: "web",
    id: "browser_123",
  },
  input: {
    kind: "text",
    text: "Update the spreadsheet",
  },
});

test("conversation endpoint includes request tracing on success", async () => {
  const endpoint = createHandleConversationInputEndpoint({
    ...sharedEndpointDeps,
    authenticateProviderRequest: () => ({
      ...okAuth(),
      providerConfig: {
        token: "test-token",
      },
    }),
    loadOrCreateProviderUserContext: async () => createTestContext(),
    saveProviderUserContext: async (context) => context,
    buildIdempotencyKey,
    hashIdempotencyRequest: async () => "hash_123",
    readIdempotencyReplay: () => ({ kind: "miss" }),
    storeIdempotencyReplay: ({ context }) => context,
    handleProviderConversationInput: async ({ requestId }) => ({
      state: "completed",
      request_id_seen_by_service: requestId,
    }),
    isProviderRateLimitError: isNeverRateLimitError,
  });

  const response = await endpoint({
    request: createConversationRequest({
      body: createInput(),
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Request-Id"), "req_123");
  assert.deepEqual(await response.json(), {
    state: "completed",
    request_id_seen_by_service: "req_123",
    request_id: "req_123",
  });
});

test("conversation endpoint accepts the short /api/v1/input alias", async () => {
  const endpoint = createHandleConversationInputEndpoint({
    ...sharedEndpointDeps,
    authenticateProviderRequest: () => ({
      ...okAuth(),
      providerConfig: {
        token: "test-token",
      },
    }),
    loadOrCreateProviderUserContext: async () => createTestContext(),
    saveProviderUserContext: async (context) => context,
    buildIdempotencyKey,
    hashIdempotencyRequest: async () => "hash_123",
    readIdempotencyReplay: () => ({ kind: "miss" }),
    storeIdempotencyReplay: ({ context }) => context,
    handleProviderConversationInput: async ({ requestId }) => ({
      state: "completed",
      request_id_seen_by_service: requestId,
    }),
    isProviderRateLimitError: isNeverRateLimitError,
  });

  const response = await endpoint({
    request: createConversationRequest({
      body: createInput(),
      path: "/api/v1/input",
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Request-Id"), "req_123");
  assert.deepEqual(await response.json(), {
    state: "completed",
    request_id_seen_by_service: "req_123",
    request_id: "req_123",
  });
});

test("conversation endpoint can derive integration_id from auth", async () => {
  let seenIntegrationId: string | undefined;

  const endpoint = createHandleConversationInputEndpoint({
    ...sharedEndpointDeps,
    authenticateProviderRequest: () => ({
      ...okAuth(),
      providerConfig: {
        token: "test-token",
      },
    }),
    loadOrCreateProviderUserContext: async () => createTestContext(),
    saveProviderUserContext: async (context) => context,
    buildIdempotencyKey,
    hashIdempotencyRequest: async () => "hash_123",
    readIdempotencyReplay: () => ({ kind: "miss" }),
    storeIdempotencyReplay: ({ context }) => context,
    handleProviderConversationInput: async ({ input }) => {
      seenIntegrationId = input.integration_id;
      return {
        state: "completed",
      };
    },
    isProviderRateLimitError: isNeverRateLimitError,
  });

  const body = createInput();
  delete body.integration_id;

  const response = await endpoint({
    request: createConversationRequest({
      body,
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(seenIntegrationId, "provider_a");
});

test("conversation endpoint forwards optional tools on input", async () => {
  let seenTools: ProviderConversationInput["tools"];

  const endpoint = createHandleConversationInputEndpoint({
    ...sharedEndpointDeps,
    authenticateProviderRequest: () => ({
      ...okAuth(),
      providerConfig: {
        token: "test-token",
      },
    }),
    loadOrCreateProviderUserContext: async () => createTestContext(),
    saveProviderUserContext: async (context) => context,
    buildIdempotencyKey,
    hashIdempotencyRequest: async () => "hash_123",
    readIdempotencyReplay: () => ({ kind: "miss" }),
    storeIdempotencyReplay: ({ context }) => context,
    handleProviderConversationInput: async ({ input }) => {
      seenTools = input.tools;
      return {
        state: "completed",
      };
    },
    isProviderRateLimitError: isNeverRateLimitError,
  });

  const response = await endpoint({
    request: createConversationRequest({
      body: {
        ...createInput(),
        tools: [
          {
            tool_name: "calendar.create_event",
            description: "Create a calendar event",
            input_schema: {
              type: "object",
              properties: {
                title: { type: "string" },
              },
            },
          },
        ],
      },
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(seenTools, [
    {
      tool_name: "calendar.create_event",
      description: "Create a calendar event",
      input_schema: {
        type: "object",
        properties: {
          title: { type: "string" },
        },
      },
    },
  ]);
});

test("conversation endpoint replays idempotent responses", async () => {
  const input = createInput();
  const storageKey = buildIdempotencyKey({
    method: "POST",
    path: "/api/v1/conversation/input",
    idempotencyKey: "idem_123",
  });
  const context = createReplayContext({
    storageKey,
    requestHash: "hash_123",
    status: 202,
    body: {
      state: "accepted",
    },
  });

  const endpoint = createHandleConversationInputEndpoint({
    ...sharedEndpointDeps,
    authenticateProviderRequest: () => ({
      ...okAuth(),
      providerConfig: {
        token: "test-token",
      },
    }),
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
    handleProviderConversationInput: async () => {
      throw new Error("should not execute on replay");
    },
    isProviderRateLimitError: isNeverRateLimitError,
  });

  const response = await endpoint({
    request: createConversationRequest({
      body: input,
      idempotencyKey: "idem_123",
    }),
  });

  assert.equal(response.status, 202);
  assert.equal(response.headers.get("X-Idempotent-Replay"), "true");
  assert.deepEqual(await response.json(), {
    state: "accepted",
    request_id: "req_123",
  });
});

test("conversation endpoint rejects idempotency conflicts", async () => {
  const endpoint = createHandleConversationInputEndpoint({
    ...sharedEndpointDeps,
    authenticateProviderRequest: () => ({
      ...okAuth(),
      providerConfig: {
        token: "test-token",
      },
    }),
    loadOrCreateProviderUserContext: async () => createTestContext(),
    saveProviderUserContext: async (context) => context,
    buildIdempotencyKey,
    hashIdempotencyRequest: async () => "hash_456",
    readIdempotencyReplay: () => ({ kind: "conflict" }),
    storeIdempotencyReplay: ({ context }) => context,
    handleProviderConversationInput: async () => ({
      state: "completed",
    }),
    isProviderRateLimitError: isNeverRateLimitError,
  });

  const response = await endpoint({
    request: createConversationRequest({
      body: createInput(),
      idempotencyKey: "idem_conflict",
    }),
  });

  assert.equal(response.status, 409);
  assert.equal(response.headers.get("X-Request-Id"), "req_123");
  assert.deepEqual(await response.json(), {
    error: {
      code: "idempotency_conflict",
      message: "Idempotency key was reused with a different request body.",
      details: null,
    },
    request_id: "req_123",
  });
});

test("conversation endpoint returns a traced 429 for rate-limited requests", async () => {
  const endpoint = createHandleConversationInputEndpoint({
    ...sharedEndpointDeps,
    authenticateProviderRequest: () => ({
      ...okAuth(),
      providerConfig: {
        token: "test-token",
      },
    }),
    loadOrCreateProviderUserContext: async () => createTestContext(),
    saveProviderUserContext: async (context) => context,
    buildIdempotencyKey,
    hashIdempotencyRequest: async () => "hash_123",
    readIdempotencyReplay: () => ({ kind: "miss" }),
    storeIdempotencyReplay: ({ context }) => context,
    handleProviderConversationInput: async () => {
      const error = new Error("Rate limit exceeded.") as Error & {
        retryAfterSeconds: number;
      };
      error.retryAfterSeconds = 17;
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
    request: createConversationRequest({
      body: createInput(),
    }),
  });

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("X-Request-Id"), "req_123");
  assert.equal(response.headers.get("Retry-After"), "17");
  assert.deepEqual(await response.json(), {
    error: {
      code: "rate_limited",
      message: "Too many conversation requests. Try again shortly.",
      details: {
        retry_after_seconds: 17,
      },
    },
    request_id: "req_123",
  });
});
