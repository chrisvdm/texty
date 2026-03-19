import { env } from "cloudflare:workers";
import { defineDurableSession } from "rwsdk/auth";

import type { BrowserSessionDurableObject } from "./browser-session-do";
import {
  createEmptyGlobalMemory,
  createThreadSummary,
  normalizeGlobalMemory,
  normalizeThreadSummaries,
  type ChatThreadSummary,
  type GlobalMemory,
} from "../chat/shared";

export type BrowserSession = {
  activeThreadId: string;
  threads: ChatThreadSummary[];
  globalMemory: GlobalMemory;
  selectedModel: string;
};

type LegacyBrowserSession = {
  chatId: string;
};

const isBrowserSession = (
  session: BrowserSession | LegacyBrowserSession,
): session is BrowserSession =>
  "activeThreadId" in session && Array.isArray(session.threads);

export const createBrowserSession = (threadId: string): BrowserSession => ({
  activeThreadId: threadId,
  threads: [createThreadSummary(threadId)],
  globalMemory: createEmptyGlobalMemory(),
  selectedModel: "openai/gpt-4o-mini",
});

export const normalizeBrowserSession = (
  session: BrowserSession | LegacyBrowserSession,
): BrowserSession => {
  if (isBrowserSession(session)) {
    return {
      ...session,
      threads: normalizeThreadSummaries(session.threads),
      globalMemory: normalizeGlobalMemory(session.globalMemory),
      selectedModel:
        typeof session.selectedModel === "string" && session.selectedModel.trim()
          ? session.selectedModel.trim()
          : "openai/gpt-4o-mini",
    };
  }

  return createBrowserSession(session.chatId);
};

export const browserSessionStore = defineDurableSession({
  cookieName: "texty_session",
  sessionDurableObject:
    env.BROWSER_SESSIONS as DurableObjectNamespace<BrowserSessionDurableObject>,
});

export const getSessionCookieValue = (request: Request) => {
  const cookieHeader = request.headers.get("Cookie");

  if (!cookieHeader) {
    return null;
  }

  for (const cookie of cookieHeader.split(";")) {
    const trimmedCookie = cookie.trim();
    const separatorIndex = trimmedCookie.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmedCookie.slice(0, separatorIndex);
    const value = trimmedCookie.slice(separatorIndex + 1);

    if (key === "texty_session") {
      return value;
    }
  }

  return null;
};

export const getUnsignedSessionId = (packedSessionId: string) => {
  const decoded = atob(packedSessionId);
  const separatorIndex = decoded.indexOf(":");

  if (separatorIndex === -1) {
    throw new Error("Invalid browser session cookie.");
  }

  return decoded.slice(0, separatorIndex);
};

export const persistBrowserSession = async ({
  request,
  responseHeaders,
  session,
}: {
  request: Request;
  responseHeaders: Headers;
  session: BrowserSession;
}) => {
  const packedSessionId = getSessionCookieValue(request);

  if (!packedSessionId) {
    await browserSessionStore.save(responseHeaders, session, { maxAge: true });
    return;
  }

  const unsignedSessionId = getUnsignedSessionId(packedSessionId);
  const sessionId = env.BROWSER_SESSIONS.idFromName(unsignedSessionId);
  const sessionStub = env.BROWSER_SESSIONS.get(sessionId);

  await sessionStub.saveSession(session);
};

export const getBrowserSessionIdFromRequest = (request: Request) => {
  const packedSessionId = getSessionCookieValue(request);

  if (!packedSessionId) {
    return null;
  }

  return getUnsignedSessionId(packedSessionId);
};

export const getBrowserSessionIdFromPackedCookie = (packedSessionId: string) =>
  getUnsignedSessionId(packedSessionId);
