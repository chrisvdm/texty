export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
};

export type MemoryFact = {
  key: string;
  value: string;
  confidence: number;
  updatedAt: string;
  sourceThreadId?: string;
  sourceMessageIds?: string[];
};

export type ThreadMemory = {
  summary: string;
  keywords: string[];
  facts: MemoryFact[];
  markdown: string;
  updatedAt: string;
};

export type GlobalThreadSummary = {
  threadId: string;
  title: string;
  summary: string;
  keywords: string[];
  updatedAt: string;
};

export type MemoryFactGroup = Record<string, MemoryFact[]>;

export type PreferenceMemory = {
  favorite: Record<string, MemoryFact[]>;
  likes: MemoryFact[];
  dislikes: MemoryFact[];
  interests: MemoryFact[];
  fears: MemoryFact[];
  general: Record<string, MemoryFact[]>;
};

export type GlobalMemory = {
  identity: MemoryFactGroup;
  family: MemoryFactGroup;
  preferences: PreferenceMemory;
  work: MemoryFactGroup;
  threadSummaries: GlobalThreadSummary[];
  markdown: string;
  updatedAt: string;
};

export type ChatSessionState = {
  messages: ChatMessage[];
  memory: ThreadMemory;
};

export type ChatThreadSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

export const MAX_CONTEXT_MESSAGES = 6;
export const DEFAULT_THREAD_TITLE = "Untitled thread";
export const INITIAL_MESSAGE_COUNT = 1;

const MULTI_VALUE_KEYS = new Set([
  "children_names",
  "siblings",
  "likes",
  "dislikes",
  "interest",
  "interests",
  "fear",
  "fears",
  "favorite",
  "favorite_food",
  "favorite_drink",
  "favorite_music",
  "favorite_movie",
  "favorite_color",
]);

const formatFactLine = (fact: MemoryFact) =>
  `- \`${fact.key}\`: ${fact.value} (${Math.round(fact.confidence * 100)}%)`;

