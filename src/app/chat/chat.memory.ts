import { env } from "cloudflare:workers";

import {
  buildGlobalMemoryMarkdown,
  buildThreadMemoryMarkdown,
  type ChatMessage,
  type GlobalMemory,
  type GlobalThreadSummary,
  type MemoryFact,
  type ThreadMemory,
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

type RawMemoryFact = {
  key?: string;
  value?: string;
  confidence?: number;
  source_message_ids?: string[];
};

type MemoryExtraction = {
  thread_summary?: string;
  thread_keywords?: string[];
  thread_facts?: RawMemoryFact[];
  profile_facts?: RawMemoryFact[];
};

const DEFAULT_MODEL = "openai/gpt-4o-mini";
const EXTRACTION_MESSAGE_LIMIT = 12;
const MEMORY_FACT_LIMIT = 6;
const MEMORY_SNIPPET_LIMIT = 3;
const MEMORY_THREAD_SUMMARY_LIMIT = 4;
const GLOBAL_MEMORY_KEYS = new Set([
  "name",
  "children_count",
  "child_name",
  "children_names",
  "sibling_count",
  "sibling_name",
  "siblings",
  "spouse_name",
  "partner_name",
  "wife_name",
  "husband_name",
  "family_history",
  "profession",
  "business",
  "location",
  "dog_name",
  "cat_name",
  "pet_name",
  "interest",
  "interests",
  "preference",
  "preferences",
  "favorite",
  "favorite_food",
  "favorite_drink",
  "favorite_music",
  "favorite_movie",
  "favorite_color",
  "likes",
  "dislikes",
]);

const looksLikePreference = (value: string) =>
  /\b(love|like|prefer|favorite|fan|enthusiast|hobby|hobbyist|phile|obsessed)\b/i.test(
    value,
  );

const isPlausibleName = (value: string) =>
  /^[A-Z][a-z]+(?: [A-Z][a-z]+){0,2}$/.test(value.trim());

const isPlausibleCount = (value: string) => {
  const count = Number.parseInt(value.trim(), 10);

  return !Number.isNaN(count) && count >= 0 && count <= 20;
};

const isPlausibleProfileText = (value: string) => {
  const normalized = value.trim();

  if (!normalized || normalized.length > 60 || looksLikePreference(normalized)) {
    return false;
  }

  return /^[a-zA-Z][a-zA-Z0-9 -]{1,59}$/.test(normalized);
};

const isPlausiblePetName = (value: string) =>
  /^[A-Z][a-z]+(?: [A-Z][a-z]+)?$/.test(value.trim());

const isPlausiblePreferenceText = (value: string) => {
  const normalized = value.trim();

  if (!normalized || normalized.length > 80) {
    return false;
  }

  return /^[a-zA-Z][a-zA-Z0-9 ,&'-]{1,79}$/.test(normalized);
};

const isPlausibleFamilyText = (value: string) => {
  const normalized = value.trim();

  if (!normalized || normalized.length > 100) {
    return false;
  }

  return /^[a-zA-Z0-9][a-zA-Z0-9 ,&'-]{1,99}$/.test(normalized);
};
const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};
const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "been",
  "from",
  "have",
  "into",
  "just",
  "like",
  "more",
  "some",
  "than",
  "that",
  "them",
  "they",
  "this",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
  "your",
]);

const MEMORY_EXTRACTION_SYSTEM_PROMPT =
  "You extract lightweight durable memory for a personal chat app. Return JSON only. Do not include markdown fences. Capture thread summary, keywords, thread facts, and stable user profile facts. Never invent facts. Prefer facts the user stated directly. Ignore transient tasks, moods, and one-off requests.";

const clampConfidence = (value: number | undefined) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0.7;
  }

  return Math.min(0.99, Math.max(0.1, value));
};

const normalizeFactKey = (key: string) =>
  key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);

const dedupeStrings = (values: string[]) =>
  Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );

const extractJsonObject = (content: string) => {
  const trimmed = content.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  return match?.[0] ?? trimmed;
};

const parseExtraction = (content: string): MemoryExtraction | null => {
  try {
    return JSON.parse(extractJsonObject(content)) as MemoryExtraction;
  } catch {
    return null;
  }
};

