import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyGlobalMemory } from "../chat/shared.ts";

import {
  applyConversationRateLimit,
  buildShortcutToolArguments,
  clampDecisionConfidence,
  determineMockExecutionState,
  extractPendingToolConfirmationRemainder,
  extractToolStringValue,
  getMissingRequiredToolArgumentFields,
  getToolDecisionConfidenceAction,
  hasMeaningfulToolArgumentValue,
  interpretPendingToolConfirmation,
  isToolShortcutExitInput,
  parseToolShortcutInvocation,
  selectProviderGlobalMemory,
  splitTodoItemsFromText,
} from "./provider.logic.ts";

test("private threads do not expose shared global memory", () => {
  const globalMemory = createEmptyGlobalMemory();
  globalMemory.identity.name = [
    {
      key: "name",
      value: "Chris",
      confidence: 0.99,
      updatedAt: "2026-03-19T10:00:00.000Z",
    },
  ];

  const result = selectProviderGlobalMemory({
    memoryPolicy: { mode: "provider_user" },
    globalMemory,
    isPrivate: true,
  });

  assert.deepEqual(result.identity, {});
});

test("provider-user retrieval can use shared global memory", () => {
  const globalMemory = createEmptyGlobalMemory();
  globalMemory.identity.name = [
    {
      key: "name",
      value: "Chris",
      confidence: 0.99,
      updatedAt: "2026-03-19T10:00:00.000Z",
    },
  ];

  const result = selectProviderGlobalMemory({
    memoryPolicy: { mode: "provider_user" },
    globalMemory,
    isPrivate: false,
  });

  assert.equal(result.identity.name?.[0]?.value, "Chris");
});

test("rate limiter allows requests under the rolling limit", () => {
  const now = Date.parse("2026-03-19T10:00:30.000Z");
  const timestamps = [
    "2026-03-19T10:00:00.000Z",
    "2026-03-19T10:00:10.000Z",
  ];

  const result = applyConversationRateLimit({
    timestamps,
    now,
    maxRequests: 3,
    windowMs: 60_000,
  });

  assert.equal(result.allowed, true);
  if (result.allowed) {
    assert.equal(result.timestamps.length, 3);
  }
});

test("rate limiter blocks requests over the rolling limit", () => {
  const now = Date.parse("2026-03-19T10:00:30.000Z");
  const timestamps = [
    "2026-03-19T10:00:00.000Z",
    "2026-03-19T10:00:10.000Z",
    "2026-03-19T10:00:20.000Z",
  ];

  const result = applyConversationRateLimit({
    timestamps,
    now,
    maxRequests: 3,
    windowMs: 60_000,
  });

  assert.equal(result.allowed, false);
  if (!result.allowed) {
    assert.equal(result.retryAfterSeconds, 30);
  }
});

test("mock execution requests clarification when spreadsheet arguments are incomplete", () => {
  const result = determineMockExecutionState({
    toolName: "spreadsheet.update_row",
    args: {
      sheet: "Sales",
    },
  });

  assert.equal(result, "needs_clarification");
});

test("mock execution respects explicit requested states", () => {
  const result = determineMockExecutionState({
    toolName: "spreadsheet.update_row",
    args: {
      mock_state: "accepted",
    },
  });

  assert.equal(result, "accepted");
});

test("mock execution completes when spreadsheet arguments are present", () => {
  const result = determineMockExecutionState({
    toolName: "spreadsheet.update_row",
    args: {
      sheet: "Sales",
      row_id: "42",
      values: {
        status: "contacted",
      },
    },
  });

  assert.equal(result, "completed");
});

test("tool confidence below the confirmation band asks for clarification", () => {
  assert.equal(getToolDecisionConfidenceAction(0.59), "clarify");
});

test("tool confidence inside the confirmation band asks for confirmation", () => {
  assert.equal(getToolDecisionConfidenceAction(0.6), "confirm");
  assert.equal(getToolDecisionConfidenceAction(0.75), "confirm");
});

test("tool confidence above the confirmation band executes immediately", () => {
  assert.equal(getToolDecisionConfidenceAction(0.76), "execute");
});

test("decision confidence is clamped into the valid range", () => {
  assert.equal(clampDecisionConfidence(-1), 0);
  assert.equal(clampDecisionConfidence(2), 1);
  assert.equal(clampDecisionConfidence("bad", 0.9), 0.9);
});

