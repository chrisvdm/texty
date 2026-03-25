import { DurableObject } from "cloudflare:workers";

import type {
  FamiliarAccount,
  FamiliarAccountRegistryState,
  FamiliarApiToken,
  FamiliarTokenAuth,
} from "./account.types";

const ACCOUNT_REGISTRY_KEY = "account-registry";

const createInitialRegistryState = (): FamiliarAccountRegistryState => ({
  accounts: {},
  tokens: {},
  tokenIndex: {},
});

export class AccountRegistryDurableObject extends DurableObject {
  private async loadState() {
    const existing =
      await this.ctx.storage.get<FamiliarAccountRegistryState>(ACCOUNT_REGISTRY_KEY);

    return existing ?? createInitialRegistryState();
  }

  private async saveState(state: FamiliarAccountRegistryState) {
    await this.ctx.storage.put(ACCOUNT_REGISTRY_KEY, state);
    return state;
  }

  async createAccount(input: {
    account: FamiliarAccount;
    token: FamiliarApiToken;
  }) {
    const state = await this.loadState();

    state.accounts[input.account.id] = input.account;
    state.tokens[input.token.id] = input.token;
    state.tokenIndex[input.token.tokenHash] = input.token.id;

    await this.saveState(state);

    return {
      account: input.account,
      token: input.token,
    };
  }

  async issueToken(input: { accountId: string; token: FamiliarApiToken }) {
    const state = await this.loadState();
    const account = state.accounts[input.accountId];

    if (!account) {
      return { error: "Account not found." };
    }

    state.tokens[input.token.id] = input.token;
    state.tokenIndex[input.token.tokenHash] = input.token.id;

    await this.saveState(state);

    return {
      account,
      token: input.token,
    };
  }

  async authenticateToken(input: { tokenHash: string }) {
    const state = await this.loadState();
    const tokenId = state.tokenIndex[input.tokenHash];

    if (!tokenId) {
      return { error: "Token not found." };
    }

    const token = state.tokens[tokenId];

    if (!token || token.revokedAt) {
      return { error: "Token not found." };
    }

    const account = state.accounts[token.accountId];

    if (!account) {
      return { error: "Account not found." };
    }

    const nextToken = {
      ...token,
      lastUsedAt: new Date().toISOString(),
    };

    state.tokens[token.id] = nextToken;
    await this.saveState(state);

    const auth: FamiliarTokenAuth = {
      account,
      token: nextToken,
    };

    return { value: auth };
  }
}
