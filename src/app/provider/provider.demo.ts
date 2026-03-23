export const BUILT_IN_DEMO_PROVIDER_ID = "demo_executor";
export const BUILT_IN_DEMO_TOKEN = "dev-token";
export const BUILT_IN_DEMO_USER_ID = "demo_user";
export const BUILT_IN_DEMO_CHANNEL_ID = "minimal-executor-playground";

const normalizeDemoNote = (value: unknown) => {
  const note = typeof value === "string" ? value.trim() : "";

  if (!note) {
    return "";
  }

  if (note.toLowerCase() === "null" || note.toLowerCase() === "undefined") {
    return "";
  }

  return note;
};

export const executeBuiltInDemoTool = ({
  toolName,
  args,
}: {
  toolName: string;
  args: Record<string, unknown>;
}) => {
  if (toolName !== "notes.echo") {
    return {
      state: "failed" as const,
      message: `Unknown tool: ${toolName || "missing"}.`,
      data: null,
    };
  }

  const note = normalizeDemoNote(args.note);

  if (!note) {
    return {
      state: "needs_clarification" as const,
      message: "What note should I save?",
      data: null,
    };
  }

  return {
    state: "completed" as const,
    message: `Saved note: ${note}`,
    data: {
      note,
    },
  };
};
