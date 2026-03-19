import { DurableObject } from "cloudflare:workers";

import type { ProviderUserContext } from "./provider.types";

const PROVIDER_USER_CONTEXT_KEY = "provider-user-context";

export class ProviderUserContextDurableObject extends DurableObject {
  async getContext() {
    const context = await this.ctx.storage.get<ProviderUserContext>(
      PROVIDER_USER_CONTEXT_KEY,
    );

    if (!context) {
      return { error: "Provider user context not found" };
    }

    return { value: context };
  }

  async saveContext(data: ProviderUserContext) {
    await this.ctx.storage.put(PROVIDER_USER_CONTEXT_KEY, data);
    return data;
  }

  async deleteContext() {
    await this.ctx.storage.delete(PROVIDER_USER_CONTEXT_KEY);
  }
}