const createHeuristicFact = ({
  key,
  value,
  confidence,
  timestamp,
  threadId,
  messageId,
}: {
  key: string;
  value: string;
  confidence: number;
  timestamp: string;
  threadId: string;
  messageId: string;
}): MemoryFact => ({
  key,
  value,
  confidence,
  updatedAt: timestamp,
  sourceThreadId: threadId,
  sourceMessageIds: [messageId],
});

const tokenize = (input: string) =>
  Array.from(
    new Set(
      input
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 2 && !STOP_WORDS.has(token)),
    ),
  );

const scoreTextAgainstQuery = (text: string, queryTokens: string[]) => {
  if (queryTokens.length === 0) {
    return 0;
  }

  const haystack = tokenize(text);
  return queryTokens.reduce(
    (score, token) => (haystack.includes(token) ? score + 1 : score),
    0,
  );
};

const isPersonalMemoryQuery = (query: string) =>
  /\b(my|me|i am|i'm|name|family|kids|children|wife|husband|partner|job|work|profession|bio|remember)\b/i.test(
    query,
  );

const getMessagesForExtraction = (messages: ChatMessage[]) =>
  messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-EXTRACTION_MESSAGE_LIMIT)
    .map(
      (message) =>
        `- id=${message.id}; role=${message.role}; at=${message.createdAt}; content=${JSON.stringify(message.content)}`,
    )
    .join("\n");

const toMemoryFact = ({
  rawFact,
  timestamp,
  threadId,
}: {
  rawFact: RawMemoryFact;
  timestamp: string;
  threadId: string;
}): MemoryFact | null => {
  const rawKey = rawFact.key?.trim() ?? "";
  const value = rawFact.value?.trim() ?? "";

  if (!rawKey || !value) {
    return null;
  }

  const key = normalizeFactKey(rawKey);

  if (!key) {
    return null;
  }

  return {
    key,
    value,
    confidence: clampConfidence(rawFact.confidence),
    updatedAt: timestamp,
    sourceThreadId: threadId,
    sourceMessageIds: dedupeStrings(rawFact.source_message_ids ?? []),
  };
};

const mergeGlobalFacts = (
  currentFacts: MemoryFact[],
  incomingFacts: MemoryFact[],
): MemoryFact[] => {
  const merged = new Map<string, MemoryFact>();

  for (const fact of currentFacts) {
    merged.set(fact.key, fact);
  }

  for (const fact of incomingFacts) {
    const existing = merged.get(fact.key);

    if (!existing) {
      merged.set(fact.key, fact);
      continue;
    }

    if (
      fact.value === existing.value ||
      fact.confidence >= existing.confidence
    ) {
      merged.set(fact.key, fact);
    }
  }

  return Array.from(merged.values()).sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
};

const mergeFactLists = (...factLists: MemoryFact[][]) =>
  mergeGlobalFacts([], factLists.flat());

