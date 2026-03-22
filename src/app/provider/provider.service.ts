import { env } from "cloudflare:workers";

import { buildMemoryContext, refreshMemories } from "../chat/chat.memory";
import {
  buildPromptContext,
  createDateTimeSystemPrompt,
  DEFAULT_MODEL,
  resolveConversationTimeZone,
} from "../chat/conversation.runtime";
import {
  deleteChatSession,
  loadChatSession,
  saveChatSession,
} from "../chat/chat.storage";
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
} from "../chat/shared";
import type {
  AllowedTool,
  ProviderChannelInput,
  ProviderConfig,
  ProviderConversationInput,
  ProviderExecutionState,
  ProviderToolSyncInput,
  ProviderUserContext,
} from "./provider.types";
import { logProviderAudit } from "./provider.audit";
import { executeProviderToolRequest } from "./provider.execution";
import {
  applyConversationRateLimit,
  CONVERSATION_RATE_LIMIT_MAX_REQUESTS,
  CONVERSATION_RATE_LIMIT_WINDOW_MS,
  selectProviderGlobalMemory,
} from "./provider.logic";
import {
  loadOrCreateProviderUserContext,
  saveProviderUserContext,
} from "./provider.storage";

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

type ConversationDecision =
  | {
      action: "direct_reply";
      reply: string;
    }
  | {
      action: "clarification";
      question: string;
    }
  | {
      action: "tool_call";
      tool_name: string;
      arguments: Record<string, unknown>;
    };

class ProviderRateLimitError extends Error {
  retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Rate limit exceeded.");
    this.name = "ProviderRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const SYSTEM_PROMPT =
  "You are Texty, a concise conversational orchestration assistant. Return direct, useful replies without filler.";

const TOOL_DECISION_PROMPT = [
  "You decide whether to answer directly, ask a clarification question, or call a tool.",
  "Return strict JSON only. No markdown fences.",
  'Use exactly one of these shapes:',
  '{"action":"direct_reply","reply":"string"}',
  '{"action":"clarification","question":"string"}',
  '{"action":"tool_call","tool_name":"string","arguments":{}}',
  "Only call a tool if the request is clearly asking for work to be performed.",
  "If the request is missing required details for a tool, ask a clarification question instead of guessing.",
].join("\n");

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "for",
  "from",
  "have",
  "into",
  "that",
  "the",
  "this",
  "with",
  "your",
]);

const buildChannelKey = (channel: ProviderChannelInput) =>
  `${channel.type.trim().toLowerCase()}:${channel.id.trim()}`;

const getRequestTimeZone = (timeZone?: string | null) =>
  resolveConversationTimeZone(timeZone);

export const WEB_PROVIDER_ID = "texty_web";

const sortThreadsByRecency = (threads: ChatThreadSummary[]) =>
  [...threads].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

const updateThreadSummaries = (
  threads: ChatThreadSummary[],
  nextSummary: ChatThreadSummary,
) =>
  sortThreadsByRecency(
    threads.map((thread) => (thread.id === nextSummary.id ? nextSummary : thread)),
  );

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

const tokenize = (input: string) =>
  input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));

const scoreThreadFit = ({
  content,
  thread,
  session,
}: {
  content: string;
  thread: ChatThreadSummary;
  session: ChatSessionState;
}) => {
  const contentTokens = new Set(tokenize(content));

  if (contentTokens.size === 0) {
    return 0;
  }

  const threadCorpus = [
    thread.title,
    session.memory.summary,
    ...session.messages.slice(-4).map((message) => message.content),
  ].join(" ");
  const threadTokens = new Set(tokenize(threadCorpus));
  let matches = 0;

  for (const token of contentTokens) {
    if (threadTokens.has(token)) {
      matches += 1;
    }
  }

  return matches / Math.max(contentTokens.size, 1);
};

const shouldReuseChannelThread = async ({
  content,
  context,
  threadId,
}: {
  content: string;
  context: ProviderUserContext;
  threadId: string;
}) => {
  const thread = context.threads.find((entry) => entry.id === threadId);

  if (!thread) {
    return false;
  }

  const session = await loadChatSession(threadId);

  if (session.messages.length === 0) {
    return true;
  }

  return scoreThreadFit({ content, thread, session }) >= 0.2;
};

