import { createEmptyGlobalMemory, type GlobalMemory } from "../chat/shared.ts";

import type {
  AllowedTool,
  MemoryPolicy,
  ProviderExecutionState,
} from "./provider.types";

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

const TOOL_SHORTCUT_PATTERN = /^@(?:\[(.+?)\]|([A-Za-z0-9._-]+))(?:\s+([\s\S]*))?$/;
const TOOL_SHORTCUT_EXIT_PATTERN =
  /^that'?s all for\s+(@(?:\[(.+?)\]|([A-Za-z0-9._-]+))|(.+))$/i;

export const parseToolShortcutInvocation = ({
  content,
  tools,
}: {
  content: string;
  tools: AllowedTool[];
}) => {
  const match = content.trim().match(TOOL_SHORTCUT_PATTERN);

  if (!match) {
    return null;
  }

  const requestedToolName = (match[1] || match[2] || "").trim();

  if (!requestedToolName) {
    return null;
  }

  const tool = tools.find(
    (entry) =>
      entry.status === "active" &&
      entry.toolName.toLowerCase() === requestedToolName.toLowerCase(),
  );

  if (!tool) {
    return null;
  }

  const remainder = match[3]?.trim() || "";

  return {
    tool,
    remainder,
  };
};

export const isToolShortcutExitInput = ({
  content,
  toolName,
}: {
  content: string;
  toolName: string;
}) => {
  const trimmed = content.trim();
  const match = trimmed.match(TOOL_SHORTCUT_EXIT_PATTERN);

  if (!match) {
    return false;
  }

  const requestedToolName = (match[2] || match[3] || match[4] || "")
    .trim()
    .toLowerCase();

  return Boolean(requestedToolName) && requestedToolName === toolName.trim().toLowerCase();
};

const getToolSchemaProperties = (tool: AllowedTool) => {
  const properties = tool.inputSchema?.properties;

  if (!properties || typeof properties !== "object") {
    return {};
  }

  return properties as Record<string, unknown>;
};

export const buildShortcutToolArguments = ({
  tool,
  content,
}: {
  tool: AllowedTool;
  content: string;
}) => {
  const properties = getToolSchemaProperties(tool);
  const propertyEntries = Object.entries(properties).filter(([, value]) =>
    Boolean(value && typeof value === "object"),
  );
  const preferredStringFields = ["text", "input", "message", "content", "prompt"];
  const preferredArrayFields = ["texts", "messages", "lines", "todo_items"];

  const stringField = preferredStringFields.find((fieldName) => {
    const property = properties[fieldName] as { type?: unknown } | undefined;
    return property?.type === "string";
  });

  if (stringField) {
    return {
      [stringField]: content,
    };
  }

  const singleStringField = propertyEntries.find(([, value]) => {
    const property = value as { type?: unknown };
    return property.type === "string";
  });

  if (singleStringField && propertyEntries.length === 1) {
    return {
      [singleStringField[0]]: content,
    };
  }

  const arrayField = preferredArrayFields.find((fieldName) => {
    const property = properties[fieldName] as
      | { type?: unknown; items?: { type?: unknown } }
      | undefined;
    return property?.type === "array" && property.items?.type === "string";
  });

  if (arrayField) {
    return {
      [arrayField]: [content],
    };
  }

  const singleStringArrayField = propertyEntries.find(([, value]) => {
    const property = value as { type?: unknown; items?: { type?: unknown } };
    return property.type === "array" && property.items?.type === "string";
  });

  if (singleStringArrayField && propertyEntries.length === 1) {
    return {
      [singleStringArrayField[0]]: [content],
    };
  }

  return {};
};

const TODO_ITEM_VERB_PATTERN =
  /^(call|email|buy|send|pay|book|schedule|cancel|renew|reply|write|pick up|pickup|drop off|follow up|text|message|plan|order|get|wash|clean|groom|feed|walk|take|make|finish|submit|check|review|prepare)\b/i;

export const splitTodoItemsFromText = (value: string) => {
  const normalized = value
    .replace(/\b(?:to do|todo)\s+list\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return [];
  }

  const parts = normalized
    .split(/\s*(?:,|;|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);

  if (
    parts.length > 1 &&
    parts.every((part) => TODO_ITEM_VERB_PATTERN.test(part))
  ) {
    return parts;
  }

  return [normalized];
};

export const getRequiredToolArgumentFields = (
  inputSchema: Record<string, unknown> | undefined,
) => {
  if (!inputSchema || typeof inputSchema !== "object") {
    return [];
  }

  const required = (inputSchema as { required?: unknown }).required;

  if (!Array.isArray(required)) {
    return [];
  }

  return required.filter((field): field is string => typeof field === "string");
};

export const hasMeaningfulToolArgumentValue = (value: unknown): boolean => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return Boolean(
      normalized &&
        normalized !== "null" &&
        normalized !== "undefined",
    );
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasMeaningfulToolArgumentValue(item));
  }

  if (value && typeof value === "object") {
    return Object.values(value).some((entry) => hasMeaningfulToolArgumentValue(entry));
  }

  return value !== null && value !== undefined;
};

export const getMissingRequiredToolArgumentFields = ({
  inputSchema,
  args,
}: {
  inputSchema: Record<string, unknown> | undefined;
  args: Record<string, unknown>;
}) =>
  getRequiredToolArgumentFields(inputSchema).filter(
    (field) => !hasMeaningfulToolArgumentValue(args[field]),
  );

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
