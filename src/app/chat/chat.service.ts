"use server";

import { env } from "cloudflare:workers";
import { requestInfo, serverQuery } from "rwsdk/worker";

import { loadChatSession, saveChatSession } from "./chat.storage";
import {
  MAX_CONTEXT_MESSAGES,
  createAssistantMessage,
  createInitialChatState,
  createThreadSummary,
  createUserMessage,
  getThreadTitleFromMessages,
  type ChatMessage,
  type ChatSessionState,
  type ChatThreadSummary,
} from "./shared";
import { browserSessionStore, type BrowserSession } from "../session/session";

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
  await browserSessionStore.save(requestInfo.response.headers, session, {
    maxAge: true,
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
  title: getThreadTitleFromMessages(messages),
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
  session: threadSession,
  ...(model ? { model } : {}),
});

const createAndPersistThread = async () => {
  const currentSession = requireBrowserSession();
  const nextThreadId = crypto.randomUUID();
  const nextThreadState = createInitialChatState();

  await saveChatSession(nextThreadId, nextThreadState);

  const nextSession: BrowserSession = {
    activeThreadId: nextThreadId,
    threads: [
      createThreadSummary(nextThreadId, nextThreadState.messages.length),
      ...currentSession.threads,
    ],
  };

  await persistBrowserSession(nextSession);

  return formatThreadState(nextSession, nextThreadState);
};

const generateAssistantReply = async (messages: ChatMessage[]) => {
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
  async (rawMessage: string) => {
    const content = rawMessage.trim();

    if (!content) {
      throw new Error("Please enter a message before sending.");
    }

    const sessionId = requireChatSessionId();
    const browserSession = requireBrowserSession();
    const currentState = await loadChatSession(sessionId);
    const withUserMessage = {
      messages: [...currentState.messages, createUserMessage(content)],
    };

    await saveChatSession(sessionId, withUserMessage);

    try {
      const reply = await generateAssistantReply(withUserMessage.messages);
      const nextState = {
        messages: [...withUserMessage.messages, createAssistantMessage(reply.content)],
      };

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
          buildThreadSummary(currentSummary, nextState.messages),
        ),
      };

      await persistBrowserSession(nextSession);

      return formatThreadState(nextSession, nextState, reply.model);
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
  async () => createAndPersistThread(),
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