test("pending tool confirmation recognizes yes-like replies", () => {
  assert.equal(interpretPendingToolConfirmation("yes"), "confirm");
  assert.equal(interpretPendingToolConfirmation("go ahead"), "confirm");
});

test("pending tool confirmation can keep extra text after confirmation", () => {
  assert.equal(
    extractPendingToolConfirmationRemainder(
      "yes thanks. I also need to buy him a birthday present",
    ),
    "I also need to buy him a birthday present",
  );
});

test("pending tool confirmation recognizes no-like replies", () => {
  assert.equal(interpretPendingToolConfirmation("no"), "reject");
  assert.equal(interpretPendingToolConfirmation("don't do that"), "reject");
});

test("pending tool confirmation leaves other replies unresolved", () => {
  assert.equal(
    interpretPendingToolConfirmation("tell me more about that"),
    "unknown",
  );
});

test("tool string extraction strips add-to-note phrasing", () => {
  assert.equal(
    extractToolStringValue({
      content: "add wash hair to note",
      fieldName: "note",
    }),
    "wash hair",
  );
});

test("tool string extraction strips save-note phrasing", () => {
  assert.equal(
    extractToolStringValue({
      content: "save this note: buy dog food",
      fieldName: "note",
    }),
    "buy dog food",
  );
});

test("tool shortcut invocation resolves an active tool and keeps the raw remainder", () => {
  const result = parseToolShortcutInvocation({
    content: "@todos.add buy milk and eggs",
    tools: [
      {
        toolName: "todos.add",
        description: "Add todo items",
        inputSchema: {
          type: "object",
          properties: {
            todo_items: {
              type: "array",
              items: {
                type: "string",
              },
            },
          },
        },
        policy: {},
        status: "active",
      },
    ],
  });

  assert.equal(result?.tool.toolName, "todos.add");
  assert.equal(result?.remainder, "buy milk and eggs");
});

test("tool shortcut invocation still accepts bracket form for compatibility", () => {
  const result = parseToolShortcutInvocation({
    content: "@[todos.add] buy milk and eggs",
    tools: [
      {
        toolName: "todos.add",
        description: "Add todo items",
        inputSchema: {
          type: "object",
          properties: {
            todo_items: {
              type: "array",
              items: {
                type: "string",
              },
            },
          },
        },
        policy: {},
        status: "active",
      },
    ],
  });

  assert.equal(result?.tool.toolName, "todos.add");
  assert.equal(result?.remainder, "buy milk and eggs");
});

test("tool shortcut exit phrases are recognized", () => {
  assert.equal(
    isToolShortcutExitInput({
      content: "that's all for todos.add",
      toolName: "todos.add",
    }),
    true,
  );
  assert.equal(
    isToolShortcutExitInput({
      content: "that's all for @todos.add",
      toolName: "todos.add",
    }),
    true,
  );
  assert.equal(
    isToolShortcutExitInput({
      content: "that's all for @[todos.add]",
      toolName: "todos.add",
    }),
    true,
  );
  assert.equal(
    isToolShortcutExitInput({
      content: "that's all for countdown.start",
      toolName: "todos.add",
    }),
    false,
  );
  assert.equal(
    isToolShortcutExitInput({
      content: "keep going",
      toolName: "todos.add",
    }),
    false,
  );
});

test("shortcut arguments preserve a verbatim string for array tools", () => {
  const args = buildShortcutToolArguments({
    tool: {
      toolName: "todos.add",
      description: "Add todo items",
      inputSchema: {
        type: "object",
        properties: {
          todo_items: {
            type: "array",
            items: {
              type: "string",
            },
          },
        },
      },
      policy: {},
      status: "active",
    },
    content: "buy milk and eggs",
  });

  assert.deepEqual(args, {
    todo_items: ["buy milk and eggs"],
  });
});

test("todo item splitting produces multiple items for compound task text", () => {
  assert.deepEqual(splitTodoItemsFromText("wash my dog and buy dad a present"), [
    "wash my dog",
    "buy dad a present",
  ]);
});

test("required tool argument detection treats empty strings as missing", () => {
  assert.deepEqual(
    getMissingRequiredToolArgumentFields({
      inputSchema: {
        type: "object",
        required: ["sheet", "row_id"],
      },
      args: {
        sheet: "Sales",
        row_id: "   ",
      },
    }),
    ["row_id"],
  );
});

test("required tool argument detection treats non-empty arrays as present", () => {
  assert.equal(hasMeaningfulToolArgumentValue(["buy milk"]), true);
  assert.equal(hasMeaningfulToolArgumentValue([]), false);
});
