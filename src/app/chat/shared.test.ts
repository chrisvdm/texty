import assert from "node:assert/strict";
import test from "node:test";

import { normalizeChatSessionState } from "./shared.ts";

test("normalizeChatSessionState preserves pending confirmation arguments with arrays", () => {
  const state = normalizeChatSessionState({
    messages: [],
    pendingToolConfirmation: {
      mode: "confirmation",
      toolName: "todos.add",
      arguments: {
        todo_items: ["email my boss"],
      },
      confidence: 0.7,
      createdAt: "2026-03-23T12:00:00.000Z",
    },
  });

  assert.deepEqual(state.pendingToolConfirmation, {
    mode: "confirmation",
    toolName: "todos.add",
    arguments: {
      todo_items: ["email my boss"],
    },
    confidence: 0.7,
    createdAt: "2026-03-23T12:00:00.000Z",
    question: undefined,
  });
});
