import assert from "node:assert/strict";
import test from "node:test";

import { createHandleThreadCreateEndpoint } from "./provider.thread-create.endpoint.core.ts";
import {
  buildIdempotencyKey,
  createReplayContext,
  createTestContext,
  okAuth,
  sharedEndpointDeps,
} from "./provider.endpoint.test-helpers.ts";

const createRequest = ({
  body,
  idempotencyKey,
}: {
  body: {
    provider_id: string;
    user_id: string;
    title?: string;
    is_private?: boolean;
    channel: {
      type: string;
      id: string;
    };
  };
  idempotencyKey?: string;
}) =>
  new Request("https://example.com/api/v1/threads", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test-token",
      "X-Request-Id": "req_123",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });

const createInput = () => ({
  provider_id: "provider_a",
  user_id: "user_123",
  title: "Work thread",
  is_private: false,
  channel: {
    type: "email",
    id: "chris@example.com",
  },
});

test("thread create endpoint includes request tracing on success", async () => {
  const endpoint = createHandleThreadCreateEndpoint({
    ...sharedEndpointDeps,
    authenticateProviderRequest: okAuth,
    loadOrCreateProviderUserContext: async () => createTestContext(),
    saveProviderUserContext: async (context) => context,
    buildIdempotencyKey,
    hashIdempotencyRequest: async () => "hash_123",
    readIdempotencyReplay: () => ({ kind: "miss" }),
    storeIdempotencyReplay: ({ context }) => context,
    createProviderThread: async (_input) => ({
      thread_id: "thread_123",
      title: "Work thread",
    }),
  });

  const response = await endpoint({
    request: createRequest({ body: createInput() }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Request-Id"), "req_123");
  assert.deepEqual(await response.json(), {
    thread_id: "thread_123",
    title: "Work thread",
    request_id: "req_123",
  });
});

test("thread create endpoint replays idempotent responses", async () => {
  const storageKey = buildIdempotencyKey({
    method: "POST",
    path: "/api/v1/threads",
    idempotencyKey: "idem_123",
  });
  const context = createReplayContext({
    storageKey,
    requestHash: "hash_123",
    status: 200,
    body: {
      thread_id: "thread_123",
      title: "Work thread",
    },
  });

  const endpoint = createHandleThreadCreateEndpoint({
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
    createProviderThread: async () => {
      throw new Error("should not create on replay");
    },
  });

  const response = await endpoint({
    request: createRequest({
      body: createInput(),
      idempotencyKey: "idem_123",
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Idempotent-Replay"), "true");
  assert.deepEqual(await response.json(), {
    thread_id: "thread_123",
    title: "Work thread",
    request_id: "req_123",
  });
});

test("thread create endpoint rejects idempotency conflicts", async () => {
  const endpoint = createHandleThreadCreateEndpoint({
    ...sharedEndpointDeps,
    authenticateProviderRequest: okAuth,
    loadOrCreateProviderUserContext: async () => createTestContext(),
    saveProviderUserContext: async (context) => context,
    buildIdempotencyKey,
    hashIdempotencyRequest: async () => "hash_456",
    readIdempotencyReplay: () => ({ kind: "conflict" }),
    storeIdempotencyReplay: ({ context }) => context,
    createProviderThread: async () => ({
      thread_id: "thread_123",
    }),
  });

  const response = await endpoint({
    request: createRequest({
      body: createInput(),
      idempotencyKey: "idem_conflict",
    }),
  });

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
