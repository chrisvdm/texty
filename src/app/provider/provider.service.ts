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
  MemoryPolicy,
  ProviderChannelInput,
  ProviderConfig,
  ProviderConversationInput,
  ProviderExecutionState,
  ProviderToolSyncInput,
  ProviderUserContext,
} from "./provider.types";
import { logProviderAudit } from "./provider.audit";
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

type ProviderToolExecutionResponse = {
  ok: boolean;
  result?: {
    summary?: string;
    data?: Record<string, unknown>;
  };
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

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

const selectMemoryScopeForRetrieval = ({
  memoryPolicy,
  globalMemory,
  isPrivate,
}: {
  memoryPolicy: MemoryPolicy;
  globalMemory: ProviderUserContext["globalMemory"];
  isPrivate: boolean;
}) => {
  if (isPrivate) {
    return createEmptyGlobalMemory();
  }

  if (memoryPolicy.mode === "provider_user" || memoryPolicy.mode === "custom_scope") {
    return globalMemory;
  }

  return createEmptyGlobalMemory();
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
}: {
  providerConfig: ProviderConfig;
  providerId: string;
  userId: string;
  threadId: string;
  toolName: string;
  args: Record<string, unknown>;
}) => {
  if (!providerConfig.baseUrl) {
    throw new Error("Provider base URL is not configured.");
  }

  const response = await fetch(`${providerConfig.baseUrl.replace(/\/$/, "")}/tools/execute`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${providerConfig.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      execution_id: crypto.randomUUID(),
      provider_id: providerId,
      user_id: userId,
      thread_id: threadId,
      tool_name: toolName,
      arguments: args,
      context: {
        thread_id: threadId,
      },
    }),
  });

  const payload = (await response.json()) as ProviderToolExecutionResponse;

  if (!response.ok || !payload.ok) {
    return {
      state: "failed" as ProviderExecutionState,
      message:
        payload.error?.message || "The provider failed to execute the requested tool.",
    };
  }

  return {
    state: "completed" as ProviderExecutionState,
    message: payload.result?.summary || "The tool ran successfully.",
    data: payload.result?.data ?? null,
  };
};

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

export const syncProviderTools = async (input: ProviderToolSyncInput) => {
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
}: {
  providerId: string;
  userId: string;
  title?: string;
  isPrivate?: boolean;
  channel: ProviderChannelInput;
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
}: {
  providerId: string;
  userId: string;
  threadId: string;
  title: string;
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
}: {
  providerId: string;
  userId: string;
  threadId: string;
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
  fallbackThreadId,
  fallbackGlobalMemory,
  fallbackThreads,
  fallbackModel,
}: {
  providerId: string;
  userId: string;
  channel: ProviderChannelInput;
  fallbackThreadId?: string;
  fallbackGlobalMemory?: ProviderUserContext["globalMemory"];
  fallbackThreads?: ChatThreadSummary[];
  fallbackModel?: string;
}) => {
  let context = await loadOrCreateProviderUserContext({ providerId, userId });
  const channelKey = buildChannelKey(channel);
  const channelState = context.channels[channelKey];

  if (context.threads.length === 0 && fallbackThreads && fallbackThreads.length > 0) {
    context = await saveProviderUserContext({
      ...context,
      selectedModel: fallbackModel || context.selectedModel,
      globalMemory: fallbackGlobalMemory || context.globalMemory,
      threads: fallbackThreads,
      channels: {
        ...context.channels,
        [channelKey]: {
          type: channel.type,
          id: channel.id,
          lastActiveThreadId: fallbackThreadId || fallbackThreads[0]?.id || null,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  }

  let activeThreadId =
    channelState?.lastActiveThreadId ||
    fallbackThreadId ||
    context.threads[0]?.id ||
    null;

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

export const handleProviderConversationInput = async ({
  input,
  providerConfig,
}: {
  input: ProviderConversationInput;
  providerConfig: ProviderConfig;
}) => {
  const model = input.model?.trim() || DEFAULT_MODEL;
  const timeZone = getRequestTimeZone(input.timezone);
  const context = await loadOrCreateProviderUserContext({
    providerId: input.provider_id,
    userId: input.user_id,
  });
  const content = input.input.text.trim();

  if (!content) {
    throw new Error("Input text is required.");
  }

  logProviderAudit({
    event: "provider.conversation.received",
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
  const memoryScope = selectMemoryScopeForRetrieval({
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
    });

    assistantContent = execution.message;
    action = "tool_call";
    executionState = execution.state;

    logProviderAudit({
      event: "provider.tool.executed",
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
