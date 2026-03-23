import { env } from "cloudflare:workers";
import { requestInfo } from "rwsdk/worker";

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
  type PendingToolConfirmation,
  type ChatSessionState,
  type ChatThreadSummary,
} from "../chat/shared";
import type {
  AllowedTool,
  ProviderChannelInput,
  ProviderConfig,
  ProviderConversationInput,
  ProviderConversationResponseKind,
  ProviderExecutionState,
  ProviderToolSyncInput,
  ProviderUserContext,
} from "./provider.types";
import { logProviderAudit } from "./provider.audit";
import { executeProviderToolRequest } from "./provider.execution";
import {
  applyConversationRateLimit,
  clampDecisionConfidence,
  CONVERSATION_RATE_LIMIT_MAX_REQUESTS,
  CONVERSATION_RATE_LIMIT_WINDOW_MS,
  extractToolStringValue,
  getToolDecisionConfidenceAction,
  interpretPendingToolConfirmation,
  selectProviderGlobalMemory,
  TOOLS_SYNC_RATE_LIMIT_MAX_REQUESTS,
  TOOLS_SYNC_RATE_LIMIT_WINDOW_MS,
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
      reasoning?: string;
    }
  | {
      action: "clarification";
      question: string;
      reasoning?: string;
    }
  | {
      action: "tool_call";
      tool_name: string;
      arguments: Record<string, unknown>;
      confidence?: number;
      reasoning?: string;
    }
  | {
      action: "tool_follow_up";
      tool_name: string;
      arguments: Record<string, unknown>;
      question: string;
      confidence?: number;
      reasoning?: string;
    };

type RawConversationDecision = {
  tool?: string;
  arguments?: Record<string, unknown>;
  data?: Record<string, unknown>;
  reasoning?: string;
  follow_up?: string | null;
  followUp?: string | null;
  confidence?: number;
};

type RawToolArgumentUpdate = {
  arguments?: Record<string, unknown>;
  follow_up?: string | null;
  followUp?: string | null;
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
  "Analyze the user input and determine the user's intent.",
  "Based on the intent, determine which tool is best suited to handle the request.",
  "Return strict JSON only. No markdown fences.",
  "Return a JSON object with exactly this structure:",
  '{"tool":"string|none","arguments":{},"reasoning":"string","follow_up":"string|null","confidence":0.0}',
  "Use tool = none when the user is not clearly asking to use one of the available tools.",
  "Do not call a tool for ordinary statements or facts unless the user is clearly asking to save, update, send, create, delete, or run something.",
  "If the request is missing required details for a tool, still choose the tool if appropriate, fill in the information you do have, and return a follow_up question for the missing information.",
  "Include a confidence score between 0 and 1 for how certain you are that this is the right tool choice.",
  "Arguments must contain only the extracted values for the tool schema.",
  "Do not include instruction words or filler in arguments.",
  'Example: if the user says "add wash hair to note", the note argument should be "wash hair", not "add wash hair to note".',
  'Example: if the user says "my name is john", that is a direct reply or normal conversation unless the user explicitly asks to save it.',
].join("\n");

const TOOL_ARGUMENT_UPDATE_PROMPT = [
  "You are updating arguments for one already-selected tool.",
  "Return strict JSON only. No markdown fences.",
  'Use exactly this shape: {"arguments":{},"follow_up":"string|null"}',
  "Merge the new user reply into the existing partial arguments.",
  "Keep any valid existing argument values unless the user clearly corrects them.",
  "Arguments must contain only the extracted values for the tool schema.",
  "If required information is still missing, return a follow_up question.",
  "If the required information is now complete, return follow_up as null.",
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

const providerEnv = env as typeof env & {
  AI?: {
    run: (model: string, inputs: Record<string, unknown>) => Promise<unknown>;
  };
  CLOUDFLARE_DECISION_MODEL?: string;
  TEXTY_USE_WORKERS_AI_ROUTING?: string;
  OPENROUTER_DECISION_MODEL?: string;
  OPENROUTER_ROUTER_MODEL?: string;
};

const getCloudflareDecisionModel = () =>
  providerEnv.CLOUDFLARE_DECISION_MODEL?.trim() ||
  "@cf/meta/llama-3.1-8b-instruct-fast";

const getOpenRouterDecisionModel = () =>
  providerEnv.OPENROUTER_DECISION_MODEL?.trim() ||
  providerEnv.OPENROUTER_ROUTER_MODEL?.trim() ||
  DEFAULT_MODEL;

const shouldUseWorkersAiRouting = () =>
  providerEnv.TEXTY_USE_WORKERS_AI_ROUTING?.trim().toLowerCase() === "true";

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

const normalizeNullableModelText = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (trimmed.toLowerCase() === "null" || trimmed.toLowerCase() === "undefined") {
    return "";
  }

  return trimmed;
};

