import { loadChatSession } from "../chat/chat.storage";
import type { ChatMessage, ChatThreadSummary } from "../chat/shared";
import type { BrowserSession } from "../session/session";
import { SandboxMessengerClient } from "./sandbox-messenger.client";

const requireSession = (session: BrowserSession | undefined) => {
  if (!session) {
    throw new Error("Browser session is required for this page.");
  }

  return session;
};

export const SandboxMessenger = async ({
  ctx,
}: {
  ctx: { session?: BrowserSession };
}) => {
  const session = requireSession(ctx.session);
  const activeThread = await loadChatSession(session.activeThreadId);
  const messages: ChatMessage[] = activeThread.messages;
  const threads: ChatThreadSummary[] = session.threads;

  return (
    <SandboxMessengerClient
      activeThreadId={session.activeThreadId}
      initialMessages={messages}
      initialModel={session.selectedModel}
      initialThreads={threads}
    />
  );
};
