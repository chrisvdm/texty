import { authenticateProviderRequest } from "./provider-auth";
import { getIdempotencyHeader, getRequestId, jsonError, jsonResponse, readJson, replayIdempotentResponse } from "./provider.http";
import { buildIdempotencyKey, hashIdempotencyRequest, readIdempotencyReplay, storeIdempotencyReplay } from "./provider.idempotency";
import { createProviderThread } from "./provider.service";
import { loadOrCreateProviderUserContext, saveProviderUserContext } from "./provider.storage";
import { createHandleThreadCreateEndpoint } from "./provider.thread-create.endpoint.core";

export const handleThreadCreateEndpoint = createHandleThreadCreateEndpoint({
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
  createProviderThread,
});