const mergeThreadSummaries = (
  currentSummaries: GlobalThreadSummary[],
  nextSummary: GlobalThreadSummary,
) =>
  [
    nextSummary,
    ...currentSummaries.filter((entry) => entry.threadId !== nextSummary.threadId),
  ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

const sanitizeGlobalFact = (fact: MemoryFact) => {
  if (!GLOBAL_MEMORY_KEYS.has(fact.key)) {
    return null;
  }

  if (fact.key === "name" && !isPlausibleName(fact.value)) {
    return null;
  }

  if (fact.key === "children_count" && !isPlausibleCount(fact.value)) {
    return null;
  }

  if (
    ["profession", "business", "location"].includes(fact.key) &&
    !isPlausibleProfileText(fact.value)
  ) {
    return null;
  }

  if (
    [
      "interest",
      "interests",
      "preference",
      "preferences",
      "favorite",
      "favorite_food",
      "favorite_drink",
      "favorite_music",
      "favorite_movie",
      "favorite_color",
      "likes",
      "dislikes",
    ].includes(fact.key) &&
    !isPlausiblePreferenceText(fact.value)
  ) {
    return null;
  }

  if (
    [
      "child_name",
      "children_names",
      "sibling_name",
      "siblings",
      "spouse_name",
      "partner_name",
      "wife_name",
      "husband_name",
      "family_history",
    ].includes(fact.key) &&
    !isPlausibleFamilyText(fact.value)
  ) {
    return null;
  }

  if (fact.key === "sibling_count" && !isPlausibleCount(fact.value)) {
    return null;
  }

  if (
    ["dog_name", "cat_name", "pet_name"].includes(fact.key) &&
    !isPlausiblePetName(fact.value)
  ) {
    return null;
  }

  return fact;
};

const promoteThreadFactsToGlobalFacts = (facts: MemoryFact[]) =>
  facts
    .map((fact) => sanitizeGlobalFact(fact))
    .filter((fact): fact is MemoryFact => fact !== null);

const parseCount = (rawValue: string) => {
  const normalized = rawValue.trim().toLowerCase();
  const numericValue = Number.parseInt(normalized, 10);

  if (!Number.isNaN(numericValue)) {
    return numericValue;
  }

  return NUMBER_WORDS[normalized] ?? null;
};

const extractProfileFactsHeuristically = ({
  messages,
  threadId,
  timestamp,
}: {
  messages: ChatMessage[];
  threadId: string;
  timestamp: string;
}) => {
  const heuristicFacts: MemoryFact[] = [];

  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }

    const content = message.content.trim();

    const nameMatch = content.match(
      /\bmy name is ([A-Z][a-z]+(?: [A-Z][a-z]+){0,2})\b/i,
    );

    if (nameMatch) {
      heuristicFacts.push(
        createHeuristicFact({
          key: "name",
          value: nameMatch[1].trim(),
          confidence: 0.98,
          timestamp,
          threadId,
          messageId: message.id,
        }),
      );
    }

    const childrenMatch = content.match(
      /\bi have (\d+|one|two|three|four|five|six|seven|eight|nine|ten) (kids|children)\b/i,
    );

    if (childrenMatch) {
      const count = parseCount(childrenMatch[1]);

      if (count !== null) {
        heuristicFacts.push(
          createHeuristicFact({
            key: "children_count",
            value: String(count),
            confidence: 0.96,
            timestamp,
            threadId,
            messageId: message.id,
          }),
        );
      }
    }

    const professionMatch = content.match(
      /\b(?:i work as|i am|i'm) an? ([a-z][a-z0-9 -]{1,60})\b/i,
    );

    if (
      professionMatch &&
      !/\b(tired|hungry|busy|ready|excited|sad|happy|stressed)\b/i.test(
        professionMatch[1],
      )
    ) {
      heuristicFacts.push(
        createHeuristicFact({
          key: "profession",
          value: professionMatch[1].trim(),
          confidence: 0.88,
          timestamp,
          threadId,
          messageId: message.id,
        }),
      );
    }

    const businessMatch = content.match(
      /\bi (run|own) an? ([a-z][a-z0-9 -]{1,60})\b/i,
    );

    if (businessMatch) {
      heuristicFacts.push(
        createHeuristicFact({
          key: "business",
          value: businessMatch[2].trim(),
          confidence: 0.86,
          timestamp,
          threadId,
          messageId: message.id,
        }),
      );
    }
  }

  return mergeFactLists(heuristicFacts).slice(0, MEMORY_FACT_LIMIT);
};

const getRelevantFacts = (facts: MemoryFact[], queryTokens: string[]) =>
  facts
    .map((fact) => ({
      fact,
      score: scoreTextAgainstQuery(`${fact.key} ${fact.value}`, queryTokens),
    }))
    .filter(({ score }, index) => score > 0 || (queryTokens.length === 0 && index < 3))
    .sort((left, right) => right.score - left.score)
    .slice(0, MEMORY_FACT_LIMIT)
    .map(({ fact }) => fact);

