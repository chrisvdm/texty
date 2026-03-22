import { render, route } from "rwsdk/router";
import { defineApp } from "rwsdk/worker";

import { ChatSessionDurableObject } from "@/app/chat/chat-session-do";
import { Document } from "@/app/document";
import { setCommonHeaders } from "@/app/headers";
import { Debug } from "@/app/pages/debug";
import { Home } from "@/app/pages/home";
import { SandboxMessenger } from "@/app/pages/sandbox-messenger";
import { SandboxProvider } from "@/app/pages/sandbox-provider";
import { providerRoutes } from "@/app/provider/provider.routes";
import { providerMockRoutes } from "@/app/provider/provider.mock.routes";
import { ProviderUserContextDurableObject } from "@/app/provider/provider-user-context-do";
import { BrowserSessionDurableObject } from "@/app/session/browser-session-do";
import {
  browserSessionStore,
  createBrowserSession,
  normalizeBrowserSession,
  type BrowserSession,
} from "@/app/session/session";

export type AppContext = {
  session?: BrowserSession;
};

export default defineApp([
  setCommonHeaders(),
  async ({ request, response, ctx }) => {
    const pathname = new URL(request.url).pathname;

    if (pathname.startsWith("/api/v1/")) {
      return;
    }

    const existingSession = await browserSessionStore.load(request);

    if (existingSession) {
      const normalizedSession = normalizeBrowserSession(existingSession);

      if (
        !("globalMemory" in existingSession) ||
        normalizedSession.activeThreadId !==
          (existingSession as BrowserSession).activeThreadId ||
        normalizedSession.threads !== (existingSession as BrowserSession).threads
      ) {
        await browserSessionStore.save(response.headers, normalizedSession, {
          maxAge: true,
        });
      }

      ctx.session = normalizedSession;
      return;
    }

    const threadId = crypto.randomUUID();
    const session = createBrowserSession(threadId);

    await browserSessionStore.save(response.headers, session, { maxAge: true });

    ctx.session = session;
  },
  ...providerRoutes,
  ...providerMockRoutes,
  render(Document, [
    route("/", Home),
    route("/debug", Debug),
    route("/sandbox/messenger", SandboxMessenger),
    route("/sandbox/provider", SandboxProvider),
  ]),
]);

export {
  BrowserSessionDurableObject,
  ChatSessionDurableObject,
  ProviderUserContextDurableObject,
};
