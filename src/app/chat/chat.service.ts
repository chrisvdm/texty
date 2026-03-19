"use server";

import { env } from "cloudflare:workers";
import { requestInfo, serverQuery } from "rwsdk/worker";

import { buildMemoryContext, refreshMemories } from "./chat.memory";
import {
  executeConversationInput,
  parseConversationInput,
  type ConversationThreadState,
} from "./conversation.engine";
import {
  DEFAULT_MODEL,
  buildPromptContext,
  createDateTimeSystemPrompt,
  resolveConversationTimeZone,
} from "./conversation.runtime";
import {
  deleteChatSession,
  loadChatSession,
  saveChatSession,
} from "./chat.storage";
import {
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
  getBrowserSessionIdFromRequest,
  type BrowserSession,
} from "../session/session";
import {
  createProviderThread,
  deleteProviderThread,
  handleProviderConversationInput,
  renameProviderThread,
} from "../provider/provider.service";
import {
  loadOrCreateProviderUserContext,
  saveProviderUserContext,
} from "../provider/provider.storage";
import type { ProviderChannelInput } from "../provider/provider.types";

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

const SYSTEM_PROMPT =
  "You are Texty, a concise product-minded AI assistant. Give direct, useful answers and avoid filler.";
const MEMORY_USAGE_PROMPT =
  "When using memory, treat stored facts as source-backed context. You may use derived memory facts when they are explicitly provided with confidence and basis. Treat high-confidence derived facts as reliable, medium-confidence derived facts with cautious wording, and if memory does not explicitly contain or strongly support a personal detail, say you do not know rather than guessing.";

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

const WEB_PROVIDER_ID = "texty_web";

const getWebChannelType = () => {
  const referer = requestInfo.request.headers.get("Referer") || "";

  return referer.includes("/sandbox/messenger") ? "sandbox_messenger" : "web";
};

const getWebIdentity = () => {
  const browserSession = requireBrowserSession();
  const userId =
    getBrowserSessionIdFromRequest(requestInfo.request) ||
    browserSession.activeThreadId;
  const channel: ProviderChannelInput = {
    type: getWebChannelType(),
    id: userId,
  };

  return {
    providerId: WEB_PROVIDER_ID,
    userId,
    channel,
  };
};

