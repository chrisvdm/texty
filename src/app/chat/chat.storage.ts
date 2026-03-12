import { env } from "cloudflare:workers";

import { normalizeChatSessionState, type ChatSessionState } from "./shared";

const getChatStub = (sessionId: string) => {
  const id = env.CHAT_SESSIONS.idFromName(sessionId);
  return env.CHAT_SESSIONS.get(id);
};

export const loadChatSession = async (sessionId: string) => {
  const result = await getChatStub(sessionId).getSession();

  if ("error" in result) {
    throw new Error(String(result.error));
  }

  return normalizeChatSessionState(result.value);
};

export const saveChatSession = async (
  sessionId: string,
  state: ChatSessionState,
) => {
  const normalizedState = normalizeChatSessionState(state);

  await getChatStub(sessionId).saveSession(normalizedState);
  return normalizedState;
};

export const deleteChatSession = async (sessionId: string) => {
  await getChatStub(sessionId).revokeSession();
};