const resolveThreadId = async ({
  context,
  providedThreadId,
  channel,
  content,
}: {
  context: ProviderUserContext;
  providedThreadId?: string;
  channel: ProviderChannelInput;
  content: string;
}) => {
  const normalizedThreadId = providedThreadId?.trim();

  if (normalizedThreadId) {
    const threadExists = context.threads.some(
      (thread) => thread.id === normalizedThreadId,
    );

    if (!threadExists) {
      throw new Error("Thread not found for this provider user.");
    }

    return normalizedThreadId;
  }

  const channelState = context.channels[buildChannelKey(channel)];

  if (channelState?.lastActiveThreadId) {
    const canReuse = await shouldReuseChannelThread({
      content,
      context,
      threadId: channelState.lastActiveThreadId,
    });

    if (canReuse) {
      return channelState.lastActiveThreadId;
    }
  }

  return null;
};

const createThreadForContext = async ({
  context,
  isPrivate = false,
  channel,
}: {
  context: ProviderUserContext;
  isPrivate?: boolean;
  channel: ProviderChannelInput;
}) => {
  const threadId = crypto.randomUUID();
  const nextState = createInitialChatState();

  await saveChatSession(threadId, nextState);

  const nextThread = createThreadSummary(threadId, nextState.messages.length, {
    isTemporary: isPrivate,
  });
  const channelKey = buildChannelKey(channel);
  const nextContext: ProviderUserContext = {
    ...context,
    threads: sortThreadsByRecency([nextThread, ...context.threads]),
    channels: {
      ...context.channels,
      [channelKey]: {
        type: channel.type,
        id: channel.id,
        lastActiveThreadId: threadId,
        updatedAt: new Date().toISOString(),
      },
    },
  };

  await saveProviderUserContext(nextContext);

  return { context: nextContext, threadId, session: nextState };
};

const parseJsonObject = <T,>(content: string): T | null => {
  const trimmed = content.trim();
  const candidate =
    trimmed.startsWith("{") && trimmed.endsWith("}")
      ? trimmed
      : trimmed.match(/\{[\s\S]*\}/)?.[0];

  if (!candidate) {
    return null;
  }

  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
};

const enforceConversationRateLimit = ({
  context,
}: {
  context: ProviderUserContext;
}) => {
  const result = applyConversationRateLimit({
    timestamps: context.requestLog?.conversationInputTimestamps ?? [],
    maxRequests: CONVERSATION_RATE_LIMIT_MAX_REQUESTS,
    windowMs: CONVERSATION_RATE_LIMIT_WINDOW_MS,
  });

  if (!result.allowed) {
    throw new ProviderRateLimitError(result.retryAfterSeconds);
  }

  return {
    ...context,
    requestLog: {
      conversationInputTimestamps: result.timestamps,
    },
  };
};

const callOpenRouter = async ({
  messages,
  model,
  timeZone,
}: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  model: string;
  timeZone?: string | null;
}) => {
  const apiKey = env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
          content: createDateTimeSystemPrompt({ timeZone }),
        },
        ...messages,
      ],
    }),
  });

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

  return content;
};

const formatAllowedTools = (tools: AllowedTool[]) => {
  if (tools.length === 0) {
    return "(none)";
  }

  return tools
    .filter((tool) => tool.status === "active")
    .map(
      (tool) =>
        `- ${tool.toolName}: ${tool.description}\n  schema=${JSON.stringify(
          tool.inputSchema,
        )}\n  policy=${JSON.stringify(tool.policy)}`,
    )
    .join("\n");
};

