"use server";

import { env } from "cloudflare:workers";
import { requestInfo, serverQuery } from "rwsdk/worker";

import { buildMemoryContext, refreshMemories } from "./chat.memory";
import {
  deleteChatSession,
  loadChatSession,
  saveChatSession,
} from "./chat.storage";
import {
  MAX_CONTEXT_MESSAGES,
  buildGlobalMemoryMarkdown,
  createAssistantMessage,
  createEmptyGlobalMemory,
  createInitialChatState,
  createThreadSummary,
  createUserMessage,
  getThreadTitleFromMessages,
  pruneGlobalMemoryByThreadId,
  type ChatMessage,
  type ChatSessionState,
  type ChatThreadSummary,
} from "./shared";
import {
  persistBrowserSession as persistSessionState,
  type BrowserSession,
} from "../session/session";

type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

const DEFAULT_MODEL = "openai/gpt-4o-mini";
const SYSTEM_PROMPT =
  "You are Texty, a concise product-minded AI assistant. Give direct, useful answers and avoid filler.";
const MEMORY_USAGE_PROMPT =
  "When using memory, treat stored facts as source-backed context. You may use derived memory facts when they are explicitly provided with confidence and basis. Treat high-confidence derived facts as reliable, medium-confidence derived facts with cautious wording, and if memory does not explicitly contain or strongly support a personal detail, say you do not know rather than guessing.";

const buildPromptContext = (messages: ChatMessage[]): OpenRouterMessage[] =>
  messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-MAX_CONTEXT_MESSAGES)
    .map(({ role, content }) => ({ role, content }));

const requireBrowserSession = () => {
  const session = requestInfo.ctx.session as BrowserSession | undefined;

  if (!session?.activeThreadId) {
    throw new Error("No active chat session found. Refresh the page and try again.");
  }

  return session;
};

const persistBrowserSession = async (session: BrowserSession) => {
  await persistSessionState({
    request: requestInfo.request,
    responseHeaders: requestInfo.response.headers,
    session,
  });
  requestInfo.ctx.session = session;
};

const requireChatSessionId = () => requireBrowserSession().activeThreadId;

const updateThreadSummaries = (
  threads: ChatThreadSummary[],
  nextSummary: ChatThreadSummary,
) =>
  threads
    .map((thread) => (thread.id === nextSummary.id ? nextSummary : thread))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

const buildThreadSummary = (
  currentSummary: ChatThreadSummary,
  messages: ChatMessage[],
) => ({
  ...currentSummary,
  title: currentSummary.isTitleEdited
    ? currentSummary.title
    : getThreadTitleFromMessages(messages),
  updatedAt: messages.at(-1)?.createdAt || currentSummary.updatedAt,
  messageCount: messages.length,
});

const formatThreadState = (
  session: BrowserSession,
  threadSession: ChatSessionState,
  model?: string,
) => ({
  activeThreadId: session.activeThreadId,
  threads: session.threads,
  globalMemory: session.globalMemory,
  session: threadSession,
  ...(model ? { model } : {}),
});

const createAndPersistThread = async ({
  isTemporary = false,
}: {
  isTemporary?: boolean;
} = {}) => {
  const currentSession = requireBrowserSession();
  const nextThreadId = crypto.randomUUID();
  const nextThreadState = createInitialChatState();

  await saveChatSession(nextThreadId, nextThreadState);

  const nextSession: BrowserSession = {
    ...currentSession,
    activeThreadId: nextThreadId,
    threads: [
      createThreadSummary(nextThreadId, nextThreadState.messages.length, {
        isTemporary,
      }),
      ...currentSession.threads,
    ],
  };

  await persistBrowserSession(nextSession);

  return formatThreadState(nextSession, nextThreadState);
};

const generateAssistantReply = async ({
  messages,
  threadMemoryContext,
}: {
  messages: ChatMessage[];
  threadMemoryContext?: string | null;
}) => {
  const apiKey = env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured. Add it to .dev.vars for local development and as a Wrangler secret for deployment.",
    );
  }

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": env.OPENROUTER_SITE_URL || "http://localhost:5173",
        "X-Title": env.OPENROUTER_SITE_NAME || "Texty",
      },
      body: JSON.stringify({
        model: env.OPENROUTER_MODEL || DEFAULT_MODEL,
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
          },
          {
            role: "system",
            content: MEMORY_USAGE_PROMPT,
          },
          ...(threadMemoryContext
            ? [
                {
                  role: "system" as const,
                  content: threadMemoryContext,
                },
              ]
            : []),
          ...buildPromptContext(messages),
        ],
      }),
    },
  );

  const payload = (await response.json()) as OpenRouterResponse;

  if (!response.ok) {
    throw new Error(
      payload.error?.message || "OpenRouter returned an unexpected error.",
    );
  }

  const content = payload.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("OpenRouter did not return a response message.");
  }

  return {
    model: env.OPENROUTER_MODEL || DEFAULT_MODEL,
    content,
  };
};

