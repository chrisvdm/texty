import type { ChatMessage, ChatThreadSummary } from "../chat/shared";
import {
  getProviderHydratedState,
  WEB_PROVIDER_ID,
} from "../provider/provider.service";
import type { BrowserSession } from "../session/session";
import styles from "./chat.module.css";
import { ChatClient } from "./chat.client";

type ChatShellProps = {
  session: BrowserSession;
  browserUserId: string;
};

export const ChatShell = async ({ session, browserUserId }: ChatShellProps) => {
  const providerState = await getProviderHydratedState({
    providerId: WEB_PROVIDER_ID,
    userId: browserUserId,
    channel: {
      type: "web",
      id: browserUserId,
    },
    fallbackThreadId: session.activeThreadId,
    fallbackGlobalMemory: session.globalMemory,
    fallbackThreads: session.threads,
    fallbackModel: session.selectedModel,
  });
  const messages: ChatMessage[] = providerState.session.messages;
  const threads: ChatThreadSummary[] = providerState.threads;

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <span className={styles.wordmark}>texty</span>
      </header>
      <ChatClient
        activeThreadId={providerState.activeThreadId}
        initialMessages={messages}
        initialThreads={threads}
        initialModel={providerState.selectedModel}
      />
    </main>
  );
};
