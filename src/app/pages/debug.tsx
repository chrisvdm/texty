import { loadChatSession } from "../chat/chat.storage";
import type { BrowserSession } from "../session/session";
import { DebugClient } from "./debug.client";

const requireSession = (session: BrowserSession | undefined) => {
  if (!session) {
    throw new Error("Browser session is required for this page.");
  }

  return session;
};

export const Debug = async ({ ctx }: { ctx: { session?: BrowserSession } }) => {
  const session = requireSession(ctx.session);
  const activeThread = await loadChatSession(session.activeThreadId);

  return (
    <DebugClient
      activeMessageCount={activeThread.messages.length}
      activeThreadId={session.activeThreadId}
      globalMemory={session.globalMemory}
      threadCount={session.threads.length}
      threadMemory={activeThread.memory}
    />
  );
};
