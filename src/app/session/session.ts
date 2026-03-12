import { env } from "cloudflare:workers";
import { defineDurableSession } from "rwsdk/auth";

import type { BrowserSessionDurableObject } from "./browser-session-do";
import { createThreadSummary, type ChatThreadSummary } from "../chat/shared";

export type BrowserSession = {
  activeThreadId: string;
  threads: ChatThreadSummary[];
};

type LegacyBrowserSession = {
  chatId: string;
};

export const createBrowserSession = (threadId: string): BrowserSession => ({
  activeThreadId: threadId,
  threads: [createThreadSummary(threadId)],
});

export const normalizeBrowserSession = (
  session: BrowserSession | LegacyBrowserSession,
): BrowserSession => {
  if ("activeThreadId" in session && Array.isArray(session.threads)) {
    return session;
  }

  return createBrowserSession(session.chatId);
};

export const browserSessionStore = defineDurableSession({
  cookieName: "texty_session",
  sessionDurableObject:
    env.BROWSER_SESSIONS as DurableObjectNamespace<BrowserSessionDurableObject>,
});