const decideConversationAction = async ({
  content,
  messages,
  memoryContext,
  tools,
  model,
  timeZone,
}: {
  content: string;
  messages: ChatMessage[];
  memoryContext: string | null;
  tools: AllowedTool[];
  model: string;
  timeZone?: string | null;
}) => {
  if (tools.filter((tool) => tool.status === "active").length === 0) {
    const reply = await callOpenRouter({
      model,
      timeZone,
      messages: [
        ...(memoryContext
          ? [
              {
                role: "system" as const,
                content: memoryContext,
              },
            ]
          : []),
        ...buildPromptContext([...messages, createUserMessage(content)]),
      ],
    });

    return {
      action: "direct_reply",
      reply,
    } satisfies ConversationDecision;
  }

  const decision = await callOpenRouter({
    model,
    timeZone,
    messages: [
      {
        role: "system",
        content: TOOL_DECISION_PROMPT,
      },
      ...(memoryContext
        ? [
            {
              role: "system" as const,
              content: memoryContext,
            },
          ]
        : []),
      {
        role: "user",
        content: [
          "Available tools:",
          formatAllowedTools(tools),
          "",
          "Recent conversation:",
          JSON.stringify(
            messages.slice(-6).map((message) => ({
              role: message.role,
              content: message.content,
            })),
          ),
          "",
          `New user message: ${JSON.stringify(content)}`,
        ].join("\n"),
      },
    ],
  });

  const parsed = parseJsonObject<ConversationDecision>(decision);

  if (!parsed) {
    return {
      action: "direct_reply",
      reply: decision,
    } satisfies ConversationDecision;
  }

  return parsed;
};

const executeProviderTool = async ({
  providerConfig,
  providerId,
  userId,
  threadId,
  toolName,
  args,
  requestId,
}: {
  providerConfig: ProviderConfig;
  providerId: string;
  userId: string;
  threadId: string;
  toolName: string;
  args: Record<string, unknown>;
  requestId?: string;
}) =>
  executeProviderToolRequest({
    providerConfig,
    providerId,
    userId,
    threadId,
    toolName,
    args,
    requestId,
  });

const updateChannelState = ({
  context,
  channel,
  threadId,
}: {
  context: ProviderUserContext;
  channel: ProviderChannelInput;
  threadId: string;
}) => ({
  ...context.channels,
  [buildChannelKey(channel)]: {
    type: channel.type,
    id: channel.id,
    lastActiveThreadId: threadId,
    updatedAt: new Date().toISOString(),
  },
});

const appendMessagesToThread = async ({
  threadId,
  messages,
}: {
  threadId: string;
  messages: ChatMessage[];
}) => {
  const currentState = await loadChatSession(threadId);
  const nextState = {
    ...currentState,
    messages: [...currentState.messages, ...messages],
  };

  await saveChatSession(threadId, nextState);
  return nextState;
};

const refreshProviderMemories = async ({
  threadId,
  state,
  thread,
  context,
  isPrivate,
  timeZone,
}: {
  threadId: string;
  state: ChatSessionState;
  thread: ChatThreadSummary;
  context: ProviderUserContext;
  isPrivate: boolean;
  timeZone?: string | null;
}) => {
  try {
    const refreshed = await refreshMemories({
      threadId,
      messages: state.messages,
      previousThreadMemory: state.memory,
      globalMemory: isPrivate ? createEmptyGlobalMemory() : context.globalMemory,
      timeZone,
    });

    const nextThreadState = {
      ...state,
      memory: refreshed.threadMemory,
    };

    await saveChatSession(threadId, nextThreadState);

    const nextGlobalMemory = isPrivate ? context.globalMemory : refreshed.globalMemory;
    const nextThreads = updateThreadSummaries(
      context.threads,
      buildThreadSummary(thread, nextThreadState.messages),
    );

    const nextContext: ProviderUserContext = {
      ...context,
      globalMemory: nextGlobalMemory,
      threads: nextThreads,
    };

    await saveProviderUserContext(nextContext);

    return {
      state: nextThreadState,
      context: nextContext,
    };
  } catch (error) {
    console.warn("Unable to refresh provider memories", error);
    return {
      state,
      context,
    };
  }
};

