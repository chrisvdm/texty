import { createEmptyGlobalMemory, type GlobalMemory } from "../chat/shared.ts";

import type { MemoryPolicy, ProviderExecutionState } from "./provider.types";

export const CONVERSATION_RATE_LIMIT_WINDOW_MS = 60_000;
export const CONVERSATION_RATE_LIMIT_MAX_REQUESTS = 30;
export const TOOLS_SYNC_RATE_LIMIT_WINDOW_MS = 60_000;
export const TOOLS_SYNC_RATE_LIMIT_MAX_REQUESTS = 10;
export const TOOL_CONFIRMATION_MIN_CONFIDENCE = 0.6;
export const TOOL_CONFIRMATION_MAX_CONFIDENCE = 0.75;

export const clampDecisionConfidence = (
  value: unknown,
  fallback = 1,
) => {
  const numericValue =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

  if (numericValue < 0) {
    return 0;
  }

  if (numericValue > 1) {
    return 1;
  }

  return numericValue;
};

export const getToolDecisionConfidenceAction = (confidence: number) => {
  if (confidence < TOOL_CONFIRMATION_MIN_CONFIDENCE) {
    return "clarify" as const;
  }

  if (confidence <= TOOL_CONFIRMATION_MAX_CONFIDENCE) {
    return "confirm" as const;
  }

  return "execute" as const;
};

const CONFIRM_WORDS = [
  "yes",
  "yeah",
  "yep",
  "yup",
  "correct",
  "that is right",
  "that's right",
  "thats right",
  "please do",
  "go ahead",
  "do it",
  "okay",
  "ok",
  "sure",
];

const REJECT_WORDS = [
  "no",
  "nope",
  "nah",
  "wrong",
  "don't",
  "dont",
  "do not",
  "not that",
  "not quite",
  "stop",
  "cancel",
];

export const interpretPendingToolConfirmation = (input: string) => {
  const normalized = input.trim().toLowerCase();

  if (!normalized) {
    return "unknown" as const;
  }

  if (CONFIRM_WORDS.some((phrase) => normalized === phrase || normalized.startsWith(`${phrase} `))) {
    return "confirm" as const;
  }

  if (REJECT_WORDS.some((phrase) => normalized === phrase || normalized.startsWith(`${phrase} `))) {
    return "reject" as const;
  }

  return "unknown" as const;
};

export const extractPendingToolConfirmationRemainder = (input: string) => {
  const trimmed = input.trim();
  const normalized = trimmed.toLowerCase();

  for (const phrase of CONFIRM_WORDS) {
    if (normalized === phrase) {
      return "";
    }

    if (
      normalized.startsWith(`${phrase} `) ||
      normalized.startsWith(`${phrase},`) ||
      normalized.startsWith(`${phrase}.`) ||
      normalized.startsWith(`${phrase}!`)
    ) {
      const remainder = trimmed.slice(phrase.length).trim();

      return remainder
        .replace(/^[\s,!.:-]+/, "")
        .replace(
          /^(?:thanks|thank you|please|pls|ok|okay|sure)\b[\s,!.:-]*/i,
          "",
        )
        .trim();
    }
  }

  return "";
};

export const extractToolStringValue = ({
  content,
  fieldName,
}: {
  content: string;
  fieldName: string;
}) => {
  const trimmed = content.trim();
  const escapedFieldName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `^(?:please\\s+)?(?:add|save|store|remember|note(?:\\s+down)?|write(?:\\s+down)?)\\s+(.+?)\\s+(?:to|in|into)\\s+(?:the\\s+)?${escapedFieldName}$`,
      "i",
    ),
    new RegExp(
      `^(?:please\\s+)?(?:add|save|store|remember|note(?:\\s+down)?|write(?:\\s+down)?)\\s+(?:this\\s+)?${escapedFieldName}\\s*[:,-]?\\s*(.+)$`,
      "i",
    ),
    new RegExp(`^(?:please\\s+)?${escapedFieldName}\\s*[:,-]?\\s*(.+)$`, "i"),
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    const candidate = match?.[1]?.trim();

    if (candidate) {
      return candidate;
    }
  }

  return null;
};

export const selectProviderGlobalMemory = ({
  memoryPolicy,
  globalMemory,
  isPrivate,
}: {
  memoryPolicy: MemoryPolicy;
  globalMemory: GlobalMemory;
  isPrivate: boolean;
}) => {
  if (isPrivate) {
    return createEmptyGlobalMemory();
  }

  if (memoryPolicy.mode === "provider_user" || memoryPolicy.mode === "custom_scope") {
    return globalMemory;
  }

  return createEmptyGlobalMemory();
};

export const applyConversationRateLimit = ({
  timestamps,
  now = Date.now(),
  maxRequests = CONVERSATION_RATE_LIMIT_MAX_REQUESTS,
  windowMs = CONVERSATION_RATE_LIMIT_WINDOW_MS,
}: {
  timestamps: string[];
  now?: number;
  maxRequests?: number;
  windowMs?: number;
}) => {
  const cutoff = now - windowMs;
  const validTimestamps = timestamps.filter((value) => {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && parsed >= cutoff;
  });

  if (validTimestamps.length >= maxRequests) {
    const oldestTimestamp = Date.parse(validTimestamps[0] ?? "");
    const retryAfterMs = Number.isFinite(oldestTimestamp)
      ? Math.max(windowMs - (now - oldestTimestamp), 1_000)
      : windowMs;

    return {
      allowed: false as const,
      timestamps: validTimestamps,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1_000),
    };
  }

  return {
    allowed: true as const,
    timestamps: [...validTimestamps, new Date(now).toISOString()],
  };
};

export const determineMockExecutionState = ({
  toolName,
  args,
}: {
  toolName: string;
  args: Record<string, unknown>;
}): ProviderExecutionState => {
  const requestedState =
    typeof args.mock_state === "string" ? args.mock_state : null;

  if (
    requestedState === "accepted" ||
    requestedState === "in_progress" ||
    requestedState === "needs_clarification" ||
    requestedState === "failed" ||
    requestedState === "completed"
  ) {
    return requestedState;
  }

  if (toolName === "spreadsheet.update_row") {
    const sheet = args.sheet;
    const rowId = args.row_id;
    const values = args.values;

    if (
      typeof sheet !== "string" ||
      !sheet.trim() ||
      typeof rowId !== "string" ||
      !rowId.trim() ||
      !values ||
      typeof values !== "object"
    ) {
      return "needs_clarification";
    }
  }

  return "completed";
};