export const sendChatMessage = serverQuery(
  async ({
    content: rawMessage,
    threadId,
  }: {
    content: string;
    threadId: string;
  }) => {
    const content = rawMessage.trim();
    const sessionId = threadId.trim();

    if (!sessionId) {
      throw new Error("Choose a thread before sending a message.");
    }

    if (!content) {
      throw new Error("Please enter a message before sending.");
    }

    const browserSession = requireBrowserSession();
    const threadExists = browserSession.threads.some(
      (thread) => thread.id === sessionId,
    );

    if (!threadExists) {
      throw new Error("That thread is no longer available.");
    }

    const currentSummary = browserSession.threads.find(
      (thread) => thread.id === sessionId,
    );

    if (!currentSummary) {
      throw new Error("The active thread could not be found.");
    }

    const memoryScope = currentSummary.isTemporary
      ? createEmptyGlobalMemory()
      : browserSession.globalMemory;
    const currentState = await loadChatSession(sessionId);
    const withUserMessage = {
      messages: [...currentState.messages, createUserMessage(content)],
      memory: currentState.memory,
    };

    await saveChatSession(sessionId, withUserMessage);

    try {
      const threadMemoryContext = buildMemoryContext({
        userMessage: content,
        messages: currentState.messages,
        threadMemory: currentState.memory,
        globalMemory: memoryScope,
      });
      const reply = await generateAssistantReply({
        messages: withUserMessage.messages,
        threadMemoryContext,
      });
      const nextState = {
        messages: [...withUserMessage.messages, createAssistantMessage(reply.content)],
        memory: currentState.memory,
      };

      await saveChatSession(sessionId, nextState);

      let finalState = nextState;
      let nextGlobalMemory = browserSession.globalMemory;

      try {
        const refreshedMemories = await refreshMemories({
          threadId: sessionId,
          messages: nextState.messages,
          previousThreadMemory: currentState.memory,
          globalMemory: memoryScope,
        });

        finalState = {
          ...nextState,
          memory: refreshedMemories.threadMemory,
        };
        nextGlobalMemory = currentSummary.isTemporary
          ? browserSession.globalMemory
          : refreshedMemories.globalMemory;

        await saveChatSession(sessionId, finalState);
      } catch (memoryError) {
        console.warn("Unable to refresh chat memory", memoryError);
      }

      const nextSession: BrowserSession = {
        ...browserSession,
        activeThreadId: sessionId,
        globalMemory: nextGlobalMemory,
        threads: updateThreadSummaries(
          browserSession.threads,
          buildThreadSummary(currentSummary, finalState.messages),
        ),
      };

      await persistBrowserSession(nextSession);

      return formatThreadState(nextSession, finalState, reply.model);
    } catch (error) {
      await saveChatSession(sessionId, currentState);
      throw error;
    }
  },
  { method: "POST" },
);

export const resetChatSession = serverQuery(
  async () => {
    const sessionId = requireChatSessionId();
    const browserSession = requireBrowserSession();
    const nextState = createInitialChatState();

    await saveChatSession(sessionId, nextState);

    const currentSummary = browserSession.threads.find(
      (thread) => thread.id === sessionId,
    );

    if (!currentSummary) {
      throw new Error("The active thread could not be found.");
    }

    const nextSession: BrowserSession = {
      ...browserSession,
      threads: updateThreadSummaries(
        browserSession.threads,
        {
          ...currentSummary,
          title: createThreadSummary(sessionId).title,
          updatedAt: new Date().toISOString(),
          messageCount: nextState.messages.length,
        },
      ),
    };

    await persistBrowserSession(nextSession);

    return formatThreadState(nextSession, nextState);
  },
  { method: "POST" },
);

export const createChatThread = serverQuery(
  async ({ isTemporary }: { isTemporary?: boolean } = {}) =>
    createAndPersistThread({ isTemporary }),
  { method: "POST" },
);

