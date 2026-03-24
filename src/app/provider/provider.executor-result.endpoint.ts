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
import { handleProviderExecutorResult } from "./provider.service";
import {
  loadOrCreateProviderUserContext,
  saveProviderUserContext,
} from "./provider.storage";
import { createHandleExecutorResultEndpoint } from "./provider.executor-result.endpoint.core";

export { createHandleExecutorResultEndpoint } from "./provider.executor-result.endpoint.core";

export const handleExecutorResultEndpoint =
  createHandleExecutorResultEndpoint({
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
    handleProviderExecutorResult,
  });
