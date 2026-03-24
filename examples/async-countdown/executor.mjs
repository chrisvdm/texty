import manifest from "./familiar.json" with { type: "json" };

const COUNTDOWN_SECONDS = 10;
const countdownStore = new Map();

export const toolDefinitions = manifest.tools.map((tool) => ({
  ...tool,
  status: "active",
}));

export const getCountdownsForUser = (userId) =>
  [...(countdownStore.get(userId) ?? [])].sort((left, right) =>
    left.started_at.localeCompare(right.started_at),
  );

const saveCountdown = ({ userId, countdown }) => {
  const current = getCountdownsForUser(userId);
  countdownStore.set(userId, [...current, countdown]);
};

export const markCountdownComplete = ({
  userId,
  executionId,
  completedAt,
}) => {
  const current = getCountdownsForUser(userId);
  const next = current.map((countdown) =>
    countdown.execution_id === executionId
      ? {
          ...countdown,
          status: "completed",
          completed_at: completedAt,
          seconds_remaining: 0,
        }
      : countdown,
  );
  countdownStore.set(userId, next);
  return next.find((countdown) => countdown.execution_id === executionId) ?? null;
};

export const executeToolCall = ({
  payload,
  defaultUserId = "demo_user",
}) => {
  if (payload.tool_name !== "countdown.start") {
    return {
      ok: false,
      state: "failed",
      error: {
        code: "unknown_tool",
        message: `Unknown tool: ${payload.tool_name || "missing"}.`,
      },
    };
  }

  const userId = String(payload.user_id || defaultUserId).trim();
  const executionId = String(payload.execution_id || "").trim();
  const completionMessage =
    typeof payload.arguments?.message === "string" && payload.arguments.message.trim()
      ? payload.arguments.message.trim()
      : "Countdown complete.";
  const startedAt = new Date().toISOString();
  const completesAt = new Date(Date.now() + COUNTDOWN_SECONDS * 1000).toISOString();

  saveCountdown({
    userId,
    countdown: {
      execution_id: executionId,
      status: "running",
      started_at: startedAt,
      completes_at: completesAt,
      completed_at: null,
      seconds_remaining: COUNTDOWN_SECONDS,
      completion_message: completionMessage,
    },
  });

  return {
    ok: true,
    state: "accepted",
    result: {
      summary: `Started a ${COUNTDOWN_SECONDS} second countdown.`,
      data: {
        execution_id: executionId,
        seconds: COUNTDOWN_SECONDS,
        completion_message: completionMessage,
      },
    },
  };
};
