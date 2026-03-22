import { authenticateProviderRequest } from "./provider-auth";
import {
  getIdempotencyHeader,
  getRequestId,
  jsonError,
  jsonResponse,
  readJson,
  replayIdempotentResponse,
} from "./provider.http";
import {
  buildIdempotencyKey,
  hashIdempotencyRequest,
  readIdempotencyReplay,
  storeIdempotencyReplay,
} from "./provider.idempotency";
import {
  deleteProviderThread,
  renameProviderThread,
} from "./provider.service";
import {
  loadOrCreateProviderUserContext,
  saveProviderUserContext,
} from "./provider.storage";
import { createHandleThreadMutationEndpoint } from "./provider.thread-mutation.endpoint.core";

export const handleThreadMutationEndpoint = createHandleThreadMutationEndpoint({
  getRequestId,
  getIdempotencyHeader,
  readJson,
  jsonResponse,
  jsonError,
  replayIdempotentResponse,
  authenticateProviderRequest,
  loadOrCreateProviderUserContext,
  saveProviderUserContext,
  buildIdempotencyKey,
  hashIdempotencyRequest,
  readIdempotencyReplay,
  storeIdempotencyReplay,
  renameProviderThread,
  deleteProviderThread,
});
