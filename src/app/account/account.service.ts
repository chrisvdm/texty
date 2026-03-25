import { env } from "cloudflare:workers";

import type {
  FamiliarAccount,
  FamiliarApiToken,
  FamiliarTokenAuth,
} from "./account.types";

type AccountRegistryStub = {
  createAccount: (input: {
    account: FamiliarAccount;
    token: FamiliarApiToken;
  }) => Promise<{
    account: FamiliarAccount;
    token: FamiliarApiToken;
  }>;
  authenticateToken: (input: {
    tokenHash: string;
  }) => Promise<{ value: FamiliarTokenAuth } | { error: string }>;
};

const accountEnv = env as typeof env & {
  ACCOUNT_REGISTRY: DurableObjectNamespace;
};

const encoder = new TextEncoder();

const getAccountRegistryStub = () => {
  const id = accountEnv.ACCOUNT_REGISTRY.idFromName("account-registry");
  return accountEnv.ACCOUNT_REGISTRY.get(id) as unknown as AccountRegistryStub;
};

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");

const randomHex = (length: number) =>
  toHex(crypto.getRandomValues(new Uint8Array(Math.ceil(length / 2)))).slice(
    0,
    length,
  );

export const hashApiToken = async (token: string) => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return toHex(new Uint8Array(digest));
};

const createApiTokenValue = () => `fam_${randomHex(48)}`;

const createAccountId = () => `acct_${randomHex(24)}`;

const createSetupId = () => `setup_${randomHex(24)}`;

const createTokenRecord = async ({
  accountId,
}: {
  accountId: string;
}) => {
  const value = createApiTokenValue();
  const createdAt = new Date().toISOString();

  const token: FamiliarApiToken = {
    id: `tok_${randomHex(24)}`,
    accountId,
    prefix: value.slice(0, 8),
    lastFour: value.slice(-4),
    tokenHash: await hashApiToken(value),
    createdAt,
    lastUsedAt: null,
    revokedAt: null,
  };

  return {
    value,
    token,
  };
};

export const createAccountWithInitialToken = async ({
}: {
}) => {
  const account: FamiliarAccount = {
    id: createAccountId(),
    defaultSetupId: createSetupId(),
    createdAt: new Date().toISOString(),
  };
  const { value, token } = await createTokenRecord({
    accountId: account.id,
  });

  const result = await getAccountRegistryStub().createAccount({
    account,
    token,
  });

  return {
    account: result.account,
    token: {
      ...result.token,
      value,
    },
  };
};

export const authenticateAccountToken = async (token: string) => {
  const result = await getAccountRegistryStub().authenticateToken({
    tokenHash: await hashApiToken(token),
  });

  if ("error" in result) {
    return null;
  }

  return result.value;
};
