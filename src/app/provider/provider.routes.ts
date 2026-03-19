import { route } from "rwsdk/router";

import { authenticateProviderRequest } from "./provider-auth";
import {
  createProviderThread,
  deleteProviderThread,
  getProviderMemory,
  getProviderThreadMemory,
  handleProviderConversationInput,
  isProviderRateLimitError,
  listProviderThreads,
  renameProviderThread,
  syncProviderTools,
} from "./provider.service";
import type {
  ProviderConversationInput,
  ProviderToolSyncInput,
} from "./provider.types";

const getRequestId = (request: Request) =>
  request.headers.get("X-Request-Id")?.trim() || crypto.randomUUID();

const jsonResponse = ({
  requestId,
  body,
  status = 200,
  retryAfterSeconds,
}: {
  requestId: string;
  body: Record<string, unknown>;
  status?: number;
  retryAfterSeconds?: number;
}) =>
  Response.json(
    {
      ...body,
      request_id: requestId,
    },
    {
      status,
      headers: {
        "X-Request-Id": requestId,
        ...(typeof retryAfterSeconds === "number"
          ? {
              "Retry-After": String(retryAfterSeconds),
            }
          : {}),
      },
    },
  );

const jsonError = ({
  requestId,
  status,
  code,
  message,
  details = null,
  retryAfterSeconds,
}: {
  requestId: string;
  status: number;
  code: string;
  message: string;
  details?: unknown;
  retryAfterSeconds?: number;
}) =>
  jsonResponse({
    requestId,
    status,
    retryAfterSeconds,
    body: {
      error: {
        code,
        message,
        details,
      },
    },
  });

const readJson = async <T,>(request: Request) => {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
};

export const providerRoutes = [
  route(
    "/api/v1/providers/:providerId/users/:userId/tools/sync",
    async ({ request, params }) => {
      const requestId = getRequestId(request);

      if (request.method !== "POST") {
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
        const input = await readJson<ProviderToolSyncInput>(request);

        if (
          input.provider_id !== params.providerId ||
          input.user_id !== params.userId
        ) {
          return jsonError({
            requestId,
            status: 403,
            code: "forbidden",
            message: "Provider or user mismatch.",
          });
        }

        const result = await syncProviderTools(input, requestId);
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
            error instanceof Error ? error.message : "Invalid request payload.",
        });
      }
    },
  ),
  route("/api/v1/conversation/input", async ({ request }) => {
    const requestId = getRequestId(request);

    if (request.method !== "POST") {
      return jsonError({
        requestId,
        status: 405,
        code: "method_not_allowed",
        message: "Method not allowed.",
      });
    }

    try {
      const input = await readJson<ProviderConversationInput>(request);
      const auth = authenticateProviderRequest({
        request,
        providerId: input.provider_id,
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

      const result = await handleProviderConversationInput({
        input,
        providerConfig: auth.providerConfig,
        requestId,
      });
      return jsonResponse({
        requestId,
        body: result as unknown as Record<string, unknown>,
      });
    } catch (error) {
      if (isProviderRateLimitError(error)) {
        return jsonError({
          requestId,
          status: 429,
          code: "rate_limited",
          message: "Too many conversation requests. Try again shortly.",
          details: {
            retry_after_seconds: error.retryAfterSeconds,
          },
          retryAfterSeconds: error.retryAfterSeconds,
        });
      }

      return jsonError({
        requestId,
        status: 400,
        code: "invalid_request",
        message:
          error instanceof Error ? error.message : "Invalid request payload.",
      });
    }
  }),
  route("/api/v1/threads", async ({ request }) => {
    const requestId = getRequestId(request);

    if (request.method !== "POST") {
      return jsonError({
        requestId,
        status: 405,
        code: "method_not_allowed",
        message: "Method not allowed.",
      });
    }

    try {
      const input = await readJson<{
        provider_id: string;
        user_id: string;
        title?: string;
        is_private?: boolean;
        channel: {
          type: string;
          id: string;
        };
      }>(request);
      const auth = authenticateProviderRequest({
        request,
        providerId: input.provider_id,
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

      const result = await createProviderThread({
        providerId: input.provider_id,
        userId: input.user_id,
        title: input.title,
        isPrivate: input.is_private,
        channel: input.channel,
        requestId,
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
          error instanceof Error ? error.message : "Invalid request payload.",
      });
    }
  }),
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
  route("/api/v1/threads/:threadId", async ({ request, params }) => {
    const requestId = getRequestId(request);

    if (request.method !== "PATCH" && request.method !== "DELETE") {
      return jsonError({
        requestId,
        status: 405,
        code: "method_not_allowed",
        message: "Method not allowed.",
      });
    }

    try {
      const input = await readJson<{
        provider_id: string;
        user_id: string;
        title?: string;
      }>(request);
      const auth = authenticateProviderRequest({
        request,
        providerId: input.provider_id,
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

      if (request.method === "PATCH") {
        const result = await renameProviderThread({
          providerId: input.provider_id,
          userId: input.user_id,
          threadId: params.threadId,
          title: input.title ?? "",
          requestId,
        });

        return jsonResponse({
          requestId,
          body: result as unknown as Record<string, unknown>,
        });
      }

      const result = await deleteProviderThread({
        providerId: input.provider_id,
        userId: input.user_id,
        threadId: params.threadId,
        requestId,
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
          error instanceof Error ? error.message : "Invalid request payload.",
      });
    }
  }),
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