export const syncProviderTools = async (
  input: ProviderToolSyncInput,
  requestId?: string,
) => {
  const context = await loadOrCreateProviderUserContext({
    providerId: input.provider_id,
    userId: input.user_id,
  });

  const nextContext: ProviderUserContext = {
    ...context,
    allowedTools: input.tools.map((tool) => ({
      toolName: tool.tool_name,
      description: tool.description,
      inputSchema: tool.input_schema,
      policy: tool.policy ?? {},
      status: tool.status ?? "active",
    })),
  };

  await saveProviderUserContext(nextContext);

  logProviderAudit({
    event: "provider.tools.synced",
    requestId,
    providerId: input.provider_id,
    userId: input.user_id,
    status: "ok",
    metadata: {
      syncedTools: nextContext.allowedTools.length,
    },
  });

  return {
    provider_id: input.provider_id,
    user_id: input.user_id,
    synced_tools: nextContext.allowedTools.length,
    status: "ok",
  };
};

export const listProviderThreads = async ({
  providerId,
  userId,
}: {
  providerId: string;
  userId: string;
}) => {
  const context = await loadOrCreateProviderUserContext({ providerId, userId });

  return {
    threads: sortThreadsByRecency(context.threads).map((thread) => ({
      thread_id: thread.id,
      title: thread.title,
      is_private: thread.isTemporary,
      updated_at: thread.updatedAt,
    })),
  };
};

export const createProviderThread = async ({
  providerId,
  userId,
  title,
  isPrivate,
  channel,
  requestId,
}: {
  providerId: string;
  userId: string;
  title?: string;
  isPrivate?: boolean;
  channel: ProviderChannelInput;
  requestId?: string;
}) => {
  const context = await loadOrCreateProviderUserContext({ providerId, userId });
  const created = await createThreadForContext({
    context,
    isPrivate,
    channel,
  });

  if (title?.trim()) {
    const nextThreads = created.context.threads.map((thread) =>
      thread.id === created.threadId
        ? {
            ...thread,
            title: title.trim().slice(0, 80),
            isTitleEdited: true,
          }
        : thread,
    );
    const nextContext = {
      ...created.context,
      threads: nextThreads,
    };

    await saveProviderUserContext(nextContext);
  }

  logProviderAudit({
    event: "provider.thread.created",
    requestId,
    providerId,
    userId,
    threadId: created.threadId,
    channelType: channel.type,
    channelId: channel.id,
    status: "ok",
    metadata: {
      isPrivate: Boolean(isPrivate),
    },
  });

  return {
    thread_id: created.threadId,
    title: title?.trim() || getThreadTitleFromMessages(created.session.messages),
    is_private: Boolean(isPrivate),
    status: "ok",
  };
};

export const renameProviderThread = async ({
  providerId,
  userId,
  threadId,
  title,
  requestId,
}: {
  providerId: string;
  userId: string;
  threadId: string;
  title: string;
  requestId?: string;
}) => {
  const context = await loadOrCreateProviderUserContext({ providerId, userId });
  const nextTitle = title.trim().slice(0, 80);

  if (!nextTitle) {
    throw new Error("Thread title is required.");
  }

  const thread = context.threads.find((entry) => entry.id === threadId);

  if (!thread) {
    throw new Error("Thread not found.");
  }

  const nextContext: ProviderUserContext = {
    ...context,
    threads: context.threads.map((entry) =>
      entry.id === threadId
        ? {
            ...entry,
            title: nextTitle,
            isTitleEdited: true,
            updatedAt: new Date().toISOString(),
          }
        : entry,
    ),
    globalMemory: {
      ...context.globalMemory,
      threadSummaries: context.globalMemory.threadSummaries.map((summary) =>
        summary.threadId === threadId ? { ...summary, title: nextTitle } : summary,
      ),
      markdown: "",
    },
  };

  nextContext.globalMemory.markdown = buildGlobalMemoryMarkdown({
    memory: nextContext.globalMemory,
    threadSummaries: nextContext.globalMemory.threadSummaries,
  });

  await saveProviderUserContext(nextContext);

  logProviderAudit({
    event: "provider.thread.renamed",
    requestId,
    providerId,
    userId,
    threadId,
    status: "ok",
  });

  return {
    thread_id: threadId,
    title: nextTitle,
    status: "ok",
  };
};

