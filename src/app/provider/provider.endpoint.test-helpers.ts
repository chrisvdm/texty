import { createEmptyGlobalMemory } from "../chat/shared.ts";

import {
  buildIdempotencyKey,
  storeIdempotencyReplay,
} from "./provider.idempotency.ts";
import {
  getIdempotencyHeader,
  getRequestId,
  jsonError,
  jsonResponse,
  readJson,
  replayIdempotentResponse,
} from "./provider.http.ts";
import type { ProviderUserContext } from "./provider.types.ts";

export const createTestContext = (): ProviderUserContext => ({
  providerId: "provider_a",
  userId: "user_123",
  selectedModel: "openai/gpt-4o-mini",
  memoryPolicy: {
    mode: "provider_user",
  },
  globalMemory: createEmptyGlobalMemory(),
  threads: [],
  allowedTools: [],
  channels: {},
  threadChannels: {},
  requestLog: {
    conversationInputTimestamps: [],
    toolSyncTimestamps: [],
  },
  idempotency: {},
  createdAt: "2026-03-21T10:00:00.000Z",
  updatedAt: "2026-03-21T10:00:00.000Z",
});

export const sharedEndpointDeps = {
  getRequestId,
  getIdempotencyHeader,
  readJson,
  jsonResponse,
  jsonError,
  replayIdempotentResponse,
};

export const okAuth = () => ({
  ok: true as const,
  providerId: "provider_a",
});

export const createReplayContext = ({
  storageKey,
  requestHash,
  status,
  body,
}: {
  storageKey: string;
  requestHash: string;
  status: number;
  body: Record<string, unknown>;
}) =>
  storeIdempotencyReplay({
    context: createTestContext(),
    storageKey,
    requestHash,
    status,
    body,
    now: new Date().toISOString(),
  });

export {
  buildIdempotencyKey,
};
