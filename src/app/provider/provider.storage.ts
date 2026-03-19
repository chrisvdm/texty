import { env } from "cloudflare:workers";

import { DEFAULT_MODEL } from "../chat/conversation.runtime";
import { createEmptyGlobalMemory } from "../chat/shared";
import type { ProviderUserContext } from "./provider.types";

type ProviderUserContextStub = {
  getContext: () => Promise<{ value: ProviderUserContext } | { error: string }>;
  saveContext: (data: ProviderUserContext) => Promise<ProviderUserContext>;
  deleteContext: () => Promise<void>;
};

const providerEnv = env as typeof env & {
  PROVIDER_USER_CONTEXTS: DurableObjectNamespace;
};

const getProviderUserStub = ({
  providerId,
  userId,
}: {
  providerId: string;
  userId: string;
}) => {
  const id = providerEnv.PROVIDER_USER_CONTEXTS.idFromName(
    `${providerId}:${userId}`,
  );
  return providerEnv.PROVIDER_USER_CONTEXTS.get(id) as unknown as ProviderUserContextStub;
};

export const createProviderUserContext = ({
  providerId,
  userId,
}: {
  providerId: string;
  userId: string;
}): ProviderUserContext => {
  const now = new Date().toISOString();

  return {
    providerId,
    userId,
    selectedModel: DEFAULT_MODEL,
    memoryPolicy: {
      mode: "provider_user",
    },
    globalMemory: createEmptyGlobalMemory(),
    threads: [],
    allowedTools: [],
    channels: {},
    createdAt: now,
    updatedAt: now,
  };
};

export const loadProviderUserContext = async ({
  providerId,
  userId,
}: {
  providerId: string;
  userId: string;
}) => {
  const result = await getProviderUserStub({ providerId, userId }).getContext();

  if ("error" in result) {
    return null;
  }

  return result.value as ProviderUserContext;
};

export const loadOrCreateProviderUserContext = async ({
  providerId,
  userId,
}: {
  providerId: string;
  userId: string;
}) => {
  const existing = await loadProviderUserContext({ providerId, userId });

  if (existing) {
    return existing;
  }

  const created = createProviderUserContext({ providerId, userId });
  await saveProviderUserContext(created);
  return created;
};

export const saveProviderUserContext = async (context: ProviderUserContext) => {
  const normalized: ProviderUserContext = {
    ...context,
    updatedAt: new Date().toISOString(),
  };

  await getProviderUserStub({
    providerId: normalized.providerId,
    userId: normalized.userId,
  }).saveContext(normalized);

  return normalized;
};
