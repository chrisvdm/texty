import { loadChatSession } from "../chat/chat.storage";
import type { ChatMessage, ChatThreadSummary } from "../chat/shared";
import type { BrowserSession } from "../session/session";
import styles from "./chat.module.css";
import { ChatClient } from "./chat.client";

type ChatShellProps = {
  session: BrowserSession;
};

export const ChatShell = async ({ session }: ChatShellProps) => {
  const activeThread = await loadChatSession(session.activeThreadId);
  const messages: ChatMessage[] = activeThread.messages;
  const threads: ChatThreadSummary[] = session.threads;

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <span className={styles.wordmark}>texty</span>
      </header>
      <ChatClient
        activeThreadId={session.activeThreadId}
        initialMessages={messages}
        initialThreads={threads}
      />
    </main>
  );
};
