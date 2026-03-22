import type { ProviderUserContext } from "./provider.types.ts";

type AuthResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      status: number;
      error: {
        code: string;
        message: string;
      };
    };

type ThreadMutationInput = {
  provider_id: string;
  user_id: string;
  title?: string;
};

export type ThreadMutationEndpointDeps = {
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
    providerId: string;
    requestId: string;
  }) => AuthResult;
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
  renameProviderThread: (input: {
    providerId: string;
    userId: string;
    threadId: string;
    title: string;
    requestId?: string;
  }) => Promise<Record<string, unknown>>;
  deleteProviderThread: (input: {
    providerId: string;
    userId: string;
    threadId: string;
    requestId?: string;
  }) => Promise<Record<string, unknown>>;
};

export const createHandleThreadMutationEndpoint = (
  deps: ThreadMutationEndpointDeps,
) => {
  return async ({
    request,
    params,
  }: {
    request: Request;
    params: {
      threadId: string;
    };
  }) => {
    const requestId = deps.getRequestId(request);

    if (request.method !== "PATCH" && request.method !== "DELETE") {
      return deps.jsonError({
        requestId,
        status: 405,
        code: "method_not_allowed",
        message: "Method not allowed.",
      });
    }

    try {
      const input = await deps.readJson<ThreadMutationInput>(request);
      const idempotencyKey = deps.getIdempotencyHeader(request);
      const auth = deps.authenticateProviderRequest({
        request,
        providerId: input.provider_id,
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

      const storageKey = idempotencyKey
        ? deps.buildIdempotencyKey({
            method: request.method,
            path: `/api/v1/threads/${params.threadId}`,
            idempotencyKey,
          })
        : null;
      const requestHash =
        idempotencyKey && storageKey
          ? await deps.hashIdempotencyRequest({
              method: request.method,
              path: storageKey,
              body: input,
            })
          : null;
      const context =
        idempotencyKey && storageKey && requestHash
          ? await deps.loadOrCreateProviderUserContext({
              providerId: input.provider_id,
              userId: input.user_id,
            })
          : null;
      const replay =
        context && storageKey && requestHash
          ? deps.readIdempotencyReplay({
              context,
              storageKey,
              requestHash,
            })
          : null;

      if (replay?.kind === "replay") {
        return deps.replayIdempotentResponse({ requestId, replay });
      }

      if (replay?.kind === "conflict") {
        return deps.jsonError({
          requestId,
          status: 409,
          code: "idempotency_conflict",
          message: "Idempotency key was reused with a different request body.",
        });
      }

      if (request.method === "PATCH") {
        const result = await deps.renameProviderThread({
          providerId: input.provider_id,
          userId: input.user_id,
          threadId: params.threadId,
          title: input.title ?? "",
          requestId,
        });

        if (context && storageKey && requestHash) {
          await deps.saveProviderUserContext(
            deps.storeIdempotencyReplay({
              context: await deps.loadOrCreateProviderUserContext({
                providerId: input.provider_id,
                userId: input.user_id,
              }),
              storageKey,
              requestHash,
              status: 200,
              body: result,
            }),
          );
        }

        return deps.jsonResponse({
          requestId,
          body: result,
        });
      }

      const result = await deps.deleteProviderThread({
        providerId: input.provider_id,
        userId: input.user_id,
        threadId: params.threadId,
        requestId,
      });

      if (context && storageKey && requestHash) {
        await deps.saveProviderUserContext(
          deps.storeIdempotencyReplay({
            context: await deps.loadOrCreateProviderUserContext({
              providerId: input.provider_id,
              userId: input.user_id,
            }),
            storageKey,
            requestHash,
            status: 200,
            body: result,
          }),
        );
      }

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