const ensureWebProviderContext = async () => {
  const browserSession = requireBrowserSession();
  const { providerId, userId, channel } = getWebIdentity();
  let context = await loadOrCreateProviderUserContext({ providerId, userId });

  if (context.threads.length === 0 && browserSession.threads.length > 0) {
    context = await saveProviderUserContext({
      ...context,
      selectedModel: browserSession.selectedModel,
      globalMemory: browserSession.globalMemory,
      threads: browserSession.threads,
      channels: {
        ...context.channels,
        [`${channel.type}:${channel.id}`]: {
          type: channel.type,
          id: channel.id,
          lastActiveThreadId: browserSession.activeThreadId,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  }

  return {
    browserSession,
    context,
    providerId,
    userId,
    channel,
  };
};

const syncBrowserSessionFromProviderContext = async ({
  activeThreadId,
}: {
  activeThreadId: string;
}) => {
  const { providerId, userId } = getWebIdentity();
  const providerContext = await loadOrCreateProviderUserContext({ providerId, userId });
  const threadSession = await loadChatSession(activeThreadId);
  const nextSession: BrowserSession = {
    activeThreadId,
    threads: providerContext.threads,
    globalMemory: providerContext.globalMemory,
    selectedModel: providerContext.selectedModel,
  };

  await persistBrowserSession(nextSession);

  return formatThreadState(nextSession, threadSession, nextSession.selectedModel);
};

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
  model: model || session.selectedModel || DEFAULT_MODEL,
});

const getRequestTimeZone = () =>
  resolveConversationTimeZone(
    (requestInfo.request as Request & { cf?: { timezone?: string } }).cf?.timezone,
  );

const createAndPersistThread = async ({
  isTemporary = false,
}: {
  isTemporary?: boolean;
} = {}) => {
  const { providerId, userId, channel } = await ensureWebProviderContext();
  const created = await createProviderThread({
    providerId,
    userId,
    isPrivate: isTemporary,
    channel,
  });

  return syncBrowserSessionFromProviderContext({
    activeThreadId: created.thread_id,
  });
};

const sendMessageToThread = async ({
  content: rawMessage,
  threadId,
  model,
}: {
  content: string;
  threadId: string;
  model?: string;
}) => {
  const content = rawMessage.trim();
  const sessionId = threadId.trim();

  if (!sessionId) {
    throw new Error("Choose a thread before sending a message.");
  }

  if (!content) {
    throw new Error("Please enter a message before sending.");
  }

  const { providerId, userId, channel } = await ensureWebProviderContext();
  const selectedModel =
    model?.trim() ||
    requireBrowserSession().selectedModel ||
    env.OPENROUTER_MODEL ||
    DEFAULT_MODEL;

  const result = await handleProviderConversationInput({
    providerConfig: {
      token: "",
    },
    input: {
      provider_id: providerId,
      user_id: userId,
      thread_id: sessionId,
      input: {
        kind: "text",
        text: content,
      },
      model: selectedModel,
      timezone: getRequestTimeZone(),
      channel,
      context: {
        external_memories: [],
      },
    },
  });

  return syncBrowserSessionFromProviderContext({
    activeThreadId: result.thread_id,
  });
};

const selectThreadState = async (threadId: string) => {
  const nextThreadId = threadId.trim();

  if (!nextThreadId) {
    throw new Error("Choose a thread before trying to open it.");
  }

  const { browserSession, providerId, userId, channel, context } =
    await ensureWebProviderContext();
  const exists = context.threads.some((thread) => thread.id === nextThreadId);

  if (!exists) {
    throw new Error("That thread is no longer available.");
  }

  await saveProviderUserContext({
    ...context,
    channels: {
      ...context.channels,
      [`${channel.type}:${channel.id}`]: {
        type: channel.type,
        id: channel.id,
        lastActiveThreadId: nextThreadId,
        updatedAt: new Date().toISOString(),
      },
    },
  });

  return syncBrowserSessionFromProviderContext({
    activeThreadId: nextThreadId,
  });
};

const deleteThreadState = async (threadId: string) => {
  const targetThreadId = threadId.trim();

  if (!targetThreadId) {
    throw new Error("Choose a thread before trying to delete it.");
  }

  const { browserSession, providerId, userId, channel, context } =
    await ensureWebProviderContext();
  const threadExists = context.threads.some((thread) => thread.id === targetThreadId);

  if (!threadExists) {
    throw new Error("That thread is no longer available.");
  }

  await deleteProviderThread({
    providerId,
    userId,
    threadId: targetThreadId,
  });

  let nextContext = await loadOrCreateProviderUserContext({ providerId, userId });
  let nextActiveThreadId =
    browserSession.activeThreadId === targetThreadId
      ? nextContext.threads[0]?.id ?? null
      : browserSession.activeThreadId;

  if (!nextActiveThreadId) {
    const created = await createProviderThread({
      providerId,
      userId,
      channel,
      isPrivate: false,
    });
    nextActiveThreadId = created.thread_id;
    nextContext = await loadOrCreateProviderUserContext({ providerId, userId });
  }

  await saveProviderUserContext({
    ...nextContext,
    channels: {
      ...nextContext.channels,
      [`${channel.type}:${channel.id}`]: {
        type: channel.type,
        id: channel.id,
        lastActiveThreadId: nextActiveThreadId,
        updatedAt: new Date().toISOString(),
      },
    },
  });

  return syncBrowserSessionFromProviderContext({
    activeThreadId: nextActiveThreadId,
  });
};

const renameThreadState = async ({
  threadId,
  title,
}: {
  threadId: string;
  title: string;
}) => {
  const nextThreadId = threadId.trim();
  const nextTitle = title.trim().slice(0, 80);

  if (!nextThreadId) {
    throw new Error("Choose a thread before trying to rename it.");
  }

  if (!nextTitle) {
    throw new Error("Enter a thread name before saving.");
  }

  const { providerId, userId } = await ensureWebProviderContext();

  await renameProviderThread({
    providerId,
    userId,
    threadId: nextThreadId,
    title: nextTitle,
  });

  return syncBrowserSessionFromProviderContext({
    activeThreadId: requireBrowserSession().activeThreadId,
  });
};

const appendCommandHistoryToThread = async ({
  threadId,
  commandText,
  assistantReply,
}: {
  threadId: string;
  commandText: string;
  assistantReply?: string;
}) => {
  const browserSession = requireBrowserSession();
  const targetThread = browserSession.threads.find((thread) => thread.id === threadId);

  if (!targetThread) {
    return null;
  }

  const currentState = await loadChatSession(threadId);
  const nextMessages = [
    ...currentState.messages,
    createUserMessage(commandText),
    ...(assistantReply ? [createAssistantMessage(assistantReply)] : []),
  ];
  const nextState = {
    ...currentState,
    messages: nextMessages,
  };

  await saveChatSession(threadId, nextState);

  const nextSession: BrowserSession = {
    ...browserSession,
    threads: updateThreadSummaries(
      browserSession.threads,
      buildThreadSummary(targetThread, nextMessages),
    ),
  };

  await persistBrowserSession(nextSession);

  return {
    session: nextSession,
    thread: nextState,
  };
};

const generateAssistantReply = async ({
  messages,
  threadMemoryContext,
  model,
  timeZone,
}: {
  messages: ChatMessage[];
  threadMemoryContext?: string | null;
  model: string;
  timeZone?: string | null;
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
        model,
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
          },
          {
            role: "system",
            content: MEMORY_USAGE_PROMPT,
          },
          {
            role: "system",
            content: createDateTimeSystemPrompt({ timeZone }),
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
    model,
    content,
  };
};

export const sendChatMessage = serverQuery(
  async (input: { content: string; threadId: string; model?: string }) =>
    sendMessageToThread(input),
  { method: "POST" },
);

export const handleConversationInput = serverQuery(
  async ({
    rawInput,
    threadId,
    model,
  }: {
    rawInput: string;
    threadId: string;
    model?: string;
  }) => {
    const parsedInput = parseConversationInput(rawInput);

    if (!parsedInput) {
      throw new Error("Please enter a message before sending.");
    }

    const browserSession = requireBrowserSession();
    const sourceThreadId = threadId.trim() || browserSession.activeThreadId;
    const result = await executeConversationInput({
      input: parsedInput,
      model,
      context: {
        activeThreadId: sourceThreadId,
        threads: browserSession.threads,
      },
      actions: {
        createThread: async ({ isTemporary }) => {
          const state = await createAndPersistThread({ isTemporary });

          return {
            activeThreadId: state.activeThreadId,
            threads: state.threads,
            messages: state.session.messages,
            model: state.model,
          };
        },
        selectThread: async (nextThreadId) => {
          const state = await selectThreadState(nextThreadId);

          return {
            activeThreadId: state.activeThreadId,
            threads: state.threads,
            messages: state.session.messages,
            model: state.model,
          };
        },
        renameThread: async (input) => {
          const state = await renameThreadState(input);

          return {
            activeThreadId: state.activeThreadId,
            threads: state.threads,
            messages: state.session.messages,
            model: state.model,
          };
        },
        deleteThread: async (nextThreadId) => {
          const state = await deleteThreadState(nextThreadId);

          return {
            activeThreadId: state.activeThreadId,
            threads: state.threads,
            messages: state.session.messages,
            model: state.model,
          };
        },
        sendMessage: async (input) => {
          const state = await sendMessageToThread(input);

          return {
            activeThreadId: state.activeThreadId,
            threads: state.threads,
            messages: state.session.messages,
            model: state.model,
          };
        },
      },
    });

    if (parsedInput.kind === "command") {
      const latestSession = requireBrowserSession();
      const historyThreadId =
        result.kind === "state" &&
        sourceThreadId !== result.state.activeThreadId &&
        !latestSession.threads.some((thread) => thread.id === sourceThreadId)
          ? result.state.activeThreadId
          : sourceThreadId;
      const historyUpdate = await appendCommandHistoryToThread({
        threadId: historyThreadId,
        commandText: rawInput.trim(),
        assistantReply: result.notice,
      });

      if (historyUpdate && result.kind === "notice") {
        return {
          kind: "state" as const,
          state: {
            activeThreadId: historyThreadId,
            threads: historyUpdate.session.threads,
            messages: historyUpdate.thread.messages,
            model: historyUpdate.session.selectedModel,
          },
        };
      }

      if (
        historyUpdate &&
        result.kind === "state" &&
        historyThreadId === result.state.activeThreadId &&
        result.notice
      ) {
        return {
          kind: "state" as const,
          state: {
            activeThreadId: result.state.activeThreadId,
            threads: historyUpdate.session.threads,
            messages: historyUpdate.thread.messages,
            model: result.state.model ?? historyUpdate.session.selectedModel,
          },
        };
      }
    }

    return result;
  },
  { method: "POST" },
);

export const setChatModel = serverQuery(
  async (model: string) => {
    const browserSession = requireBrowserSession();
    const selectedModel = model.trim() || browserSession.selectedModel || DEFAULT_MODEL;
    const session = await loadChatSession(browserSession.activeThreadId);
    const nextSession: BrowserSession = {
      ...browserSession,
      selectedModel,
    };

    await persistBrowserSession(nextSession);

    return formatThreadState(nextSession, session, selectedModel);
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
  async (threadId: string) => selectThreadState(threadId),
  { method: "POST" },
);

export const deleteChatThread = serverQuery(
  async (threadId: string) => deleteThreadState(threadId),
  { method: "POST" },
);

export const renameChatThread = serverQuery(
  async (input: { threadId: string; title: string }) => renameThreadState(input),
  { method: "POST" },
);
