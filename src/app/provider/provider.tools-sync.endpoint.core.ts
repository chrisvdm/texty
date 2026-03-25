import type { ProviderToolSyncInput, ProviderUserContext } from "./provider.types.ts";
import {
  requireNonEmptyString,
  resolveProviderIdFromInput,
} from "./provider.endpoint-input.ts";

type NormalizedProviderToolSyncInput = ProviderToolSyncInput & {
  integration_id: string;
};

type AuthResult =
  | {
      ok: true;
      providerId: string;
    }
  | {
      ok: false;
      status: number;
      error: {
        code: string;
        message: string;
      };
    };

type ProviderRateLimitShape = {
  retryAfterSeconds: number;
};

export type ToolsSyncEndpointDeps = {
  getRequestId: (request: Request) => string;
  getIdempotencyHeader: (request: Request) => string | null;
  readJson: <T>(request: Request) => Promise<T>;
  jsonResponse: (input: {
    requestId: string;
    body: Record<string, unknown>;
    status?: number;
    retryAfterSeconds?: number;
    idempotentReplay?: boolean;
  }) => Response;
  jsonError: (input: {
    requestId: string;
    status: number;
    code: string;
    message: string;
    details?: unknown;
    retryAfterSeconds?: number;
  }) => Response;
  replayIdempotentResponse: (input: {
    requestId: string;
    replay: {
      status: number;
      body: Record<string, unknown>;
    };
  }) => Response;
  authenticateProviderRequest: (input: {
    request: Request;
    providerId?: string;
    requestId: string;
  }) => AuthResult | Promise<AuthResult>;
  loadOrCreateProviderUserContext: (input: {
    providerId: string;
    userId: string;
  }) => Promise<ProviderUserContext>;
  saveProviderUserContext: (
    context: ProviderUserContext,
  ) => Promise<ProviderUserContext>;
  buildIdempotencyKey: (input: {
    method: string;
    path: string;
    idempotencyKey: string;
  }) => string;
  hashIdempotencyRequest: (input: {
    method: string;
    path: string;
    body: unknown;
  }) => Promise<string>;
  readIdempotencyReplay: (input: {
    context: ProviderUserContext;
    storageKey: string;
    requestHash: string;
  }) =>
    | { kind: "miss" }
    | { kind: "conflict" }
    | { kind: "replay"; status: number; body: Record<string, unknown> };
  storeIdempotencyReplay: (input: {
    context: ProviderUserContext;
    storageKey: string;
    requestHash: string;
    status: number;
    body: Record<string, unknown>;
    now?: string;
  }) => ProviderUserContext;
  syncProviderTools: (
    input: NormalizedProviderToolSyncInput,
    requestId?: string,
  ) => Promise<Record<string, unknown>>;
  isProviderRateLimitError: (
    error: unknown,
  ) => error is Error & ProviderRateLimitShape;
};

export const createHandleToolsSyncEndpoint = (deps: ToolsSyncEndpointDeps) => {
  return async ({
    request,
    params,
  }: {
    request: Request;
    params: {
      integrationId?: string;
      userId?: string;
    };
  }) => {
    const requestId = deps.getRequestId(request);

    if (request.method !== "POST") {
      return deps.jsonError({
        requestId,
        status: 405,
        code: "method_not_allowed",
        message: "Method not allowed.",
      });
    }

    const auth = await deps.authenticateProviderRequest({
      request,
      providerId: params.integrationId,
      requestId,
    });

    if (!auth.ok) {
      return deps.jsonError({
        requestId,
        status: auth.status,
        code: auth.error.code,
        message: auth.error.message,
      });
    }

    try {
      const input = await deps.readJson<ProviderToolSyncInput>(request);
      const idempotencyKey = deps.getIdempotencyHeader(request);
      const providerId = resolveProviderIdFromInput({
        explicitProviderId: input.integration_id ?? params.integrationId,
        authenticatedProviderId: auth.providerId,
      });
      const userId = requireNonEmptyString(input.user_id, "user_id");
      const normalizedInput = {
        ...input,
        integration_id: providerId,
        user_id: userId,
      } satisfies NormalizedProviderToolSyncInput;

      if (params.integrationId && providerId !== params.integrationId) {
        return deps.jsonError({
          requestId,
          status: 403,
          code: "forbidden",
          message: "Integration mismatch.",
        });
      }

      if (params.userId && userId !== params.userId) {
        return deps.jsonError({
          requestId,
          status: 403,
          code: "forbidden",
          message: "User mismatch.",
        });
      }

      if (idempotencyKey) {
        const context = await deps.loadOrCreateProviderUserContext({
          providerId,
          userId,
        });
        const storageKey = deps.buildIdempotencyKey({
          method: request.method,
          path:
            params.integrationId && params.userId
              ? `/api/v1/integrations/${params.integrationId}/users/${params.userId}/tools/sync`
              : params.userId
                ? `/api/v1/users/${params.userId}/tools/sync`
                : "/api/v1/tools/sync",
          idempotencyKey,
        });
        const requestHash = await deps.hashIdempotencyRequest({
          method: request.method,
          path: storageKey,
          body: normalizedInput,
        });
        const replay = deps.readIdempotencyReplay({
          context,
          storageKey,
          requestHash,
        });

        if (replay.kind === "replay") {
          return deps.replayIdempotentResponse({ requestId, replay });
        }

        if (replay.kind === "conflict") {
          return deps.jsonError({
            requestId,
            status: 409,
            code: "idempotency_conflict",
            message: "Idempotency key was reused with a different request body.",
          });
        }

        const result = await deps.syncProviderTools(normalizedInput, requestId);
        const nextContext = deps.storeIdempotencyReplay({
          context: await deps.loadOrCreateProviderUserContext({
            providerId,
            userId,
          }),
          storageKey,
          requestHash,
          status: 200,
          body: result,
        });
        await deps.saveProviderUserContext(nextContext);

        return deps.jsonResponse({
          requestId,
          body: result,
        });
      }

      const result = await deps.syncProviderTools(normalizedInput, requestId);
      return deps.jsonResponse({
        requestId,
        body: result,
      });
    } catch (error) {
      if (deps.isProviderRateLimitError(error)) {
        return deps.jsonError({
          requestId,
          status: 429,
          code: "rate_limited",
          message: "Too many tool sync requests. Try again shortly.",
          details: {
            retry_after_seconds: error.retryAfterSeconds,
          },
          retryAfterSeconds: error.retryAfterSeconds,
        });
      }

      return deps.jsonError({
        requestId,
        status: 400,
        code: "invalid_request",
        message:
          error instanceof Error ? error.message : "Invalid request payload.",
      });
    }
  };
};
