"use server";

import { env } from "cloudflare:workers";
import { requestInfo, serverQuery } from "rwsdk/worker";

import { loadChatSession, saveChatSession } from "./chat.storage";
import {
  MAX_CONTEXT_MESSAGES,
  createAssistantMessage,
  createInitialChatState,
  createUserMessage,
  type ChatMessage,
  type ChatSessionState,
} from "./shared";

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

const requireChatSessionId = () => {
  const sessionId = requestInfo.ctx.session?.chatId;

  if (!sessionId) {
    throw new Error("No active chat session found. Refresh the page and try again.");
  }

  return sessionId;
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
        "X-Title": env.OPENROUTER_SITE_NAME || "Texty AI",
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

      return {
        model: reply.model,
        session: nextState,
      };
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
    const nextState = createInitialChatState();

    await saveChatSession(sessionId, nextState);

    return nextState;
  },
  { method: "POST" },
);