export const selectChatThread = serverQuery(
  async (threadId: string) => {
    const browserSession = requireBrowserSession();
    const nextThreadId = threadId.trim();

    if (!nextThreadId) {
      throw new Error("Choose a thread before trying to open it.");
    }

    const threadExists = browserSession.threads.some(
      (thread) => thread.id === nextThreadId,
    );

    if (!threadExists) {
      throw new Error("That thread is no longer available.");
    }

    const nextSession: BrowserSession = {
      ...browserSession,
      activeThreadId: nextThreadId,
    };

    const threadSession = await loadChatSession(nextThreadId);

    await persistBrowserSession(nextSession);

    return formatThreadState(nextSession, threadSession);
  },
  { method: "POST" },
);

export const deleteChatThread = serverQuery(
  async (threadId: string) => {
    const browserSession = requireBrowserSession();
    const targetThreadId = threadId.trim();

    if (!targetThreadId) {
      throw new Error("Choose a thread before trying to delete it.");
    }

    const threadExists = browserSession.threads.some(
      (thread) => thread.id === targetThreadId,
    );

    if (!threadExists) {
      throw new Error("That thread is no longer available.");
    }

    await deleteChatSession(targetThreadId);

    const remainingThreads = browserSession.threads.filter(
      (thread) => thread.id !== targetThreadId,
    );
    const nextGlobalMemory =
      browserSession.threads.length > 1
        ? pruneGlobalMemoryByThreadId(browserSession.globalMemory, targetThreadId)
        : createEmptyGlobalMemory();

    if (remainingThreads.length === 0) {
      const nextThreadId = crypto.randomUUID();
      const nextThreadState = createInitialChatState();

      await saveChatSession(nextThreadId, nextThreadState);

      const nextSession: BrowserSession = {
        ...browserSession,
        activeThreadId: nextThreadId,
        threads: [createThreadSummary(nextThreadId, nextThreadState.messages.length)],
        globalMemory: nextGlobalMemory,
      };

      await persistBrowserSession(nextSession);

      return formatThreadState(nextSession, nextThreadState);
    }

    const nextActiveThreadId =
      browserSession.activeThreadId === targetThreadId
        ? remainingThreads[0].id
        : browserSession.activeThreadId;
    const nextSession: BrowserSession = {
      ...browserSession,
      activeThreadId: nextActiveThreadId,
      threads: remainingThreads,
      globalMemory: nextGlobalMemory,
    };
    const threadSession = await loadChatSession(nextActiveThreadId);

    await persistBrowserSession(nextSession);

    return formatThreadState(nextSession, threadSession);
  },
  { method: "POST" },
);

export const renameChatThread = serverQuery(
  async ({
    threadId,
    title,
  }: {
    threadId: string;
    title: string;
  }) => {
    const browserSession = requireBrowserSession();
    const nextThreadId = threadId.trim();
    const nextTitle = title.trim().slice(0, 80);

    if (!nextThreadId) {
      throw new Error("Choose a thread before trying to rename it.");
    }

    if (!nextTitle) {
      throw new Error("Enter a thread name before saving.");
    }

    const currentSummary = browserSession.threads.find(
      (thread) => thread.id === nextThreadId,
    );

    if (!currentSummary) {
      throw new Error("That thread is no longer available.");
    }

    const nextThreads = browserSession.threads.map((thread) =>
      thread.id === nextThreadId
        ? {
            ...thread,
            title: nextTitle,
            isTitleEdited: true,
            updatedAt: new Date().toISOString(),
          }
        : thread,
    );
    const nextGlobalMemory = {
      ...browserSession.globalMemory,
      threadSummaries: browserSession.globalMemory.threadSummaries.map((summary) =>
        summary.threadId === nextThreadId
          ? { ...summary, title: nextTitle }
          : summary,
      ),
      markdown: "",
    };
    nextGlobalMemory.markdown = buildGlobalMemoryMarkdown({
      memory: nextGlobalMemory,
      threadSummaries: nextGlobalMemory.threadSummaries,
    });

    const nextSession: BrowserSession = {
      ...browserSession,
      threads: nextThreads,
      globalMemory: nextGlobalMemory,
    };
    const threadSession = await loadChatSession(
      browserSession.activeThreadId,
    );

    await persistBrowserSession(nextSession);

    return formatThreadState(nextSession, threadSession);
  },
  { method: "POST" },
);
