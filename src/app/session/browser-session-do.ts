import { DurableObject } from "cloudflare:workers";

import type { BrowserSession } from "./session";

const SESSION_KEY = "browser-session";

export class BrowserSessionDurableObject extends DurableObject {
  async getSession() {
    const session = await this.ctx.storage.get<BrowserSession>(SESSION_KEY);

    if (!session) {
      return { error: "Session not found" };
    }

    return { value: session };
  }

  async saveSession(data: BrowserSession) {
    await this.ctx.storage.put(SESSION_KEY, data);
    return data;
  }

  async revokeSession() {
    await this.ctx.storage.delete(SESSION_KEY);
  }
}
