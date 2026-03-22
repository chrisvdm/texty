import { env } from "cloudflare:workers";

import {
  authenticateProviderRequestWithConfigs,
  normalizeProviderConfigMap,
} from "./provider.auth-core";
import { logProviderAudit } from "./provider.audit";
import type { ProviderConfig } from "./provider.types";

const providerEnv = env as typeof env & {
  TEXTY_PROVIDER_CONFIG?: string;
};

let cachedRawConfig: string | undefined;
let cachedProviderConfigs: Record<string, ProviderConfig> = {};

const getProviderConfigs = () => {
  const rawConfig = providerEnv.TEXTY_PROVIDER_CONFIG;

  if (rawConfig === cachedRawConfig) {
    return cachedProviderConfigs;
  }

  cachedRawConfig = rawConfig;
  cachedProviderConfigs = normalizeProviderConfigMap(rawConfig);
  return cachedProviderConfigs;
};

export const authenticateProviderRequest = ({
  request,
  providerId,
  requestId,
}: {
  request: Request;
  providerId: string;
  requestId?: string;
}) => {
  return authenticateProviderRequestWithConfigs({
    request,
    providerId,
    requestId,
    providerConfigs: getProviderConfigs(),
    logAudit: logProviderAudit,
  });
};
