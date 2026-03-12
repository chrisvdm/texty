import { DurableObject } from "cloudflare:workers";

import {
  createInitialChatState,
  normalizeChatSessionState,
  type ChatSessionState,
} from "./shared";

const CHAT_STATE_KEY = "chat-state";

export class ChatSessionDurableObject extends DurableObject {
  async getSession() {
    const existingState =
      await this.ctx.storage.get<ChatSessionState>(CHAT_STATE_KEY);

    if (existingState) {
      return { value: normalizeChatSessionState(existingState) };
    }

    const initialState = createInitialChatState();
    await this.ctx.storage.put(CHAT_STATE_KEY, initialState);

    return { value: initialState };
  }

  async saveSession(data: ChatSessionState) {
    const normalizedState = normalizeChatSessionState(data);

    await this.ctx.storage.put(CHAT_STATE_KEY, normalizedState);
    return normalizedState;
  }

  async revokeSession() {
    await this.ctx.storage.delete(CHAT_STATE_KEY);
  }
}
