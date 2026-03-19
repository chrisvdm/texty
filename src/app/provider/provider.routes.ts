import { route } from "rwsdk/router";

import { authenticateProviderRequest } from "./provider-auth";
import {
  createProviderThread,
  deleteProviderThread,
  getProviderMemory,
  getProviderThreadMemory,
  handleProviderConversationInput,
  listProviderThreads,
  renameProviderThread,
  syncProviderTools,
} from "./provider.service";
import type {
  ProviderConversationInput,
  ProviderToolSyncInput,
} from "./provider.types";

const jsonError = ({
  status,
  code,
  message,
}: {
  status: number;
  code: string;
  message: string;
}) =>
  Response.json(
    {
      error: {
        code,
        message,
        details: null,
      },
    },
    { status },
  );

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
      if (request.method !== "POST") {
        return jsonError({
          status: 405,
          code: "method_not_allowed",
          message: "Method not allowed.",
        });
      }

      const auth = authenticateProviderRequest({
        request,
        providerId: params.providerId,
      });

      if (!auth.ok) {
        return jsonError({
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
            status: 403,
            code: "forbidden",
            message: "Provider or user mismatch.",
          });
        }

        const result = await syncProviderTools(input);
        return Response.json(result);
      } catch (error) {
        return jsonError({
          status: 400,
          code: "invalid_request",
          message:
            error instanceof Error ? error.message : "Invalid request payload.",
        });
      }
    },
  ),
  route("/api/v1/conversation/input", async ({ request }) => {
    if (request.method !== "POST") {
      return jsonError({
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
      });

      if (!auth.ok) {
        return jsonError({
          status: auth.status,
          code: auth.error.code,
          message: auth.error.message,
        });
      }

      const result = await handleProviderConversationInput({
        input,
        providerConfig: auth.providerConfig,
      });
      return Response.json(result);
    } catch (error) {
      return jsonError({
        status: 400,
        code: "invalid_request",
        message:
          error instanceof Error ? error.message : "Invalid request payload.",
      });
    }
  }),
  route("/api/v1/threads", async ({ request }) => {
    if (request.method !== "POST") {
      return jsonError({
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
      });

      if (!auth.ok) {
        return jsonError({
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
      });

      return Response.json(result);
    } catch (error) {
      return jsonError({
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
      if (request.method !== "GET") {
        return jsonError({
          status: 405,
          code: "method_not_allowed",
          message: "Method not allowed.",
        });
      }

      const auth = authenticateProviderRequest({
        request,
        providerId: params.providerId,
      });

      if (!auth.ok) {
        return jsonError({
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
        return Response.json(result);
      } catch (error) {
        return jsonError({
          status: 400,
          code: "invalid_request",
          message:
            error instanceof Error ? error.message : "Unable to list threads.",
        });
      }
    },
  ),
  route("/api/v1/threads/:threadId", async ({ request, params }) => {
    if (request.method !== "PATCH" && request.method !== "DELETE") {
      return jsonError({
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
      });

      if (!auth.ok) {
        return jsonError({
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
        });

        return Response.json(result);
      }

      const result = await deleteProviderThread({
        providerId: input.provider_id,
        userId: input.user_id,
        threadId: params.threadId,
      });

      return Response.json(result);
    } catch (error) {
      return jsonError({
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
      if (request.method !== "GET") {
        return jsonError({
          status: 405,
          code: "method_not_allowed",
          message: "Method not allowed.",
        });
      }

      const auth = authenticateProviderRequest({
        request,
        providerId: params.providerId,
      });

      if (!auth.ok) {
        return jsonError({
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
        return Response.json(result);
      } catch (error) {
        return jsonError({
          status: 400,
          code: "invalid_request",
          message:
            error instanceof Error ? error.message : "Unable to load memory.",
        });
      }
    },
  ),
  route("/api/v1/threads/:threadId/memory", async ({ request, params }) => {
    if (request.method !== "GET") {
      return jsonError({
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
      });

      if (!auth.ok) {
        return jsonError({
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

      return Response.json(result);
    } catch (error) {
      return jsonError({
        status: 400,
        code: "invalid_request",
        message:
          error instanceof Error ? error.message : "Unable to load thread memory.",
      });
    }
  }),
];
