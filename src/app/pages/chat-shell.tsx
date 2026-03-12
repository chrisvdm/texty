import { loadChatSession } from "../chat/chat.storage";
import type { ChatMessage } from "../chat/shared";
import styles from "./chat.module.css";
import { ChatClient } from "./chat.client";

type ChatShellProps = {
  chatSessionId: string;
};

export const ChatShell = async ({ chatSessionId }: ChatShellProps) => {
  const session = await loadChatSession(chatSessionId);
  const messages: ChatMessage[] = session.messages;

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <span className={styles.wordmark}>texty</span>
      </header>
      <ChatClient initialMessages={messages} />
    </main>
  );
};
