import { render, route } from "rwsdk/router";
import { defineApp } from "rwsdk/worker";

import { ChatSessionDurableObject } from "@/app/chat/chat-session-do";
import { createInitialChatState } from "@/app/chat/shared";
import { saveChatSession } from "@/app/chat/chat.storage";
import { Document } from "@/app/document";
import { setCommonHeaders } from "@/app/headers";
import { Home } from "@/app/pages/home";
import { BrowserSessionDurableObject } from "@/app/session/browser-session-do";
import {
  browserSessionStore,
  type BrowserSession,
} from "@/app/session/session";

export type AppContext = {
  session: BrowserSession;
};

export default defineApp([
  setCommonHeaders(),
  async ({ request, response, ctx }) => {
    const existingSession = await browserSessionStore.load(request);

    if (existingSession) {
      ctx.session = existingSession;
      return;
    }

    const session = {
      chatId: crypto.randomUUID(),
    };

    await saveChatSession(session.chatId, createInitialChatState());
    await browserSessionStore.save(response.headers, session, { maxAge: true });

    ctx.session = session;
  },
  render(Document, [route("/", Home)]),
]);

export { BrowserSessionDurableObject, ChatSessionDurableObject };
