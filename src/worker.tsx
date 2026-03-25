import { layout, render, route } from "rwsdk/router";
import { defineApp } from "rwsdk/worker";

import { ChatSessionDurableObject } from "@/app/chat/chat-session-do";
import { AccountRegistryDurableObject } from "@/app/account/account-registry-do";
import { Document } from "@/app/document";
import { StaticDocument } from "@/app/static-document";
import { DocsLayout } from "@/app/layouts/docs-layout";
import { setCommonHeaders } from "@/app/headers";
import { Debug } from "@/app/pages/debug";
import { DocsPage } from "@/app/pages/docs";
import { Home } from "@/app/pages/home";
import { Setup } from "@/app/pages/setup";
import { SandboxMessenger } from "@/app/pages/sandbox-messenger";
import { SandboxProvider } from "@/app/pages/sandbox-provider";
import { providerRoutes } from "@/app/provider/provider.routes";
import { providerDemoRoutes } from "@/app/provider/provider.demo.routes";
import { providerMockRoutes } from "@/app/provider/provider.mock.routes";
import { ProviderUserContextDurableObject } from "@/app/provider/provider-user-context-do";
import { accountRoutes } from "@/app/account/account.routes";
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

    if (
      pathname === "/" ||
      pathname === "/docs" ||
      pathname === "/docs/" ||
      pathname.startsWith("/docs/") ||
      pathname.startsWith("/api/v1/")
    ) {
      return;
    }

    let existingSession: Awaited<ReturnType<typeof browserSessionStore.load>> | null =
      null;

    try {
      existingSession = await browserSessionStore.load(request);
    } catch {
      existingSession = null;
    }

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
  ...accountRoutes,
  ...providerRoutes,
  ...providerDemoRoutes,
  ...providerMockRoutes,
  render(
    StaticDocument,
    [
      route("/", Home),
      layout(DocsLayout, [
        route("/docs", DocsPage),
        route("/docs/", DocsPage),
        route("/docs/:slug", DocsPage),
      ]),
    ],
    {
      rscPayload: false,
    },
  ),
  render(Document, [
    route("/debug", Debug),
    route("/setup", Setup),
    route("/sandbox/messenger", SandboxMessenger),
    route("/sandbox/provider", SandboxProvider),
  ]),
]);

export {
  AccountRegistryDurableObject,
  BrowserSessionDurableObject,
  ChatSessionDurableObject,
  ProviderUserContextDurableObject,
};
