import { loadChatSession } from "../chat/chat.storage";
import type { BrowserSession } from "../session/session";
import { DebugClient } from "./debug.client";

export const Debug = async ({ ctx }: { ctx: { session: BrowserSession } }) => {
  const activeThread = await loadChatSession(ctx.session.activeThreadId);

  return (
    <DebugClient
      activeMessageCount={activeThread.messages.length}
      activeThreadId={ctx.session.activeThreadId}
      globalMemory={ctx.session.globalMemory}
      threadCount={ctx.session.threads.length}
      threadMemory={activeThread.memory}
    />
  );
};
