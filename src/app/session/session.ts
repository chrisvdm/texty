import { env } from "cloudflare:workers";
import { defineDurableSession } from "rwsdk/auth";

import type { BrowserSessionDurableObject } from "./browser-session-do";

export type BrowserSession = {
  chatId: string;
};

export const browserSessionStore = defineDurableSession({
  cookieName: "texty_session",
  sessionDurableObject:
    env.BROWSER_SESSIONS as DurableObjectNamespace<BrowserSessionDurableObject>,
});