const getTopFacts = (facts: MemoryFact[]) =>
  [...facts]
    .sort((left, right) => {
      if (right.confidence !== left.confidence) {
        return right.confidence - left.confidence;
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .slice(0, MEMORY_FACT_LIMIT);

const getRelevantThreadSummaries = ({
  summaries,
  queryTokens,
}: {
  summaries: GlobalThreadSummary[];
  queryTokens: string[];
}) =>
  summaries
    .map((summary) => ({
      summary,
      score: scoreTextAgainstQuery(
        `${summary.title} ${summary.summary} ${summary.keywords.join(" ")}`,
        queryTokens,
      ),
    }))
    .filter(({ score }, index) => score > 0 || (queryTokens.length === 0 && index < 2))
    .sort((left, right) => right.score - left.score)
    .slice(0, MEMORY_THREAD_SUMMARY_LIMIT)
    .map(({ summary }) => summary);

const getTopThreadSummaries = (summaries: GlobalThreadSummary[]) =>
  [...summaries]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, MEMORY_THREAD_SUMMARY_LIMIT);

const getRelevantSnippets = ({
  messages,
  queryTokens,
}: {
  messages: ChatMessage[];
  queryTokens: string[];
}) =>
  messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      message,
      score: scoreTextAgainstQuery(message.content, queryTokens),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, MEMORY_SNIPPET_LIMIT)
    .map(({ message }) => message);

const createMemoryContextSection = ({
  title,
  lines,
}: {
  title: string;
  lines: string[];
}) => {
  if (lines.length === 0) {
    return "";
  }

  return `${title}\n${lines.join("\n")}`;
};

const callOpenRouter = async (messages: OpenRouterMessage[]) => {
  const apiKey = env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured. Add it to .dev.vars for local development and as a Wrangler secret for deployment.",
    );
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": env.OPENROUTER_SITE_URL || "http://localhost:5173",
      "X-Title": env.OPENROUTER_SITE_NAME || "Texty",
    },
    body: JSON.stringify({
      model:
        env.OPENROUTER_MEMORY_MODEL || env.OPENROUTER_MODEL || DEFAULT_MODEL,
      messages,
    }),
  });

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

  return content;
};

export const refreshMemories = async ({
  threadId,
  messages,
  previousThreadMemory,
  globalMemory,
}: {
  threadId: string;
  messages: ChatMessage[];
  previousThreadMemory: ThreadMemory;
  globalMemory: GlobalMemory;
}) => {
  const extractionPrompt = `Previous thread summary: ${
    previousThreadMemory.summary || "(none)"
  }

Existing user facts:
${globalMemory.facts.map((fact) => `- ${fact.key}: ${fact.value}`).join("\n") || "(none)"}

Conversation slice:
${getMessagesForExtraction(messages)}

Return strict JSON with this shape:
{
  "thread_summary": "string",
  "thread_keywords": ["string"],
  "thread_facts": [
    {
      "key": "string",
      "value": "string",
      "confidence": 0.0,
      "source_message_ids": ["message-id"]
    }
  ],
  "profile_facts": [
    {
      "key": "string",
      "value": "string",
      "confidence": 0.0,
      "source_message_ids": ["message-id"]
    }
  ]
}`;

  const rawContent = await callOpenRouter([
    {
      role: "system",
      content: MEMORY_EXTRACTION_SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: extractionPrompt,
    },
  ]);

  const extraction = parseExtraction(rawContent) ?? {};

  const timestamp = new Date().toISOString();
  const threadFacts = (extraction.thread_facts ?? [])
    .map((rawFact) => toMemoryFact({ rawFact, timestamp, threadId }))
    .filter((fact): fact is MemoryFact => fact !== null)
    .slice(0, MEMORY_FACT_LIMIT);
  const threadKeywords = dedupeStrings(extraction.thread_keywords ?? []).slice(0, 12);
  const threadSummary = extraction.thread_summary?.trim() || previousThreadMemory.summary;

  const nextThreadMemory: ThreadMemory = {
    summary: threadSummary,
    keywords: threadKeywords,
    facts: threadFacts,
    markdown: buildThreadMemoryMarkdown({
      summary: threadSummary,
      keywords: threadKeywords,
      facts: threadFacts,
      messages,
    }),
    updatedAt: timestamp,
  };

  const extractedProfileFacts = (extraction.profile_facts ?? [])
    .map((rawFact) => toMemoryFact({ rawFact, timestamp, threadId }))
    .filter((fact): fact is MemoryFact => fact !== null)
    .map((fact) => sanitizeGlobalFact(fact))
    .filter((fact): fact is MemoryFact => fact !== null)
    .slice(0, MEMORY_FACT_LIMIT);
  const heuristicProfileFacts = extractProfileFactsHeuristically({
    messages,
    threadId,
    timestamp,
  });
  const promotedThreadFacts = promoteThreadFactsToGlobalFacts(threadFacts);
  const mergedGlobalFacts = mergeGlobalFacts(
    globalMemory.facts,
    mergeFactLists(
      extractedProfileFacts,
      heuristicProfileFacts,
      promotedThreadFacts,
    ),
  );

  const nextGlobalMemory: GlobalMemory = {
    facts: mergedGlobalFacts,
    threadSummaries: mergeThreadSummaries(globalMemory.threadSummaries, {
      threadId,
      title:
        messages.find((message) => message.role === "user")?.content
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 48) || "Untitled thread",
      summary: nextThreadMemory.summary,
      keywords: nextThreadMemory.keywords,
      updatedAt: timestamp,
    }),
    markdown: "",
    updatedAt: timestamp,
  };
  nextGlobalMemory.markdown = buildGlobalMemoryMarkdown({
    facts: nextGlobalMemory.facts,
    threadSummaries: nextGlobalMemory.threadSummaries,
  });

  return {
    threadMemory: nextThreadMemory,
    globalMemory: nextGlobalMemory,
  };
};