export const deleteProviderThread = async ({
  providerId,
  userId,
  threadId,
  requestId,
}: {
  providerId: string;
  userId: string;
  threadId: string;
  requestId?: string;
}) => {
  const context = await loadOrCreateProviderUserContext({ providerId, userId });
  const thread = context.threads.find((entry) => entry.id === threadId);

  if (!thread) {
    throw new Error("Thread not found.");
  }

  await deleteChatSession(threadId);

  const nextContext: ProviderUserContext = {
    ...context,
    threads: context.threads.filter((entry) => entry.id !== threadId),
    globalMemory: pruneGlobalMemoryByThreadId(context.globalMemory, threadId),
    channels: Object.fromEntries(
      Object.entries(context.channels).map(([key, channel]) => [
        key,
        channel.lastActiveThreadId === threadId
          ? { ...channel, lastActiveThreadId: null }
          : channel,
      ]),
    ),
  };

  await saveProviderUserContext(nextContext);

  logProviderAudit({
    event: "provider.thread.deleted",
    requestId,
    providerId,
    userId,
    threadId,
    status: "ok",
  });

  return {
    thread_id: threadId,
    status: "ok",
  };
};

export const getProviderMemory = async ({
  providerId,
  userId,
}: {
  providerId: string;
  userId: string;
}) => {
  const context = await loadOrCreateProviderUserContext({ providerId, userId });
  return context.globalMemory;
};

export const getProviderThreadMemory = async ({
  providerId,
  userId,
  threadId,
}: {
  providerId: string;
  userId: string;
  threadId: string;
}) => {
  const context = await loadOrCreateProviderUserContext({ providerId, userId });
  const thread = context.threads.some((entry) => entry.id === threadId);

  if (!thread) {
    throw new Error("Thread not found.");
  }

  const session = await loadChatSession(threadId);
  return session.memory;
};

