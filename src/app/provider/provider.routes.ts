import { route } from "rwsdk/router";

import { authenticateProviderRequest } from "./provider-auth";
import { handleConversationInputEndpoint } from "./provider.conversation.endpoint";
import { handleExecutorResultEndpoint } from "./provider.executor-result.endpoint";
import { handleThreadCreateEndpoint } from "./provider.thread-create.endpoint";
import { handleThreadMutationEndpoint } from "./provider.thread-mutation.endpoint";
import { handleToolsSyncEndpoint } from "./provider.tools-sync.endpoint";
import {
  getRequestId,
  jsonError,
  jsonResponse,
} from "./provider.http";
import {
  getProviderMemory,
  getProviderThreadMemory,
  listProviderThreads,
} from "./provider.service";

export const providerRoutes = [
  route("/api/v1/tools/sync", handleToolsSyncEndpoint),
  route("/api/v1/users/:userId/tools/sync", handleToolsSyncEndpoint),
  route(
    "/api/v1/integrations/:integrationId/users/:userId/tools/sync",
    handleToolsSyncEndpoint,
  ),
  route("/api/v1/input", handleConversationInputEndpoint),
  route("/api/v1/conversation/input", handleConversationInputEndpoint),
  route("/api/v1/webhooks/executor", handleExecutorResultEndpoint),
  route("/api/v1/threads", handleThreadCreateEndpoint),
  route("/api/v1/users/:userId/threads", async ({ request, params }) => {
    const requestId = getRequestId(request);

    if (request.method !== "GET") {
      return jsonError({
        requestId,
        status: 405,
        code: "method_not_allowed",
        message: "Method not allowed.",
      });
    }

    const auth = await authenticateProviderRequest({
      request,
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
        providerId: auth.providerId,
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
  }),
  route(
    "/api/v1/integrations/:integrationId/users/:userId/threads",
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

      const auth = await authenticateProviderRequest({
        request,
        providerId: params.integrationId,
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
          providerId: params.integrationId,
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
  route("/api/v1/users/:userId/memory", async ({ request, params }) => {
    const requestId = getRequestId(request);

    if (request.method !== "GET") {
      return jsonError({
        requestId,
        status: 405,
        code: "method_not_allowed",
        message: "Method not allowed.",
      });
    }

    const auth = await authenticateProviderRequest({
      request,
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
        providerId: auth.providerId,
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
  }),
  route(
    "/api/v1/integrations/:integrationId/users/:userId/memory",
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

      const auth = await authenticateProviderRequest({
        request,
        providerId: params.integrationId,
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
          providerId: params.integrationId,
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
      const userId = url.searchParams.get("user_id")?.trim();

      if (!userId) {
        throw new Error("user_id is required.");
      }

      const auth = await authenticateProviderRequest({
        request,
        providerId: url.searchParams.get("integration_id")?.trim(),
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
        providerId: auth.providerId,
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
