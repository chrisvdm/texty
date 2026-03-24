import assert from "node:assert/strict";
import test from "node:test";

import { createHandleExecutorResultEndpoint } from "./provider.executor-result.endpoint.core.ts";
import {
  createTestContext,
  buildIdempotencyKey,
  createReplayContext,
  okAuth,
  sharedEndpointDeps,
} from "./provider.endpoint.test-helpers.ts";
import {
  hashIdempotencyRequest,
  readIdempotencyReplay,
  storeIdempotencyReplay,
} from "./provider.idempotency.ts";
import type { ProviderExecutorResultInput } from "./provider.types.ts";

const createCompletionRequest = ({
  body,
  requestId = "req_123",
  idempotencyKey,
}: {
  body: ProviderExecutorResultInput;
  requestId?: string;
  idempotencyKey?: string;
}) =>
  new Request("https://example.com/api/v1/webhooks/executor", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test-token",
      "X-Request-Id": requestId,
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });

const createInput = (): ProviderExecutorResultInput => ({
  integration_id: "provider_a",
  user_id: "user_123",
  thread_id: "thread_123",
  result: {
    tool_name: "todos.add",
    state: "completed",
    content: "Added the todo.",
  },
});

test("executor result endpoint includes request tracing on success", async () => {
  const endpoint = createHandleExecutorResultEndpoint({
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
    hashIdempotencyRequest,
    readIdempotencyReplay,
    storeIdempotencyReplay,
    handleProviderExecutorResult: async ({ requestId }) => ({
      status: "ok",
      request_id_seen_by_service: requestId,
    }),
  });

  const response = await endpoint({
    request: createCompletionRequest({
      body: createInput(),
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Request-Id"), "req_123");
  assert.deepEqual(await response.json(), {
    status: "ok",
    request_id_seen_by_service: "req_123",
    request_id: "req_123",
  });
});

test("executor result endpoint replays idempotent responses", async () => {
  const body = createInput();
  const idempotencyKey = "executor-webhook-1";
  const storageKey = buildIdempotencyKey({
    method: "POST",
    path: "/api/v1/webhooks/executor",
    idempotencyKey,
  });
  const requestHash = await hashIdempotencyRequest({
    method: "POST",
    path: storageKey,
    body,
  });
  let handled = false;

  const endpoint = createHandleExecutorResultEndpoint({
    ...sharedEndpointDeps,
    authenticateProviderRequest: () => ({
      ...okAuth(),
      providerConfig: {
        token: "test-token",
      },
    }),
    loadOrCreateProviderUserContext: async () =>
      createReplayContext({
        storageKey,
        requestHash,
        status: 200,
        body: {
          status: "ok",
          channel_delivery: "sent",
        },
      }),
    saveProviderUserContext: async (context) => context,
    buildIdempotencyKey,
    hashIdempotencyRequest,
    readIdempotencyReplay,
    storeIdempotencyReplay,
    handleProviderExecutorResult: async () => {
      handled = true;
      return { status: "ok" };
    },
  });

  const response = await endpoint({
    request: createCompletionRequest({
      body,
      idempotencyKey,
    }),
  });

  assert.equal(handled, false);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Idempotent-Replay"), "true");
  assert.deepEqual(await response.json(), {
    status: "ok",
    channel_delivery: "sent",
    request_id: "req_123",
  });
});

test("executor result endpoint rejects idempotency conflicts", async () => {
  const body = createInput();
  const idempotencyKey = "executor-webhook-1";
  const storageKey = buildIdempotencyKey({
    method: "POST",
    path: "/api/v1/webhooks/executor",
    idempotencyKey,
  });
  let handled = false;

  const endpoint = createHandleExecutorResultEndpoint({
    ...sharedEndpointDeps,
    authenticateProviderRequest: () => ({
      ...okAuth(),
      providerConfig: {
        token: "test-token",
      },
    }),
    loadOrCreateProviderUserContext: async () =>
      createReplayContext({
        storageKey,
        requestHash: "different-request-hash",
        status: 200,
        body: {
          status: "ok",
        },
      }),
    saveProviderUserContext: async (context) => context,
    buildIdempotencyKey,
    hashIdempotencyRequest,
    readIdempotencyReplay,
    storeIdempotencyReplay,
    handleProviderExecutorResult: async () => {
      handled = true;
      return { status: "ok" };
    },
  });

  const response = await endpoint({
    request: createCompletionRequest({
      body,
      idempotencyKey,
    }),
  });

  assert.equal(handled, false);
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: {
      code: "idempotency_conflict",
      message: "Idempotency key was reused with a different request body.",
      details: null,
    },
    request_id: "req_123",
  });
});
