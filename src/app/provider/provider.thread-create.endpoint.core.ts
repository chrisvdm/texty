import type { ProviderUserContext } from "./provider.types.ts";
import {
  requireNonEmptyString,
  resolveProviderIdFromInput,
} from "./provider.endpoint-input.ts";

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

type ThreadCreateInput = {
  integration_id?: string;
  user_id: string;
  title?: string;
  is_private?: boolean;
  channel: {
    type: string;
    id: string;
  };
};

export type ThreadCreateEndpointDeps = {
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
  createProviderThread: (input: {
    providerId: string;
    userId: string;
    title?: string;
    isPrivate?: boolean;
    channel: {
      type: string;
      id: string;
    };
    requestId?: string;
  }) => Promise<Record<string, unknown>>;
};

export const createHandleThreadCreateEndpoint = (
  deps: ThreadCreateEndpointDeps,
) => {
  return async ({ request }: { request: Request }) => {
    const requestId = deps.getRequestId(request);

    if (request.method !== "POST") {
      return deps.jsonError({
        requestId,
        status: 405,
        code: "method_not_allowed",
        message: "Method not allowed.",
      });
    }

    try {
      const input = await deps.readJson<ThreadCreateInput>(request);
      const idempotencyKey = deps.getIdempotencyHeader(request);
      const auth = await deps.authenticateProviderRequest({
        request,
        providerId: input.integration_id,
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

      const providerId = resolveProviderIdFromInput({
        explicitProviderId: input.integration_id,
        authenticatedProviderId: auth.providerId,
      });
      const userId = requireNonEmptyString(input.user_id, "user_id");

      if (idempotencyKey) {
        const context = await deps.loadOrCreateProviderUserContext({
          providerId,
          userId,
        });
        const storageKey = deps.buildIdempotencyKey({
          method: request.method,
          path: "/api/v1/threads",
          idempotencyKey,
        });
        const requestHash = await deps.hashIdempotencyRequest({
          method: request.method,
          path: storageKey,
          body: {
            ...input,
            integration_id: providerId,
            user_id: userId,
          },
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

        const result = await deps.createProviderThread({
          providerId,
          userId,
          title: input.title,
          isPrivate: input.is_private,
          channel: input.channel,
          requestId,
        });
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

      const result = await deps.createProviderThread({
        providerId,
        userId,
        title: input.title,
        isPrivate: input.is_private,
        channel: input.channel,
        requestId,
      });

      return deps.jsonResponse({
        requestId,
        body: result,
      });
    } catch (error) {
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
