import { env } from "cloudflare:workers";

import { logProviderAudit } from "./provider.audit";
import type { ProviderConfig } from "./provider.types";

const providerEnv = env as typeof env & {
  TEXTY_PROVIDER_CONFIG?: string;
};

const parseProviderConfig = (): Record<string, ProviderConfig> => {
  const rawConfig = providerEnv.TEXTY_PROVIDER_CONFIG;

  if (!rawConfig?.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawConfig) as Record<
      string,
      string | ProviderConfig
    >;

    return Object.fromEntries(
      Object.entries(parsed).map(([providerId, value]) => [
        providerId,
        typeof value === "string" ? { token: value } : value,
      ]),
    );
  } catch {
    throw new Error("TEXTY_PROVIDER_CONFIG is not valid JSON.");
  }
};

const getBearerToken = (request: Request) => {
  const authorization = request.headers.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
};

export const authenticateProviderRequest = ({
  request,
  providerId,
}: {
  request: Request;
  providerId: string;
}) => {
  const token = getBearerToken(request);

  if (!token) {
    logProviderAudit({
      event: "provider.auth.failed",
      providerId,
      status: "error",
      code: "unauthenticated",
      detail: "Missing bearer token",
    });
    return {
      ok: false as const,
      status: 401,
      error: {
        code: "unauthenticated",
        message: "Missing bearer token.",
      },
    };
  }

  const providers = parseProviderConfig();
  const providerConfig = providers[providerId];

  if (!providerConfig) {
    logProviderAudit({
      event: "provider.auth.failed",
      providerId,
      status: "error",
      code: "forbidden",
      detail: "Unknown provider",
    });
    return {
      ok: false as const,
      status: 403,
      error: {
        code: "forbidden",
        message: "Unknown provider.",
      },
    };
  }

  if (providerConfig.token !== token) {
    logProviderAudit({
      event: "provider.auth.failed",
      providerId,
      status: "error",
      code: "forbidden",
      detail: "Invalid provider token",
    });
    return {
      ok: false as const,
      status: 403,
      error: {
        code: "forbidden",
        message: "Invalid provider token.",
      },
    };
  }

  logProviderAudit({
    event: "provider.auth.succeeded",
    providerId,
    status: "ok",
  });

  return {
    ok: true as const,
    providerConfig,
  };
};