const sortFacts = (facts: MemoryFact[]) =>
  [...facts].sort((left, right) => {
    if (right.confidence !== left.confidence) {
      return right.confidence - left.confidence;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });

const mergeFactArray = ({
  currentFacts,
  incomingFact,
  allowMultiple,
}: {
  currentFacts: MemoryFact[];
  incomingFact: MemoryFact;
  allowMultiple: boolean;
}) => {
  const sameValueIndex = currentFacts.findIndex(
    (fact) => fact.value.trim().toLowerCase() === incomingFact.value.trim().toLowerCase(),
  );

  if (sameValueIndex !== -1) {
    const sameValueFact = currentFacts[sameValueIndex];
    const nextFacts = [...currentFacts];

    if (
      incomingFact.confidence >= sameValueFact.confidence ||
      incomingFact.updatedAt >= sameValueFact.updatedAt
    ) {
      nextFacts[sameValueIndex] = incomingFact;
    }

    return sortFacts(nextFacts);
  }

  if (!allowMultiple) {
    if (currentFacts.length === 0) {
      return [incomingFact];
    }

    const bestCurrent = sortFacts(currentFacts)[0];

    if (
      incomingFact.confidence > bestCurrent.confidence ||
      (incomingFact.confidence === bestCurrent.confidence &&
        incomingFact.updatedAt >= bestCurrent.updatedAt)
    ) {
      return [incomingFact];
    }

    return [bestCurrent];
  }

  return sortFacts([...currentFacts, incomingFact]);
};

const createEmptyPreferenceMemory = (): PreferenceMemory => ({
  favorite: {},
  likes: [],
  dislikes: [],
  interests: [],
  fears: [],
  general: {},
});

const normalizeFactGroup = (group: MemoryFactGroup | undefined): MemoryFactGroup =>
  Object.fromEntries(
    Object.entries(group ?? {})
      .map(([key, facts]) => [key, sortFacts(Array.isArray(facts) ? facts : [])])
      .filter(([, facts]) => facts.length > 0),
  );

const normalizePreferenceMemory = (
  preferences: Partial<PreferenceMemory> | undefined,
): PreferenceMemory => ({
  favorite: normalizeFactGroup(preferences?.favorite),
  likes: sortFacts(preferences?.likes ?? []),
  dislikes: sortFacts(preferences?.dislikes ?? []),
  interests: sortFacts(preferences?.interests ?? []),
  fears: sortFacts(preferences?.fears ?? []),
  general: normalizeFactGroup(preferences?.general),
});

const createEmptyStructuredGlobalMemory = () => ({
  identity: {},
  family: {},
  preferences: createEmptyPreferenceMemory(),
  work: {},
});

const isMultiValueFactKey = (key: string) => MULTI_VALUE_KEYS.has(key);

const placeFactInGroup = (
  group: MemoryFactGroup,
  bucketKey: string,
  fact: MemoryFact,
  allowMultiple = false,
) => {
  group[bucketKey] = mergeFactArray({
    currentFacts: group[bucketKey] ?? [],
    incomingFact: fact,
    allowMultiple,
  });
};

export const addFactToGlobalMemory = (
  memory: GlobalMemory,
  fact: MemoryFact,
): GlobalMemory => {
  const nextMemory: GlobalMemory = {
    ...memory,
    identity: { ...memory.identity },
    family: { ...memory.family },
    work: { ...memory.work },
    preferences: {
      favorite: { ...memory.preferences.favorite },
      likes: [...memory.preferences.likes],
      dislikes: [...memory.preferences.dislikes],
      interests: [...memory.preferences.interests],
      fears: [...memory.preferences.fears],
      general: { ...memory.preferences.general },
    },
  };

  if (fact.key === "name" || fact.key === "location") {
    placeFactInGroup(nextMemory.identity, fact.key, fact);
    return nextMemory;
  }

  if (fact.key === "profession" || fact.key === "business") {
    placeFactInGroup(nextMemory.work, fact.key, fact);
    return nextMemory;
  }

  if (fact.key === "likes") {
    nextMemory.preferences.likes = mergeFactArray({
      currentFacts: nextMemory.preferences.likes,
      incomingFact: fact,
      allowMultiple: true,
    });
    return nextMemory;
  }

  if (fact.key === "dislikes") {
    nextMemory.preferences.dislikes = mergeFactArray({
      currentFacts: nextMemory.preferences.dislikes,
      incomingFact: fact,
      allowMultiple: true,
    });
    return nextMemory;
  }

  if (fact.key === "interest" || fact.key === "interests") {
    nextMemory.preferences.interests = mergeFactArray({
      currentFacts: nextMemory.preferences.interests,
      incomingFact: fact,
      allowMultiple: true,
    });
    return nextMemory;
  }

  if (fact.key === "fear" || fact.key === "fears") {
    nextMemory.preferences.fears = mergeFactArray({
      currentFacts: nextMemory.preferences.fears,
      incomingFact: fact,
      allowMultiple: true,
    });
    return nextMemory;
  }

  if (fact.key === "favorite" || fact.key.startsWith("favorite_")) {
    const category = fact.key === "favorite" ? "general" : fact.key.slice("favorite_".length);
    placeFactInGroup(nextMemory.preferences.favorite, category, fact, true);
    return nextMemory;
  }

  if (fact.key === "preference" || fact.key === "preferences") {
    placeFactInGroup(nextMemory.preferences.general, "general", fact, true);
    return nextMemory;
  }

  placeFactInGroup(
    nextMemory.family,
    fact.key,
    fact,
    isMultiValueFactKey(fact.key),
  );

  return nextMemory;
};

const flattenFactGroup = (group: MemoryFactGroup) =>
  Object.values(group)
    .flat()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

const formatFactGroupMarkdown = (title: string, group: MemoryFactGroup) => {
  const entries = Object.entries(group);

  if (entries.length === 0) {
    return `## ${title}\n\n_None yet._`;
  }

  const lines = entries
    .map(
      ([bucket, facts]) =>
        `### ${bucket}\n\n${facts.map((fact) => formatFactLine(fact)).join("\n")}`,
    )
    .join("\n\n");

  return `## ${title}\n\n${lines}`;
};

export const flattenGlobalMemoryFacts = (memory: GlobalMemory) =>
  [
    ...flattenFactGroup(memory.identity),
    ...flattenFactGroup(memory.family),
    ...flattenFactGroup(memory.work),
    ...flattenFactGroup(memory.preferences.favorite),
    ...memory.preferences.likes,
    ...memory.preferences.dislikes,
    ...memory.preferences.interests,
    ...memory.preferences.fears,
    ...flattenFactGroup(memory.preferences.general),
  ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

const pruneFactArrayByThreadId = (facts: MemoryFact[], threadId: string) =>
  facts.filter((fact) => fact.sourceThreadId !== threadId);

const pruneFactGroupByThreadId = (
  group: MemoryFactGroup,
  threadId: string,
): MemoryFactGroup =>
  Object.fromEntries(
    Object.entries(group)
      .map(([key, facts]) => [key, pruneFactArrayByThreadId(facts, threadId)])
      .filter(([, facts]) => facts.length > 0),
  );

export const pruneGlobalMemoryByThreadId = (
  memory: GlobalMemory,
  threadId: string,
): GlobalMemory => {
  const nextMemory: GlobalMemory = {
    ...memory,
    identity: pruneFactGroupByThreadId(memory.identity, threadId),
    family: pruneFactGroupByThreadId(memory.family, threadId),
    work: pruneFactGroupByThreadId(memory.work, threadId),
    preferences: {
      favorite: pruneFactGroupByThreadId(memory.preferences.favorite, threadId),
      likes: pruneFactArrayByThreadId(memory.preferences.likes, threadId),
      dislikes: pruneFactArrayByThreadId(memory.preferences.dislikes, threadId),
      interests: pruneFactArrayByThreadId(memory.preferences.interests, threadId),
      fears: pruneFactArrayByThreadId(memory.preferences.fears, threadId),
      general: pruneFactGroupByThreadId(memory.preferences.general, threadId),
    },
    threadSummaries: memory.threadSummaries.filter(
      (summary) => summary.threadId !== threadId,
    ),
    markdown: "",
  };

  nextMemory.markdown = buildGlobalMemoryMarkdown({
    memory: nextMemory,
    threadSummaries: nextMemory.threadSummaries,
  });

  return nextMemory;
};

export const buildThreadMemoryMarkdown = ({
  summary,
  keywords,
  facts,
  messages,
}: {
  summary: string;
  keywords: string[];
  facts: MemoryFact[];
  messages: ChatMessage[];
}) => {
  const summaryBlock = summary || "_No thread summary yet._";
  const keywordBlock =
    keywords.length > 0 ? keywords.map((keyword) => `- ${keyword}`).join("\n") : "_None yet._";
  const factBlock =
    facts.length > 0 ? facts.map(formatFactLine).join("\n") : "_No stable thread facts yet._";
  const transcriptBlock = messages
    .map(
      (message) =>
        `### ${message.role}\n\n${message.content}\n\n_At: ${message.createdAt}_`,
    )
    .join("\n\n");

  return `# Thread Memory

## Summary

${summaryBlock}

## Keywords

${keywordBlock}

## Facts

${factBlock}

## Transcript

${transcriptBlock}`;
};

export const buildGlobalMemoryMarkdown = ({
  memory,
  threadSummaries,
}: {
  memory: GlobalMemory;
  threadSummaries: GlobalThreadSummary[];
}) => {
  const summaryBlock =
    threadSummaries.length > 0
      ? threadSummaries
          .map(
            (entry) =>
              `- ${entry.title || "Untitled thread"} [${entry.threadId.slice(0, 8)}]: ${entry.summary}`,
          )
          .join("\n")
      : "_No thread summaries indexed yet._";

  return `# User Memory

${formatFactGroupMarkdown("Identity", memory.identity)}

${formatFactGroupMarkdown("Family", memory.family)}

${formatFactGroupMarkdown("Work", memory.work)}

## Preferences

### Favorite

${
  Object.keys(memory.preferences.favorite).length > 0
    ? Object.entries(memory.preferences.favorite)
        .map(
          ([bucket, facts]) =>
            `#### ${bucket}\n\n${facts.map((fact) => formatFactLine(fact)).join("\n")}`,
        )
        .join("\n\n")
    : "_None yet._"
}

### Likes

${
  memory.preferences.likes.length > 0
    ? memory.preferences.likes.map((fact) => formatFactLine(fact)).join("\n")
    : "_None yet._"
}

### Dislikes

${
  memory.preferences.dislikes.length > 0
    ? memory.preferences.dislikes.map((fact) => formatFactLine(fact)).join("\n")
    : "_None yet._"
}

### Interests

${
  memory.preferences.interests.length > 0
    ? memory.preferences.interests.map((fact) => formatFactLine(fact)).join("\n")
    : "_None yet._"
}

### Fears

${
  memory.preferences.fears.length > 0
    ? memory.preferences.fears.map((fact) => formatFactLine(fact)).join("\n")
    : "_None yet._"
}

### General

${
  Object.keys(memory.preferences.general).length > 0
    ? Object.entries(memory.preferences.general)
        .map(
          ([bucket, facts]) =>
            `#### ${bucket}\n\n${facts.map((fact) => formatFactLine(fact)).join("\n")}`,
        )
        .join("\n\n")
    : "_None yet._"
}

## Thread Summaries

${summaryBlock}`;
};

export const createEmptyThreadMemory = (): ThreadMemory => {
  const timestamp = new Date().toISOString();

  return {
    summary: "",
    keywords: [],
    facts: [],
    markdown: buildThreadMemoryMarkdown({
      summary: "",
      keywords: [],
      facts: [],
      messages: [],
    }),
    updatedAt: timestamp,
  };
};

export const createEmptyGlobalMemory = (): GlobalMemory => {
  const timestamp = new Date().toISOString();
  const memory = {
    ...createEmptyStructuredGlobalMemory(),
    threadSummaries: [],
    markdown: "",
    updatedAt: timestamp,
  } satisfies GlobalMemory;

  memory.markdown = buildGlobalMemoryMarkdown({
    memory,
    threadSummaries: [],
  });

  return memory;
};

export const normalizeThreadMemory = (
  memory: Partial<ThreadMemory> | undefined,
  messages: ChatMessage[],
): ThreadMemory => {
  const normalizedFacts = memory?.facts ?? [];
  const normalizedKeywords = memory?.keywords ?? [];
  const normalizedSummary = memory?.summary ?? "";
  const updatedAt = memory?.updatedAt ?? new Date().toISOString();

  return {
    summary: normalizedSummary,
    keywords: normalizedKeywords,
    facts: normalizedFacts,
    markdown:
      memory?.markdown ??
      buildThreadMemoryMarkdown({
        summary: normalizedSummary,
        keywords: normalizedKeywords,
        facts: normalizedFacts,
        messages,
      }),
    updatedAt,
  };
};

export const normalizeGlobalMemory = (
  memory:
    | (Partial<GlobalMemory> & {
        facts?: MemoryFact[];
      })
    | undefined,
): GlobalMemory => {
  const threadSummaries = memory?.threadSummaries ?? [];
  const updatedAt = memory?.updatedAt ?? new Date().toISOString();
  const structuredMemory: GlobalMemory = {
    ...createEmptyStructuredGlobalMemory(),
    identity: normalizeFactGroup(memory?.identity),
    family: normalizeFactGroup(memory?.family),
    preferences: normalizePreferenceMemory(memory?.preferences),
    work: normalizeFactGroup(memory?.work),
    threadSummaries,
    markdown: "",
    updatedAt,
  };

  for (const legacyFact of memory?.facts ?? []) {
    const migrated = addFactToGlobalMemory(structuredMemory, legacyFact);
    structuredMemory.identity = migrated.identity;
    structuredMemory.family = migrated.family;
    structuredMemory.preferences = migrated.preferences;
    structuredMemory.work = migrated.work;
  }

  return {
    ...structuredMemory,
    markdown: buildGlobalMemoryMarkdown({
      memory: structuredMemory,
      threadSummaries,
    }),
  };
};

export const normalizeChatSessionState = (
  state: Partial<ChatSessionState> & Pick<ChatSessionState, "messages">,
): ChatSessionState => ({
  messages: state.messages,
  memory: normalizeThreadMemory(state.memory, state.messages),
});

export const createAssistantMessage = (content: string): ChatMessage => ({
  id: crypto.randomUUID(),
  role: "assistant",
  content,
  createdAt: new Date().toISOString(),
});

export const createUserMessage = (content: string): ChatMessage => ({
  id: crypto.randomUUID(),
  role: "user",
  content,
  createdAt: new Date().toISOString(),
});

export const createInitialChatState = (): ChatSessionState => ({
  messages: [
    createAssistantMessage(
      "Ask for product strategy, copy rewrites, code help, or research summaries. I’ll answer through OpenRouter.",
    ),
  ],
  memory: createEmptyThreadMemory(),
});

export const createThreadSummary = (
  id: string,
  messageCount = INITIAL_MESSAGE_COUNT,
): ChatThreadSummary => {
  const timestamp = new Date().toISOString();

  return {
    id,
    title: DEFAULT_THREAD_TITLE,
    createdAt: timestamp,
    updatedAt: timestamp,
    messageCount,
  };
};

export const getThreadTitleFromMessages = (messages: ChatMessage[]) => {
  const firstUserMessage = messages.find((message) => message.role === "user");

  if (!firstUserMessage) {
    return DEFAULT_THREAD_TITLE;
  }

  return firstUserMessage.content.replace(/\s+/g, " ").trim().slice(0, 48);
};
