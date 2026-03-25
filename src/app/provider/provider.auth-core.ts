import type { ProviderConfig } from "./provider.types";

type ProviderAuthErrorCode = "unauthenticated" | "forbidden";

type ProviderAuthFailure = {
  ok: false;
  status: number;
  error: {
    code: ProviderAuthErrorCode;
    message: string;
  };
};

type ProviderAuthSuccess = {
  ok: true;
  providerId: string;
  providerConfig: ProviderConfig;
};

export type ProviderAuthResult = ProviderAuthFailure | ProviderAuthSuccess;

const DEFAULT_CONFIG_LABEL = "TEXTY_EXECUTOR_CONFIG or TEXTY_INTEGRATION_CONFIG";

type ProviderAuditLogger = (event: {
  event: string;
  requestId?: string;
  providerId: string;
  status: "ok" | "error";
  code?: string;
  detail?: string;
}) => void;

const normalizeBaseUrl = (rawBaseUrl: string) => {
  const trimmed = rawBaseUrl.trim();

  if (!trimmed) {
    throw new Error("Provider baseUrl must not be empty.");
  }

  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Provider baseUrl is not a valid URL: ${trimmed}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Provider baseUrl must use http or https: ${trimmed}`,
    );
  }

  if (parsed.search || parsed.hash) {
    throw new Error(
      `Provider baseUrl must not include query or hash: ${trimmed}`,
    );
  }

  return parsed.toString().replace(/\/$/, "");
};

export const normalizeProviderConfigMap = (
  rawConfig: string | undefined | null,
  configLabel = DEFAULT_CONFIG_LABEL,
): Record<string, ProviderConfig> => {
  if (!rawConfig?.trim()) {
    return {};
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawConfig);
  } catch {
    throw new Error(`${configLabel} is not valid JSON.`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${configLabel} must be a JSON object.`);
  }

  const entries = Object.entries(
    parsed as Record<string, string | ProviderConfig>,
  ).map(([providerId, value]) => {
    const normalizedProviderId = providerId.trim();

    if (!normalizedProviderId) {
      throw new Error(`${configLabel} contains an empty provider id.`);
    }

    const config =
      typeof value === "string"
        ? { token: value }
        : value && typeof value === "object"
          ? value
          : null;

    if (!config) {
      throw new Error(
        `Provider config for ${normalizedProviderId} must be a string or object.`,
      );
    }

    const token = config.token?.trim();

    if (!token) {
      throw new Error(
        `Provider config for ${normalizedProviderId} is missing a token.`,
      );
    }

    return [
      normalizedProviderId,
      {
        token,
        ...(typeof config.baseUrl === "string"
          ? { baseUrl: normalizeBaseUrl(config.baseUrl) }
          : {}),
      },
    ] as const;
  });

  return Object.fromEntries(entries);
};

export const getBearerToken = (request: Request) => {
  const authorization = request.headers.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice("Bearer ".length).trim();
  return token || null;
};

export const authenticateProviderRequestWithConfigs = ({
  request,
  providerId,
  requestId,
  providerConfigs,
  logAudit,
}: {
  request: Request;
  providerId?: string;
  requestId?: string;
  providerConfigs: Record<string, ProviderConfig>;
  logAudit?: ProviderAuditLogger;
}): ProviderAuthResult => {
  const token = getBearerToken(request);

  if (!token) {
    logAudit?.({
      event: "provider.auth.failed",
      requestId,
      providerId: providerId ?? "unknown",
      status: "error",
      code: "unauthenticated",
      detail: "Missing bearer token",
    });
    return {
      ok: false,
      status: 401,
      error: {
        code: "unauthenticated",
        message: "Missing bearer token.",
      },
    };
  }

  const matchingProviderIds = Object.entries(providerConfigs)
    .filter(([, providerConfig]) => providerConfig.token === token)
    .map(([configuredProviderId]) => configuredProviderId);

  const resolvedProviderId = providerId?.trim()
    ? providerId
    : matchingProviderIds.length === 1
      ? matchingProviderIds[0]
      : null;

  if (!resolvedProviderId) {
    logAudit?.({
      event: "provider.auth.failed",
      requestId,
      providerId: providerId ?? "unknown",
      status: "error",
      code: "forbidden",
      detail:
        matchingProviderIds.length > 1
          ? "Ambiguous provider token"
          : "Unknown provider token",
    });
    return {
      ok: false,
      status: 403,
      error: {
        code: "forbidden",
        message:
          matchingProviderIds.length > 1
            ? "Bearer token matches multiple setups. Include integration_id until the token is unique."
            : "Unknown provider.",
      },
    };
  }

  if (providerId?.trim() && !matchingProviderIds.includes(providerId)) {
    logAudit?.({
      event: "provider.auth.failed",
      requestId,
      providerId,
      status: "error",
      code: "forbidden",
      detail: "Bearer token does not match requested provider",
    });
    return {
      ok: false,
      status: 403,
      error: {
        code: "forbidden",
        message: "Invalid provider token.",
      },
    };
  }

  const providerConfig = providerConfigs[resolvedProviderId];

  if (!providerConfig) {
    logAudit?.({
      event: "provider.auth.failed",
      requestId,
      providerId: resolvedProviderId,
      status: "error",
      code: "forbidden",
      detail: "Unknown provider",
    });
    return {
      ok: false,
      status: 403,
      error: {
        code: "forbidden",
        message: "Unknown provider.",
      },
    };
  }

  if (providerConfig.token !== token) {
    logAudit?.({
      event: "provider.auth.failed",
      requestId,
      providerId: resolvedProviderId,
      status: "error",
      code: "forbidden",
      detail: "Invalid provider token",
    });
    return {
      ok: false,
      status: 403,
      error: {
        code: "forbidden",
        message: "Invalid provider token.",
      },
    };
  }

  logAudit?.({
    event: "provider.auth.succeeded",
    requestId,
    providerId: resolvedProviderId,
    status: "ok",
  });

  return {
    ok: true,
    providerId: resolvedProviderId,
    providerConfig,
  };
};
