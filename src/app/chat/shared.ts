export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
};

export type ChatSessionState = {
  messages: ChatMessage[];
};

export type ChatThreadSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

export const MAX_CONTEXT_MESSAGES = 6;
export const DEFAULT_THREAD_TITLE = "Untitled thread";
export const INITIAL_MESSAGE_COUNT = 1;

export const createAssistantMessage = (content: string): ChatMessage => ({
  id: crypto.randomUUID(),
  role: "assistant",
  content,
  createdAt: new Date().toISOString(),
});

export const createUserMessage = (content: string): ChatMessage => ({
  id: crypto.randomUUID(),
  role: "user",
  content,
  createdAt: new Date().toISOString(),
});

export const createInitialChatState = (): ChatSessionState => ({
  messages: [
    createAssistantMessage(
      "Ask for product strategy, copy rewrites, code help, or research summaries. I’ll answer through OpenRouter.",
    ),
  ],
});

export const createThreadSummary = (
  id: string,
  messageCount = INITIAL_MESSAGE_COUNT,
): ChatThreadSummary => {
  const timestamp = new Date().toISOString();

  return {
    id,
    title: DEFAULT_THREAD_TITLE,
    createdAt: timestamp,
    updatedAt: timestamp,
    messageCount,
  };
};

export const getThreadTitleFromMessages = (messages: ChatMessage[]) => {
  const firstUserMessage = messages.find((message) => message.role === "user");

  if (!firstUserMessage) {
    return DEFAULT_THREAD_TITLE;
  }

  return firstUserMessage.content.replace(/\s+/g, " ").trim().slice(0, 48);
};
