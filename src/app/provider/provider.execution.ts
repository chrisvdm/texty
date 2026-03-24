import {
  BUILT_IN_DEMO_PROVIDER_ID,
  executeBuiltInDemoTool,
} from "./provider.demo.ts";
import type {
  ProviderChannelInput,
  ProviderConfig,
  ProviderExecutionState,
} from "./provider.types";

type ProviderToolExecutionResponse = {
  ok: boolean;
  state?: ProviderExecutionState;
  result?: {
    summary?: string;
    data?: Record<string, unknown>;
  };
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

const VALID_EXECUTION_STATES = new Set<ProviderExecutionState>([
  "completed",
  "needs_clarification",
  "accepted",
  "in_progress",
  "failed",
]);

const EXECUTOR_REQUEST_TIMEOUT_MS = 15_000;

export const buildExecutorToolUrl = (baseUrl: string) =>
  `${baseUrl.replace(/\/$/, "")}/tools/execute`;

export const buildProviderChannelMessageUrl = (baseUrl: string) =>
  `${baseUrl.replace(/\/$/, "")}/channels/messages`;

export const normalizeProviderToolExecution = ({
  responseOk,
  payload,
}: {
  responseOk: boolean;
  payload: ProviderToolExecutionResponse;
}) => {
  if (!responseOk || !payload.ok) {
    return {
      state: "failed" as const,
      message:
        payload.error?.message ||
        "The executor failed to execute the requested tool.",
      data: null,
    };
  }

  const state = payload.state ?? "completed";

  if (!VALID_EXECUTION_STATES.has(state)) {
    return {
      state: "failed" as const,
      message: "The executor returned an invalid execution state.",
      data: null,
    };
  }

  const message =
    payload.result?.summary ||
    (state === "accepted"
      ? "The executor accepted the request."
      : state === "in_progress"
        ? "The requested work is now in progress."
        : state === "needs_clarification"
          ? "The executor needs more information to continue."
          : "The tool ran successfully.");

  return {
    state,
    message,
    data: payload.result?.data ?? null,
  };
};

export const executeProviderToolRequest = async ({
  providerConfig,
  providerId,
  userId,
  threadId,
  toolName,
  args,
  requestId,
  channel,
  resultWebhookUrl,
  rawInputText,
  shortcutMode = false,
  fetchImpl = fetch,
  timeoutMs = EXECUTOR_REQUEST_TIMEOUT_MS,
}: {
  providerConfig: ProviderConfig;
  providerId: string;
  userId: string;
  threadId: string;
  toolName: string;
  args: Record<string, unknown>;
  requestId?: string;
  channel?: ProviderChannelInput;
  resultWebhookUrl?: string | null;
  rawInputText?: string;
  shortcutMode?: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}) => {
  if (providerId === BUILT_IN_DEMO_PROVIDER_ID) {
    return executeBuiltInDemoTool({
      toolName,
      args,
      userId,
    });
  }

  if (!providerConfig.baseUrl) {
    throw new Error("Executor base URL is not configured.");
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(buildExecutorToolUrl(providerConfig.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${providerConfig.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        execution_id: crypto.randomUUID(),
        provider_id: providerId,
        user_id: userId,
        thread_id: threadId,
        tool_name: toolName,
        arguments: args,
        context: {
          request_id: requestId ?? crypto.randomUUID(),
          thread_id: threadId,
          channel,
          executor_result_webhook_url: resultWebhookUrl ?? undefined,
          raw_input_text: rawInputText ?? undefined,
          shortcut_mode: shortcutMode || undefined,
        },
      }),
      signal: controller.signal,
    });

    let payload: ProviderToolExecutionResponse;

    try {
      payload = (await response.json()) as ProviderToolExecutionResponse;
    } catch {
      return {
        state: "failed" as const,
        message: "The executor returned an invalid JSON response.",
        data: null,
      };
    }

    return normalizeProviderToolExecution({
      responseOk: response.ok,
      payload,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        state: "failed" as const,
        message: "The executor request timed out.",
        data: null,
      };
    }

    return {
      state: "failed" as const,
      message: "The executor could not be reached.",
      data: null,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
};

export const sendProviderChannelMessage = async ({
  providerConfig,
  providerId,
  userId,
  threadId,
  channel,
  content,
  task,
  requestId,
  fetchImpl = fetch,
}: {
  providerConfig: ProviderConfig;
  providerId: string;
  userId: string;
  threadId: string;
  channel: ProviderChannelInput;
  content: string;
  task?: {
    executionId?: string;
    toolName?: string;
    state: ProviderExecutionState;
    data?: Record<string, unknown>;
  };
  requestId?: string;
  fetchImpl?: typeof fetch;
}) => {
  if (!providerConfig.baseUrl) {
    throw new Error("Executor base URL is not configured.");
  }

  const response = await fetchImpl(buildProviderChannelMessageUrl(providerConfig.baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${providerConfig.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider_id: providerId,
      user_id: userId,
      thread_id: threadId,
      channel,
      message: {
        kind: "text",
        text: content,
      },
      task: task
        ? {
            execution_id: task.executionId,
            tool_name: task.toolName,
            state: task.state,
            data: task.data,
          }
        : undefined,
      context: {
        request_id: requestId ?? crypto.randomUUID(),
      },
    }),
  });

  return response.ok;
};
