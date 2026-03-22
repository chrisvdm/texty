import { authenticateProviderRequest } from "./provider-auth";
import { getIdempotencyHeader, getRequestId, jsonError, jsonResponse, readJson, replayIdempotentResponse } from "./provider.http";
import { buildIdempotencyKey, hashIdempotencyRequest, readIdempotencyReplay, storeIdempotencyReplay } from "./provider.idempotency";
import { loadOrCreateProviderUserContext, saveProviderUserContext } from "./provider.storage";
import { syncProviderTools } from "./provider.service";
import { createHandleToolsSyncEndpoint } from "./provider.tools-sync.endpoint.core";

export const handleToolsSyncEndpoint = createHandleToolsSyncEndpoint({
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
  syncProviderTools,
});