const buildDecisionReasoning = (value: unknown) => {
  const normalized = normalizeNullableModelText(value);
  return normalized || null;
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
      ...context.requestLog,
      conversationInputTimestamps: result.timestamps,
    },
  };
};

const enforceToolsSyncRateLimit = ({
  context,
}: {
  context: ProviderUserContext;
}) => {
  const result = applyConversationRateLimit({
    timestamps: context.requestLog?.toolSyncTimestamps ?? [],
    maxRequests: TOOLS_SYNC_RATE_LIMIT_MAX_REQUESTS,
    windowMs: TOOLS_SYNC_RATE_LIMIT_WINDOW_MS,
  });

  if (!result.allowed) {
    throw new ProviderRateLimitError(result.retryAfterSeconds);
  }

  return {
    ...context,
    requestLog: {
      ...context.requestLog,
      toolSyncTimestamps: result.timestamps,
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

const extractCloudflareAiText = (payload: unknown): string | null => {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = payload as {
    response?: unknown;
    result?: { response?: unknown };
  };

  if (typeof value.response === "string" && value.response.trim()) {
    return value.response.trim();
  }

  if (
    value.result &&
    typeof value.result === "object" &&
    typeof value.result.response === "string" &&
    value.result.response.trim()
  ) {
    return value.result.response.trim();
  }

  return null;
};

const callDecisionModel = async ({
  messages,
  timeZone,
}: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  timeZone?: string | null;
}) => {
  if (providerEnv.AI && shouldUseWorkersAiRouting()) {
    try {
      const payload = await providerEnv.AI.run(getCloudflareDecisionModel(), {
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
        max_tokens: 300,
        temperature: 0.1,
      });

      const content = extractCloudflareAiText(payload);

      if (content) {
        return content;
      }
    } catch (error) {
      console.warn("Cloudflare AI decision model failed, falling back to OpenRouter.", error);
    }
  }

  return callOpenRouter({
    model: getOpenRouterDecisionModel(),
    timeZone,
    messages,
  });
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

const normalizeToolArguments = ({
  tool,
  args,
  content,
}: {
  tool?: AllowedTool;
  args: Record<string, unknown>;
  content: string;
}) => {
  if (!tool) {
    return args;
  }

  const properties = tool.inputSchema?.properties;

  if (!properties || typeof properties !== "object") {
    return args;
  }

  const stringEntries = Object.entries(properties).filter(([, value]) => {
    if (!value || typeof value !== "object") {
      return false;
    }

    return (value as { type?: unknown }).type === "string";
  });

  if (stringEntries.length !== 1) {
    return args;
  }

  const [fieldName] = stringEntries[0];
  const currentValue = args[fieldName];

  if (typeof currentValue !== "string") {
    return args;
  }

  const extractedValue = extractToolStringValue({
    content,
    fieldName,
  });

  if (!extractedValue) {
    return args;
  }

  return {
    ...args,
    [fieldName]: extractedValue,
  };
};

const buildToolConfirmationQuestion = ({
  tool,
}: {
  tool?: AllowedTool;
}) => {
  const toolLabel = tool?.description?.trim()
    ? `${tool.toolName} (${tool.description.trim()})`
    : tool?.toolName || "that tool";

  return `It looks like you want me to use ${toolLabel}. Is that right?`;
};

const buildLowConfidenceToolQuestion = () =>
  "I am not confident enough to pick the right tool yet. Can you say a bit more about what you want me to do?";

const buildPendingConfirmationReminder = ({
  tool,
}: {
  tool?: AllowedTool;
}) => {
  const toolLabel = tool?.description?.trim()
    ? `${tool.toolName} (${tool.description.trim()})`
    : tool?.toolName || "that tool";

  return `I was asking whether you wanted me to use ${toolLabel}. Please answer yes or no.`;
};

const decideConversationAction = async ({
  content,
  messages,
  memoryContext,
  tools,
  replyModel,
  timeZone,
}: {
  content: string;
  messages: ChatMessage[];
  memoryContext: string | null;
  tools: AllowedTool[];
  replyModel: string;
  timeZone?: string | null;
}) => {
  if (tools.filter((tool) => tool.status === "active").length === 0) {
    const reply = await callOpenRouter({
      model: replyModel,
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

  const decision = await callDecisionModel({
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
          "Choose only from these exact tool names or use none.",
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

  const parsed = parseJsonObject<RawConversationDecision>(decision);

  if (!parsed) {
    return {
      action: "direct_reply",
      reply: decision,
    } satisfies ConversationDecision;
  }

  const requestedTool = typeof parsed.tool === "string" ? parsed.tool.trim() : "";
  const followUp = normalizeNullableModelText(parsed.follow_up ?? parsed.followUp);
  const reasoning = buildDecisionReasoning(parsed.reasoning);

  if (!requestedTool || requestedTool.toLowerCase() === "none") {
    if (followUp) {
      return {
        action: "clarification",
        question: followUp,
        reasoning: reasoning ?? undefined,
      } satisfies ConversationDecision;
    }

    const reply = normalizeNullableModelText(parsed.reasoning);

    return {
      action: "direct_reply",
      reply:
        reply && reply.length > 0
          ? reply
          : "I understand. Tell me what you want me to do.",
      reasoning: reasoning ?? undefined,
    } satisfies ConversationDecision;
  }

  const matchingTool = tools.find((tool) => tool.toolName === requestedTool);

  if (!matchingTool) {
    return {
      action: "clarification",
      question:
        followUp ||
        "I could not match that request to an available tool. Can you say more about what you want me to do?",
      reasoning: reasoning ?? undefined,
    } satisfies ConversationDecision;
  }

  if (followUp) {
    return {
      action: "tool_follow_up",
      tool_name: matchingTool.toolName,
      arguments:
        parsed.arguments && typeof parsed.arguments === "object"
          ? parsed.arguments
          : parsed.data && typeof parsed.data === "object"
            ? parsed.data
            : {},
      question: followUp,
      confidence: clampDecisionConfidence(parsed.confidence),
      reasoning: reasoning ?? undefined,
    } satisfies ConversationDecision;
  }

  return {
    action: "tool_call",
    tool_name: matchingTool.toolName,
    arguments:
      parsed.arguments && typeof parsed.arguments === "object"
        ? parsed.arguments
        : parsed.data && typeof parsed.data === "object"
          ? parsed.data
          : {},
    confidence: clampDecisionConfidence(parsed.confidence),
    reasoning: reasoning ?? undefined,
  } satisfies ConversationDecision;
};

const updatePendingToolArguments = async ({
  tool,
  currentArguments,
  userReply,
  question,
  timeZone,
}: {
  tool: AllowedTool;
  currentArguments: Record<string, unknown>;
  userReply: string;
  question?: string;
  timeZone?: string | null;
}) => {
  const decision = await callDecisionModel({
    timeZone,
    messages: [
      {
        role: "system",
        content: TOOL_ARGUMENT_UPDATE_PROMPT,
      },
      {
        role: "user",
        content: [
          `Tool name: ${tool.toolName}`,
          `Tool description: ${tool.description}`,
          `Tool schema: ${JSON.stringify(tool.inputSchema)}`,
          `Current arguments: ${JSON.stringify(currentArguments)}`,
          `Previous follow-up question: ${JSON.stringify(question || null)}`,
          `New user reply: ${JSON.stringify(userReply)}`,
        ].join("\n"),
      },
    ],
  });

  const parsed = parseJsonObject<RawToolArgumentUpdate>(decision);

  if (!parsed) {
    return {
      arguments: currentArguments,
      followUp: question || "I still need a bit more information before I can continue.",
    };
  }

  const followUp =
    normalizeNullableModelText(parsed.follow_up ?? parsed.followUp);

  return {
    arguments:
      parsed.arguments && typeof parsed.arguments === "object"
        ? parsed.arguments
        : currentArguments,
    followUp: followUp || null,
  };
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

const scheduleBackgroundTask = (task: Promise<unknown>) => {
  try {
    requestInfo?.cf?.waitUntil?.(task);
  } catch {
    void task;
  }
};

const getConversationResponseKind = ({
  action,
  executionState,
  pendingToolConfirmation,
}: {
  action: "direct_reply" | "clarification" | "tool_call" | "command";
  executionState?: ProviderExecutionState;
  pendingToolConfirmation: PendingToolConfirmation | null;
}): ProviderConversationResponseKind => {
  if (action === "tool_call") {
    return "task_result";
  }

  if (action === "clarification") {
    return pendingToolConfirmation?.mode === "confirmation"
      ? "confirmation"
      : "follow_up";
  }

  return "chat";
};

const appendMessagesToThread = async ({
  threadId,
  messages,
  pendingToolConfirmation,
}: {
  threadId: string;
  messages: ChatMessage[];
  pendingToolConfirmation?: PendingToolConfirmation | null;
}) => {
  const currentState = await loadChatSession(threadId);
  const nextState = {
    ...currentState,
    messages: [...currentState.messages, ...messages],
    pendingToolConfirmation:
      pendingToolConfirmation === undefined
        ? currentState.pendingToolConfirmation
        : pendingToolConfirmation,
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

  const rateLimitedContext = enforceToolsSyncRateLimit({ context });

  const nextContext: ProviderUserContext = {
    ...rateLimitedContext,
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

  let assistantContent = "";
  let action:
    | "direct_reply"
    | "clarification"
    | "tool_call"
    | "command" = "direct_reply";
  let executionState: ProviderExecutionState | undefined;
  let pendingToolConfirmation: PendingToolConfirmation | null = null;
  let decisionReasoning: string | null = null;

  if (currentState.pendingToolConfirmation) {
    const pendingTool = currentContext.allowedTools.find(
      (tool) => tool.toolName === currentState.pendingToolConfirmation?.toolName,
    );

    if (
      currentState.pendingToolConfirmation.mode === "confirmation" ||
      !pendingTool
    ) {
      const pendingReply = interpretPendingToolConfirmation(content);

      if (pendingReply === "confirm") {
        const execution = await executeProviderTool({
          providerConfig,
          providerId: input.provider_id,
          userId: input.user_id,
          threadId,
          toolName: currentState.pendingToolConfirmation.toolName,
          args: currentState.pendingToolConfirmation.arguments,
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
            toolName: currentState.pendingToolConfirmation.toolName,
            executionState: execution.state,
            viaConfirmation: true,
          },
        });
      } else if (pendingReply === "reject") {
        assistantContent =
          "Okay, I will not use that tool. Tell me what you want me to do instead.";
        action = "clarification";
        executionState = "needs_clarification";
      } else {
        assistantContent = buildPendingConfirmationReminder({
          tool: pendingTool,
        });
        action = "clarification";
        executionState = "needs_clarification";
        pendingToolConfirmation = currentState.pendingToolConfirmation;
      }
    } else {
      const updated = await updatePendingToolArguments({
        tool: pendingTool,
        currentArguments: currentState.pendingToolConfirmation.arguments,
        userReply: content,
        question: currentState.pendingToolConfirmation.question,
        timeZone,
      });

      if (updated.followUp) {
        assistantContent = updated.followUp;
        action = "clarification";
        executionState = "needs_clarification";
        pendingToolConfirmation = {
          ...currentState.pendingToolConfirmation,
          mode: "follow_up",
          arguments: updated.arguments,
          question: updated.followUp,
        };
      } else {
        const execution = await executeProviderTool({
          providerConfig,
          providerId: input.provider_id,
          userId: input.user_id,
          threadId,
          toolName: currentState.pendingToolConfirmation.toolName,
          args: updated.arguments,
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
            toolName: currentState.pendingToolConfirmation.toolName,
            executionState: execution.state,
            viaFollowUp: true,
          },
        });
      }
    }
  } else {
    const decision = await decideConversationAction({
      content,
      messages: currentState.messages,
      memoryContext,
      tools: currentContext.allowedTools,
      replyModel: model,
      timeZone,
    });
    decisionReasoning = decision.reasoning ?? null;

    if (decision.action === "direct_reply") {
      assistantContent = decision.reply;
      action = "direct_reply";
    } else if (decision.action === "clarification") {
      assistantContent = decision.question;
      action = "clarification";
      executionState = "needs_clarification";
    } else if (decision.action === "tool_follow_up") {
      const confidence = clampDecisionConfidence(decision.confidence);
      const tool = currentContext.allowedTools.find(
        (entry) => entry.toolName === decision.tool_name,
      );
      const normalizedArguments = normalizeToolArguments({
        tool,
        args: decision.arguments,
        content,
      });

      assistantContent = decision.question;
      action = "clarification";
      executionState = "needs_clarification";
      pendingToolConfirmation = {
        mode: "follow_up",
        toolName: decision.tool_name,
        arguments: normalizedArguments,
        confidence,
        createdAt: new Date().toISOString(),
        question: decision.question,
      };
    } else {
      const confidence = clampDecisionConfidence(decision.confidence);
      const tool = currentContext.allowedTools.find(
        (entry) => entry.toolName === decision.tool_name,
      );
      const normalizedArguments = normalizeToolArguments({
        tool,
        args: decision.arguments,
        content,
      });
      const confidenceAction = getToolDecisionConfidenceAction(confidence);

      if (confidenceAction === "clarify") {
        assistantContent = buildLowConfidenceToolQuestion();
        action = "clarification";
        executionState = "needs_clarification";
      } else if (confidenceAction === "confirm") {
        assistantContent = buildToolConfirmationQuestion({
          tool,
        });
        action = "clarification";
        executionState = "needs_clarification";
        pendingToolConfirmation = {
          mode: "confirmation",
          toolName: decision.tool_name,
          arguments: normalizedArguments,
          confidence,
          createdAt: new Date().toISOString(),
        };
      } else {
        const execution = await executeProviderTool({
          providerConfig,
          providerId: input.provider_id,
          userId: input.user_id,
          threadId,
          toolName: decision.tool_name,
          args: normalizedArguments,
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
            confidence,
          },
        });
      }
    }
  }

  const withAssistant = await appendMessagesToThread({
    threadId,
    messages: [createAssistantMessage(assistantContent)],
    pendingToolConfirmation,
  });

  const finalContext = await saveProviderUserContext({
    ...currentContext,
    selectedModel: model,
    threads: updateThreadSummaries(
      currentContext.threads,
      buildThreadSummary(thread, withAssistant.messages),
    ),
    channels: updateChannelState({
      context: currentContext,
      channel: input.channel,
      threadId,
    }),
  });

  scheduleBackgroundTask(
    refreshProviderMemories({
      threadId,
      state: withAssistant,
      thread:
        finalContext.threads.find((entry) => entry.id === threadId) ?? thread,
      context: finalContext,
      isPrivate: thread.isTemporary,
      timeZone,
    }).then(() => undefined),
  );

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
    response: {
      type: getConversationResponseKind({
        action,
        executionState,
        pendingToolConfirmation,
      }),
      content: assistantContent,
      reasoning: decisionReasoning,
      task_status:
        executionState ?? (action === "tool_call" ? "completed" : null),
    },
    model: model || finalContext.selectedModel,
  };
};