export const buildMemoryContext = ({
  userMessage,
  messages,
  threadMemory,
  globalMemory,
}: {
  userMessage: string;
  messages: ChatMessage[];
  threadMemory: ThreadMemory;
  globalMemory: GlobalMemory;
}) => {
  const queryTokens = tokenize(userMessage);
  const relevantThreadFacts = getRelevantFacts(threadMemory.facts, queryTokens);
  const relevantGlobalFacts = isPersonalMemoryQuery(userMessage)
    ? (() => {
        const matchedFacts = getRelevantFacts(globalMemory.facts, queryTokens);

        if (matchedFacts.length > 0) {
          return matchedFacts;
        }

        return getTopFacts(globalMemory.facts);
      })()
    : getRelevantFacts(globalMemory.facts, queryTokens).filter(
        (fact) => scoreTextAgainstQuery(`${fact.key} ${fact.value}`, queryTokens) > 0,
      );
  const relevantThreadSummaries = getRelevantThreadSummaries({
    summaries: globalMemory.threadSummaries,
    queryTokens,
  });
  const selectedThreadSummaries = isPersonalMemoryQuery(userMessage)
    ? (() => {
        if (relevantThreadSummaries.length > 0) {
          return relevantThreadSummaries;
        }

        return getTopThreadSummaries(globalMemory.threadSummaries);
      })()
    : relevantThreadSummaries;
  const relevantSnippets = getRelevantSnippets({ messages, queryTokens });

  const threadLines = [
    threadMemory.summary ? `Summary: ${threadMemory.summary}` : "",
    ...relevantThreadFacts.map((fact) => `Fact: ${fact.key} = ${fact.value}`),
    ...threadMemory.keywords.slice(0, 6).map((keyword) => `Keyword: ${keyword}`),
    ...relevantSnippets.map(
      (message) => `Snippet (${message.role}): ${message.content}`,
    ),
  ].filter(Boolean);

  const globalLines = relevantGlobalFacts.map(
    (fact) => `Profile: ${fact.key} = ${fact.value}`,
  );
  const summaryLines = selectedThreadSummaries.map(
    (summary) =>
      `Thread node: ${summary.title} -> ${summary.summary}${
        summary.keywords.length > 0 ? ` [${summary.keywords.join(", ")}]` : ""
      }`,
  );

  const sections = [
    createMemoryContextSection({
      title: "Thread memory",
      lines: threadLines,
    }),
    createMemoryContextSection({
      title: "User memory",
      lines: globalLines,
    }),
    createMemoryContextSection({
      title: "Memory tree",
      lines: summaryLines,
    }),
  ].filter(Boolean);

  if (sections.length === 0) {
    return null;
  }

  return sections.join("\n\n");
};