export const getProviderHydratedState = async ({
  providerId,
  userId,
  channel,
}: {
  providerId: string;
  userId: string;
  channel: ProviderChannelInput;
}) => {
  let context = await loadOrCreateProviderUserContext({ providerId, userId });
  const channelKey = buildChannelKey(channel);
  const channelState = context.channels[channelKey];

  let activeThreadId =
    channelState?.lastActiveThreadId || context.threads[0]?.id || null;

  if (!activeThreadId) {
    const created = await createThreadForContext({
      context,
      isPrivate: false,
      channel,
    });
    context = created.context;
    activeThreadId = created.threadId;
  }

  if (
    !context.channels[channelKey] ||
    context.channels[channelKey]?.lastActiveThreadId !== activeThreadId
  ) {
    context = await saveProviderUserContext({
      ...context,
      channels: {
        ...context.channels,
        [channelKey]: {
          type: channel.type,
          id: channel.id,
          lastActiveThreadId: activeThreadId,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  }

  const threadSession = await loadChatSession(activeThreadId);

  return {
    activeThreadId,
    threads: context.threads,
    globalMemory: context.globalMemory,
    selectedModel: context.selectedModel,
    session: threadSession,
  };
};

export const isProviderRateLimitError = (
  error: unknown,
): error is ProviderRateLimitError => error instanceof ProviderRateLimitError;

export const handleProviderConversationInput = async ({
  input,
  providerConfig,
  requestId,
}: {
  input: ProviderConversationInput;
  providerConfig: ProviderConfig;
  requestId?: string;
}) => {
  const model = input.model?.trim() || DEFAULT_MODEL;
  const timeZone = getRequestTimeZone(input.timezone);
  let context = await loadOrCreateProviderUserContext({
    providerId: input.provider_id,
    userId: input.user_id,
  });
  const content = input.input.text.trim();

  if (!content) {
    throw new Error("Input text is required.");
  }

  context = enforceConversationRateLimit({ context });
  context = await saveProviderUserContext(context);

  logProviderAudit({
    event: "provider.conversation.received",
    requestId,
    providerId: input.provider_id,
    userId: input.user_id,
    threadId: input.thread_id,
    channelType: input.channel.type,
    channelId: input.channel.id,
    status: "ok",
  });

  let threadId = await resolveThreadId({
    context,
    providedThreadId: input.thread_id,
    channel: input.channel,
    content,
  });
  let currentContext = context;

  if (!threadId) {
    const created = await createThreadForContext({
      context,
      channel: input.channel,
      isPrivate: false,
    });

    threadId = created.threadId;
    currentContext = created.context;
  }

  const thread = currentContext.threads.find((entry) => entry.id === threadId);

  if (!thread) {
    throw new Error("Thread not found.");
  }

  const currentState = await loadChatSession(threadId);
  const memoryScope = selectProviderGlobalMemory({
    memoryPolicy: currentContext.memoryPolicy,
    globalMemory: currentContext.globalMemory,
    isPrivate: thread.isTemporary,
  });
  const memoryContext =
    currentContext.memoryPolicy.mode === "external"
      ? input.context?.external_memories?.join("\n") || null
      : buildMemoryContext({
          userMessage: content,
          messages: currentState.messages,
          threadMemory: currentState.memory,
          globalMemory: memoryScope,
        });
  const nextState = await appendMessagesToThread({
    threadId,
    messages: [createUserMessage(content)],
  });
  const decision = await decideConversationAction({
    content,
    messages: currentState.messages,
    memoryContext,
    tools: currentContext.allowedTools,
    model,
    timeZone,
  });

  let assistantContent = "";
  let action:
    | "direct_reply"
    | "clarification"
    | "tool_call"
    | "command" = "direct_reply";
  let executionState: ProviderExecutionState | undefined;

  if (decision.action === "direct_reply") {
    assistantContent = decision.reply;
    action = "direct_reply";
  } else if (decision.action === "clarification") {
    assistantContent = decision.question;
    action = "clarification";
    executionState = "needs_clarification";
  } else {
    const execution = await executeProviderTool({
      providerConfig,
      providerId: input.provider_id,
      userId: input.user_id,
      threadId,
      toolName: decision.tool_name,
      args: decision.arguments,
      requestId,
    });

    assistantContent = execution.message;
    action = "tool_call";
    executionState = execution.state;

    logProviderAudit({
      event: "provider.tool.executed",
      requestId,
      providerId: input.provider_id,
      userId: input.user_id,
      threadId,
      status: execution.state === "failed" ? "error" : "ok",
      metadata: {
        toolName: decision.tool_name,
        executionState: execution.state,
      },
    });
  }

  const withAssistant = await appendMessagesToThread({
    threadId,
    messages: [createAssistantMessage(assistantContent)],
  });

  const refreshed = await refreshProviderMemories({
    threadId,
    state: withAssistant,
    thread,
    context: {
      ...currentContext,
      channels: updateChannelState({
        context: currentContext,
        channel: input.channel,
        threadId,
      }),
      selectedModel: model,
    },
    isPrivate: thread.isTemporary,
    timeZone,
  });

  const finalContext = await saveProviderUserContext({
    ...refreshed.context,
    selectedModel: model,
    channels: updateChannelState({
      context: refreshed.context,
      channel: input.channel,
      threadId,
    }),
  });

  logProviderAudit({
    event: "provider.conversation.completed",
    requestId,
    providerId: input.provider_id,
    userId: input.user_id,
    threadId,
    channelType: input.channel.type,
    channelId: input.channel.id,
    status: "ok",
    metadata: {
      action,
      executionState: executionState ?? null,
    },
  });

  return {
    provider_id: input.provider_id,
    user_id: input.user_id,
    thread_id: threadId,
    messages: refreshed.state.messages.map((message) => ({
      message_id: message.id,
      role: message.role,
      content: message.content,
      created_at: message.createdAt,
    })),
    action: {
      type: action,
      execution_state: executionState ?? (action === "tool_call" ? "completed" : null),
    },
    model: model || finalContext.selectedModel,
  };
};
