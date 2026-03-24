import manifest from "./familiar.json" with { type: "json" };

const toolDefinitions = manifest.tools.map((tool) => ({
  ...tool,
  status: "active",
}));

const noteStore = new Map();
const ideaStore = new Map();

const getStoreForTool = (toolName) =>
  toolName === "notes.capture" ? noteStore : ideaStore;

const getLabelForTool = (toolName) =>
  toolName === "notes.capture" ? "note" : "idea";

const getEntries = ({ toolName, userId }) => [...(getStoreForTool(toolName).get(userId) ?? [])];

const appendEntry = ({ toolName, userId, content, executionId }) => {
  const store = getStoreForTool(toolName);
  const current = getEntries({ toolName, userId });
  const entry = {
    id: crypto.randomUUID(),
    execution_id: executionId,
    text: content,
    created_at: new Date().toISOString(),
  };
  store.set(userId, [...current, entry]);
  return entry;
};

const normalizeMessage = (payload) => {
  const explicit =
    typeof payload.arguments?.message === "string"
      ? payload.arguments.message.trim()
      : "";
  const rawInput =
    typeof payload.context?.raw_input_text === "string"
      ? payload.context.raw_input_text.trim()
      : "";

  return explicit || rawInput;
};

export const getToolEntriesForUser = ({ toolName, userId }) =>
  getEntries({ toolName, userId });

export { toolDefinitions };

export const executeToolCall = ({
  payload,
  defaultUserId = "demo_user",
}) => {
  const toolName = String(payload.tool_name || "").trim();

  if (toolName !== "notes.capture" && toolName !== "ideas.capture") {
    return {
      ok: false,
      state: "failed",
      error: {
        code: "unknown_tool",
        message: `Unknown tool: ${toolName || "missing"}.`,
      },
    };
  }

  const message = normalizeMessage(payload);

  if (!message) {
    return {
      ok: true,
      state: "needs_clarification",
      result: {
        summary: `What should I capture in ${getLabelForTool(toolName)}s?`,
      },
    };
  }

  const userId = String(payload.user_id || defaultUserId).trim();
  const executionId = String(payload.execution_id || "").trim();
  const entry = appendEntry({
    toolName,
    userId,
    content: message,
    executionId,
  });
  const label = getLabelForTool(toolName);

  return {
    ok: true,
    state: "completed",
    result: {
      summary: `Captured ${label}: ${message}`,
      data: {
        entry,
        entries: getEntries({ toolName, userId }),
      },
    },
  };
};
