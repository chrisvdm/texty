import type {
  ChatThreadSummary,
  GlobalMemory,
} from "../chat/shared";

export type MemoryRetrievalMode =
  | "none"
  | "thread"
  | "provider_user"
  | "custom_scope"
  | "external";

export type MemoryPolicy = {
  mode: MemoryRetrievalMode;
  memoryScopeId?: string;
  externalContextSource?: string;
};

export type AllowedTool = {
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  policy: Record<string, unknown>;
  status: "active" | "disabled";
};

export type ChannelIdentity = {
  type: string;
  id: string;
  lastActiveThreadId: string | null;
  updatedAt: string;
};

export type ProviderUserContext = {
  providerId: string;
  userId: string;
  selectedModel: string;
  memoryPolicy: MemoryPolicy;
  globalMemory: GlobalMemory;
  threads: ChatThreadSummary[];
  allowedTools: AllowedTool[];
  channels: Record<string, ChannelIdentity>;
  threadChannels: Record<string, ProviderChannelInput>;
  requestLog: {
    conversationInputTimestamps: string[];
    toolSyncTimestamps: string[];
  };
  idempotency: Record<
    string,
    {
      requestHash: string;
      status: number;
      body: Record<string, unknown>;
      createdAt: string;
    }
  >;
  createdAt: string;
  updatedAt: string;
};

export type ProviderConfig = {
  token: string;
  baseUrl?: string;
};

export type ProviderChannelInput = {
  type: string;
  id: string;
};

export type ProviderConversationInput = {
  provider_id: string;
  user_id: string;
  thread_id?: string;
  input: {
    kind: "text";
    text: string;
  };
  model?: string;
  timezone?: string;
  channel: ProviderChannelInput;
  context?: {
    external_memories?: string[];
  };
};

export type ProviderExecutorResultInput = {
  provider_id: string;
  user_id: string;
  thread_id: string;
  channel?: ProviderChannelInput;
  result: {
    execution_id?: string;
    tool_name?: string;
    state: ProviderExecutionState;
    content: string;
    data?: Record<string, unknown>;
  };
};

export type ProviderToolSyncInput = {
  provider_id: string;
  user_id: string;
  tools: Array<{
    tool_name: string;
    description: string;
    input_schema: Record<string, unknown>;
    policy?: Record<string, unknown>;
    status?: "active" | "disabled";
  }>;
};

export type ProviderExecutionState =
  | "completed"
  | "needs_clarification"
  | "accepted"
  | "in_progress"
  | "failed";

export type ProviderConversationResponseKind =
  | "chat"
  | "follow_up"
  | "confirmation"
  | "task_result";
