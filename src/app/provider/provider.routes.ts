import { route } from "rwsdk/router";

import { authenticateProviderRequest } from "./provider-auth";
import { handleConversationInputEndpoint } from "./provider.conversation.endpoint";
import { handleThreadCreateEndpoint } from "./provider.thread-create.endpoint";
import { handleThreadMutationEndpoint } from "./provider.thread-mutation.endpoint";
import { handleToolsSyncEndpoint } from "./provider.tools-sync.endpoint";
import {
  getRequestId,
  jsonError,
  jsonResponse,
  readJson,
} from "./provider.http";
import {
} from "./provider.idempotency";
import {
  getProviderMemory,
  getProviderThreadMemory,
  listProviderThreads,
} from "./provider.service";

export const providerRoutes = [
  route(
    "/api/v1/providers/:providerId/users/:userId/tools/sync",
    handleToolsSyncEndpoint,
  ),
  route("/api/v1/conversation/input", handleConversationInputEndpoint),
  route("/api/v1/threads", handleThreadCreateEndpoint),
  route(
    "/api/v1/providers/:providerId/users/:userId/threads",
    async ({ request, params }) => {
      const requestId = getRequestId(request);

      if (request.method !== "GET") {
        return jsonError({
          requestId,
          status: 405,
          code: "method_not_allowed",
          message: "Method not allowed.",
        });
      }

      const auth = authenticateProviderRequest({
        request,
        providerId: params.providerId,
        requestId,
      });

      if (!auth.ok) {
        return jsonError({
          requestId,
          status: auth.status,
          code: auth.error.code,
          message: auth.error.message,
        });
      }

      try {
        const result = await listProviderThreads({
          providerId: params.providerId,
          userId: params.userId,
        });
        return jsonResponse({
          requestId,
          body: result as unknown as Record<string, unknown>,
        });
      } catch (error) {
        return jsonError({
          requestId,
          status: 400,
          code: "invalid_request",
          message:
            error instanceof Error ? error.message : "Unable to list threads.",
        });
      }
    },
  ),
  route("/api/v1/threads/:threadId", handleThreadMutationEndpoint),
  route(
    "/api/v1/providers/:providerId/users/:userId/memory",
    async ({ request, params }) => {
      const requestId = getRequestId(request);

      if (request.method !== "GET") {
        return jsonError({
          requestId,
          status: 405,
          code: "method_not_allowed",
          message: "Method not allowed.",
        });
      }

      const auth = authenticateProviderRequest({
        request,
        providerId: params.providerId,
        requestId,
      });

      if (!auth.ok) {
        return jsonError({
          requestId,
          status: auth.status,
          code: auth.error.code,
          message: auth.error.message,
        });
      }

      try {
        const result = await getProviderMemory({
          providerId: params.providerId,
          userId: params.userId,
        });
        return jsonResponse({
          requestId,
          body: result as unknown as Record<string, unknown>,
        });
      } catch (error) {
        return jsonError({
          requestId,
          status: 400,
          code: "invalid_request",
          message:
            error instanceof Error ? error.message : "Unable to load memory.",
        });
      }
    },
  ),
  route("/api/v1/threads/:threadId/memory", async ({ request, params }) => {
    const requestId = getRequestId(request);

    if (request.method !== "GET") {
      return jsonError({
        requestId,
        status: 405,
        code: "method_not_allowed",
        message: "Method not allowed.",
      });
    }

    try {
      const url = new URL(request.url);
      const providerId = url.searchParams.get("provider_id")?.trim();
      const userId = url.searchParams.get("user_id")?.trim();

      if (!providerId || !userId) {
        throw new Error("provider_id and user_id are required.");
      }

      const auth = authenticateProviderRequest({
        request,
        providerId,
        requestId,
      });

      if (!auth.ok) {
        return jsonError({
          requestId,
          status: auth.status,
          code: auth.error.code,
          message: auth.error.message,
        });
      }

      const result = await getProviderThreadMemory({
        providerId,
        userId,
        threadId: params.threadId,
      });

      return jsonResponse({
        requestId,
        body: result as unknown as Record<string, unknown>,
      });
    } catch (error) {
      return jsonError({
        requestId,
        status: 400,
        code: "invalid_request",
        message:
          error instanceof Error ? error.message : "Unable to load thread memory.",
      });
    }
  }),
];
