import { env } from "cloudflare:workers";

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
    return {
      ok: false as const,
      status: 403,
      error: {
        code: "forbidden",
        message: "Invalid provider token.",
      },
    };
  }

  return {
    ok: true as const,
    providerConfig,
  };
};
