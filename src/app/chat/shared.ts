export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
};

export type MemoryFact = {
  key: string;
  value: string;
  confidence: number;
  updatedAt: string;
  sourceThreadId?: string;
  sourceMessageIds?: string[];
};

export type ThreadMemory = {
  summary: string;
  keywords: string[];
  facts: MemoryFact[];
  markdown: string;
  updatedAt: string;
};

export type GlobalThreadSummary = {
  threadId: string;
  title: string;
  summary: string;
  keywords: string[];
  updatedAt: string;
};

export type GlobalMemory = {
  facts: MemoryFact[];
  threadSummaries: GlobalThreadSummary[];
  markdown: string;
  updatedAt: string;
};

export type ChatSessionState = {
  messages: ChatMessage[];
  memory: ThreadMemory;
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

const formatFactLine = (fact: MemoryFact) =>
  `- \`${fact.key}\`: ${fact.value} (${Math.round(fact.confidence * 100)}%)`;

export const buildThreadMemoryMarkdown = ({
  summary,
  keywords,
  facts,
  messages,
}: {
  summary: string;
  keywords: string[];
  facts: MemoryFact[];
  messages: ChatMessage[];
}) => {
  const summaryBlock = summary || "_No thread summary yet._";
  const keywordBlock =
    keywords.length > 0 ? keywords.map((keyword) => `- ${keyword}`).join("\n") : "_None yet._";
  const factBlock =
    facts.length > 0 ? facts.map(formatFactLine).join("\n") : "_No stable thread facts yet._";
  const transcriptBlock = messages
    .map(
      (message) =>
        `### ${message.role}\n\n${message.content}\n\n_At: ${message.createdAt}_`,
    )
    .join("\n\n");

  return `# Thread Memory

## Summary

${summaryBlock}

## Keywords

${keywordBlock}

## Facts

${factBlock}

## Transcript

${transcriptBlock}`;
};

export const buildGlobalMemoryMarkdown = ({
  facts,
  threadSummaries,
}: {
  facts: MemoryFact[];
  threadSummaries: GlobalThreadSummary[];
}) => {
  const factBlock =
    facts.length > 0
      ? facts
          .map((fact) => {
            const provenance = fact.sourceThreadId
              ? ` [thread ${fact.sourceThreadId.slice(0, 8)}]`
              : "";

            return `${formatFactLine(fact)}${provenance}`;
          })
          .join("\n")
      : "_No persistent user memory yet._";

  const summaryBlock =
    threadSummaries.length > 0
      ? threadSummaries
          .map(
            (entry) =>
              `- ${entry.title || "Untitled thread"} [${entry.threadId.slice(0, 8)}]: ${entry.summary}`,
          )
          .join("\n")
      : "_No thread summaries indexed yet._";

  return `# User Memory

## Facts

${factBlock}

## Thread Summaries

${summaryBlock}`;
};

export const createEmptyThreadMemory = (): ThreadMemory => {
  const timestamp = new Date().toISOString();

  return {
    summary: "",
    keywords: [],
    facts: [],
    markdown: buildThreadMemoryMarkdown({
      summary: "",
      keywords: [],
      facts: [],
      messages: [],
    }),
    updatedAt: timestamp,
  };
};

export const createEmptyGlobalMemory = (): GlobalMemory => {
  const timestamp = new Date().toISOString();

  return {
    facts: [],
    threadSummaries: [],
    markdown: buildGlobalMemoryMarkdown({
      facts: [],
      threadSummaries: [],
    }),
    updatedAt: timestamp,
  };
};

export const normalizeThreadMemory = (
  memory: Partial<ThreadMemory> | undefined,
  messages: ChatMessage[],
): ThreadMemory => {
  const normalizedFacts = memory?.facts ?? [];
  const normalizedKeywords = memory?.keywords ?? [];
  const normalizedSummary = memory?.summary ?? "";
  const updatedAt = memory?.updatedAt ?? new Date().toISOString();

  return {
    summary: normalizedSummary,
    keywords: normalizedKeywords,
    facts: normalizedFacts,
    markdown:
      memory?.markdown ??
      buildThreadMemoryMarkdown({
        summary: normalizedSummary,
        keywords: normalizedKeywords,
        facts: normalizedFacts,
        messages,
      }),
    updatedAt,
  };
};

export const normalizeGlobalMemory = (
  memory: Partial<GlobalMemory> | undefined,
): GlobalMemory => {
  const facts = memory?.facts ?? [];
  const threadSummaries = memory?.threadSummaries ?? [];
  const updatedAt = memory?.updatedAt ?? new Date().toISOString();

  return {
    facts,
    threadSummaries,
    markdown:
      memory?.markdown ??
      buildGlobalMemoryMarkdown({
        facts,
        threadSummaries,
      }),
    updatedAt,
  };
};

export const normalizeChatSessionState = (
  state: Partial<ChatSessionState> & Pick<ChatSessionState, "messages">,
): ChatSessionState => ({
  messages: state.messages,
  memory: normalizeThreadMemory(state.memory, state.messages),
});

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
  memory: createEmptyThreadMemory(),
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
