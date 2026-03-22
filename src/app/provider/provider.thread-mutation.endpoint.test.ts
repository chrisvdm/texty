import assert from "node:assert/strict";
import test from "node:test";

import { createHandleThreadMutationEndpoint } from "./provider.thread-mutation.endpoint.core.ts";
import {
  buildIdempotencyKey,
  createReplayContext,
  createTestContext,
  okAuth,
  sharedEndpointDeps,
} from "./provider.endpoint.test-helpers.ts";

const createRequest = ({
  method,
  body,
  idempotencyKey,
}: {
  method: "PATCH" | "DELETE";
  body: {
    provider_id: string;
    user_id: string;
    title?: string;
  };
  idempotencyKey?: string;
}) =>
  new Request("https://example.com/api/v1/threads/thread_123", {
    method,
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
  title: "Renamed thread",
});

test("thread mutation endpoint renames with request tracing", async () => {
  const endpoint = createHandleThreadMutationEndpoint({
    ...sharedEndpointDeps,
    authenticateProviderRequest: okAuth,
    loadOrCreateProviderUserContext: async () => createTestContext(),
    saveProviderUserContext: async (context) => context,
    buildIdempotencyKey,
    hashIdempotencyRequest: async () => "hash_123",
    readIdempotencyReplay: () => ({ kind: "miss" }),
    storeIdempotencyReplay: ({ context }) => context,
    renameProviderThread: async () => ({
      thread_id: "thread_123",
      title: "Renamed thread",
    }),
    deleteProviderThread: async () => ({
      deleted: true,
    }),
  });

  const response = await endpoint({
    request: createRequest({
      method: "PATCH",
      body: createInput(),
    }),
    params: {
      threadId: "thread_123",
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Request-Id"), "req_123");
  assert.deepEqual(await response.json(), {
    thread_id: "thread_123",
    title: "Renamed thread",
    request_id: "req_123",
  });
});

test("thread mutation endpoint deletes with idempotent replay", async () => {
  const storageKey = buildIdempotencyKey({
    method: "DELETE",
    path: "/api/v1/threads/thread_123",
    idempotencyKey: "idem_123",
  });
  const context = createReplayContext({
    storageKey,
    requestHash: "hash_123",
    status: 200,
    body: {
      deleted: true,
    },
  });

  const endpoint = createHandleThreadMutationEndpoint({
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
    renameProviderThread: async () => ({
      thread_id: "thread_123",
    }),
    deleteProviderThread: async () => {
      throw new Error("should not delete on replay");
    },
  });

  const response = await endpoint({
    request: createRequest({
      method: "DELETE",
      body: {
        provider_id: "provider_a",
        user_id: "user_123",
      },
      idempotencyKey: "idem_123",
    }),
    params: {
      threadId: "thread_123",
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Idempotent-Replay"), "true");
  assert.deepEqual(await response.json(), {
    deleted: true,
    request_id: "req_123",
  });
});

test("thread mutation endpoint rejects idempotency conflicts", async () => {
  const endpoint = createHandleThreadMutationEndpoint({
    ...sharedEndpointDeps,
    authenticateProviderRequest: okAuth,
    loadOrCreateProviderUserContext: async () => createTestContext(),
    saveProviderUserContext: async (context) => context,
    buildIdempotencyKey,
    hashIdempotencyRequest: async () => "hash_456",
    readIdempotencyReplay: () => ({ kind: "conflict" }),
    storeIdempotencyReplay: ({ context }) => context,
    renameProviderThread: async () => ({
      thread_id: "thread_123",
    }),
    deleteProviderThread: async () => ({
      deleted: true,
    }),
  });

  const response = await endpoint({
    request: createRequest({
      method: "PATCH",
      body: createInput(),
      idempotencyKey: "idem_conflict",
    }),
    params: {
      threadId: "thread_123",
    },
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
