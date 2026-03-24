import { authenticateProviderRequest } from "./provider-auth";
import { getRequestId, jsonError, jsonResponse, readJson } from "./provider.http";
import { handleProviderExecutorResult } from "./provider.service";
import { loadOrCreateProviderUserContext } from "./provider.storage";
import { createHandleExecutorResultEndpoint } from "./provider.executor-result.endpoint.core";

export { createHandleExecutorResultEndpoint } from "./provider.executor-result.endpoint.core";

export const handleExecutorResultEndpoint =
  createHandleExecutorResultEndpoint({
    getRequestId,
    readJson,
    jsonResponse,
    jsonError,
    authenticateProviderRequest,
    loadOrCreateProviderUserContext,
    handleProviderExecutorResult,
  });
