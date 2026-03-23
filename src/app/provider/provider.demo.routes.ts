import { route } from "rwsdk/router";

import homePageTemplate from "../../../examples/minimal-executor/index.html?raw";
import {
  handleProviderConversationInput,
  syncProviderTools,
} from "./provider.service";
import {
  BUILT_IN_DEMO_CHANNEL_ID,
  BUILT_IN_DEMO_PROVIDER_ID,
  BUILT_IN_DEMO_TOKEN,
  BUILT_IN_DEMO_USER_ID,
  executeBuiltInDemoTool,
  getBuiltInDemoTodos,
} from "./provider.demo";

const DEMO_TOKEN = BUILT_IN_DEMO_TOKEN;
const DEMO_EXECUTOR_ID = BUILT_IN_DEMO_PROVIDER_ID;
const DEMO_USER_ID = BUILT_IN_DEMO_USER_ID;
const DEMO_CHANNEL_ID = BUILT_IN_DEMO_CHANNEL_ID;

const buildSyncBody = (userId: string) => ({
  provider_id: DEMO_EXECUTOR_ID,
  user_id: userId,
  tools: [
    {
      tool_name: "todos.add",
      description:
        "Add one item to the user's visible todo list. Use this only when the user is clearly asking to add, capture, or remember a task. The todo field should contain only the task text itself.",
      input_schema: {
        type: "object",
        properties: {
          todo: {
            type: "string",
            description:
              "Only the todo text, for example buy dog food. Do not include phrases like add to my todo list.",
          },
        },
        required: ["todo"],
      },
      status: "active" as const,
    },
  ],
});

const buildInputBody = (userId: string, text: string) => ({
  provider_id: DEMO_EXECUTOR_ID,
  user_id: userId,
  input: {
    kind: "text" as const,
    text,
  },
  channel: {
    type: "web",
    id: DEMO_CHANNEL_ID,
  },
});

const renderHomePage = (origin: string) =>
  homePageTemplate
    .replaceAll("__PORT__", origin)
    .replaceAll("__TOKEN__", DEMO_TOKEN)
    .replaceAll("__TEXTY_BASE_URL__", origin)
    .replaceAll("__PROVIDER_ID__", DEMO_EXECUTOR_ID)
    .replaceAll("__USER_ID__", DEMO_USER_ID)
    .replaceAll("__PLAYGROUND_PATH__", "/sandbox/demo-executor/playground/texty")
    .replaceAll("__PLAYGROUND_MODE__", "direct");

const unauthorized = () =>
  Response.json(
    {
      ok: false,
      state: "failed",
      error: {
        code: "unauthorized",
        message: "Missing or invalid executor token.",
      },
    },
    { status: 401 },
  );

const extractAssistantReply = (inputResponse: Record<string, unknown>) => {
  const response = inputResponse.response as
    | { content?: unknown }
    | undefined;

  if (!response || typeof response !== "object") {
    return "";
  }

  if (typeof response.content !== "string") {
    return "";
  }

  const trimmed = response.content.trim();

  if (!trimmed || trimmed.toLowerCase() === "null" || trimmed.toLowerCase() === "undefined") {
    return "";
  }

  return trimmed;
};

const extractTask = (inputResponse: Record<string, unknown>) => {
  const response = inputResponse.response as
    | { type?: unknown; task_status?: unknown; reasoning?: unknown }
    | undefined;

  if (!response || typeof response !== "object") {
    return {
      thread_id:
        typeof inputResponse.thread_id === "string" ? inputResponse.thread_id : null,
      action: null,
      execution_state: null,
      reasoning: null,
    };
  }

  return {
    thread_id:
      typeof inputResponse.thread_id === "string" ? inputResponse.thread_id : null,
    action: typeof response.type === "string" ? response.type : null,
    execution_state:
      typeof response.task_status === "string" ? response.task_status : null,
    reasoning:
      typeof response.reasoning === "string" ? response.reasoning : null,
  };
};

export const providerDemoRoutes = [
  route("/sandbox/demo-executor", async ({ request, rw }) => {
    if (request.method !== "GET") {
      return Response.json(
        {
          error: {
            code: "method_not_allowed",
            message: "Method not allowed.",
            details: null,
          },
        },
        { status: 405 },
      );
    }

    return new Response(
      renderHomePage(new URL(request.url).origin).replaceAll(
        "__NONCE__",
        rw.nonce,
      ),
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      },
    );
  }),
  route("/sandbox/demo-executor/playground/texty", async ({ request }) => {
    if (request.method !== "POST") {
      return Response.json(
        {
          error: {
            code: "method_not_allowed",
            message: "Method not allowed.",
            details: null,
          },
        },
        { status: 405 },
      );
    }

    let payload: { token?: string; user_id?: string; text?: string };

    try {
      payload = (await request.json()) as typeof payload;
    } catch {
      return Response.json(
        {
          ok: false,
          error: {
            code: "invalid_json",
            message: "Request body must be valid JSON.",
          },
        },
        { status: 400 },
      );
    }

    const token = String(payload.token || "").trim();
    const userId = String(payload.user_id || DEMO_USER_ID).trim();
    const text = String(payload.text || "").trim();

    if (!token || token !== DEMO_TOKEN) {
      return unauthorized();
    }

    if (!text) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "missing_text",
            message: "Text input is required.",
          },
        },
        { status: 400 },
      );
    }

    try {
      const syncResult = await syncProviderTools(buildSyncBody(userId));
      const textyResult = await handleProviderConversationInput({
        input: buildInputBody(userId, text),
        providerConfig: {
          token: DEMO_TOKEN,
        },
      });

      return Response.json({
        ok: true,
        demo_identity: {
          executor_id: DEMO_EXECUTOR_ID,
          user_id: userId,
        },
        assistant_reply:
          extractAssistantReply(textyResult) ||
          "I need a bit more information before I can continue. Please clarify what should be added to the todo list.",
        task: extractTask(textyResult),
        todos: getBuiltInDemoTodos(userId),
        observed: {
          sync_status: 200,
          sync_response: syncResult,
          input_status: 200,
          input_response: textyResult,
        },
      });
    } catch (error) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "demo_failed",
            message: error instanceof Error ? error.message : String(error),
          },
        },
        { status: 502 },
      );
    }
  }),
  route("/sandbox/demo-executor/tools/execute", async ({ request }) => {
    if (request.method !== "POST") {
      return Response.json(
        {
          ok: false,
          state: "failed",
          error: {
            code: "method_not_allowed",
            message: "Method not allowed.",
          },
        },
        { status: 405 },
      );
    }

    const authorization = request.headers.get("Authorization") || "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : "";

    if (!token || token !== DEMO_TOKEN) {
      return unauthorized();
    }

    let payload: {
      tool_name?: string;
      user_id?: string;
      arguments?: Record<string, unknown>;
    };

    try {
      payload = (await request.json()) as typeof payload;
    } catch {
      return Response.json(
        {
          ok: false,
          state: "failed",
          error: {
            code: "invalid_json",
            message: "Request body must be valid JSON.",
          },
        },
        { status: 400 },
      );
    }

    const result = executeBuiltInDemoTool({
      toolName: String(payload.tool_name || ""),
      args: payload.arguments ?? {},
      userId: String(payload.user_id || DEMO_USER_ID).trim(),
    });

    return Response.json({
      ok: result.state !== "failed",
      state: result.state,
      result: {
        summary: result.message,
        data: result.data,
      },
      ...(result.state === "failed"
        ? {
            error: {
              code: "execution_failed",
              message: result.message,
            },
          }
        : {}),
    });
  }),
];
