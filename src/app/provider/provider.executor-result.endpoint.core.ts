import type {
  ProviderExecutorResultInput,
  ProviderUserContext,
} from "./provider.types.ts";

type AuthResult =
  | {
      ok: true;
      providerConfig: {
        token: string;
        baseUrl?: string;
      };
    }
  | {
      ok: false;
      status: number;
      error: {
        code: string;
        message: string;
      };
    };

export type ExecutorResultEndpointDeps = {
  getRequestId: (request: Request) => string;
  readJson: <T>(request: Request) => Promise<T>;
  jsonResponse: (input: {
    requestId: string;
    body: Record<string, unknown>;
    status?: number;
  }) => Response;
  jsonError: (input: {
    requestId: string;
    status: number;
    code: string;
    message: string;
    details?: unknown;
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
  handleProviderExecutorResult: (input: {
    input: ProviderExecutorResultInput;
    providerConfig: {
      token: string;
      baseUrl?: string;
    };
    requestId?: string;
  }) => Promise<Record<string, unknown>>;
};

export const createHandleExecutorResultEndpoint = (
  deps: ExecutorResultEndpointDeps,
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
      const input = await deps.readJson<ProviderExecutorResultInput>(request);
      await deps.loadOrCreateProviderUserContext({
        providerId: input.provider_id,
        userId: input.user_id,
      });
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

      const result = await deps.handleProviderExecutorResult({
        input,
        providerConfig: auth.providerConfig,
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
