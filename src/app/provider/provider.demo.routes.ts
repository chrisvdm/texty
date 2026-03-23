import { route } from "rwsdk/router";

import homePageTemplate from "../../../examples/minimal-executor/index.html?raw";
import {
  BUILT_IN_DEMO_CHANNEL_ID,
  BUILT_IN_DEMO_PROVIDER_ID,
  BUILT_IN_DEMO_TOKEN,
  BUILT_IN_DEMO_USER_ID,
  executeBuiltInDemoTool,
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
      tool_name: "notes.echo",
      description:
        "Save a short note. Use this only when the user clearly asks to save or add a note. The note field should contain only the note text itself, not instruction words.",
      input_schema: {
        type: "object",
        properties: {
          note: {
            type: "string",
            description:
              "Only the note content, for example wash hair. Do not include phrases like add to note or save this note.",
          },
        },
        required: ["note"],
      },
      status: "active",
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

type DemoApiResponse = {
  error?: {
    message?: string;
  };
  response?: {
    type?: string;
    content?: string | null;
    task_status?: string | null;
  };
};

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

const getBearerToken = (request: Request) => {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice("Bearer ".length).trim();
  return token || null;
};

const syncNotesToolWithTexty = async ({
  token,
  userId,
  origin,
}: {
  token: string;
  userId: string;
  origin: string;
}) => {
  const response = await fetch(
    `${origin}/api/v1/providers/${DEMO_EXECUTOR_ID}/users/${userId}/tools/sync`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildSyncBody(userId)),
    },
  );

  return {
    status: response.status,
    body: (await response.json()) as DemoApiResponse,
  };
};

const runTextyInput = async ({
  token,
  userId,
  text,
  origin,
}: {
  token: string;
  userId: string;
  text: string;
  origin: string;
}) => {
  const response = await fetch(`${origin}/api/v1/input`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildInputBody(userId, text)),
  });

  return {
    status: response.status,
    body: (await response.json()) as DemoApiResponse,
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

    const origin = new URL(request.url).origin;

    try {
      const syncResult = await syncNotesToolWithTexty({ token, userId, origin });
      const textyResult = await runTextyInput({ token, userId, text, origin });

      if (syncResult.status !== 200) {
        return Response.json(
          {
            status_code: syncResult.status,
            response:
              syncResult.body?.error?.message ||
              "Tool sync failed before the demo input could run.",
            task: "setup_failed",
          },
          { status: syncResult.status },
        );
      }

      return Response.json({
        status_code: textyResult.status,
        response:
          textyResult.body?.response?.content ||
          textyResult.body?.error?.message ||
          "No response content returned.",
        task:
          textyResult.body?.response?.task_status ||
          textyResult.body?.response?.type ||
          "chat",
      });
    } catch (error) {
      return Response.json(
        {
          status_code: 502,
          response: error instanceof Error ? error.message : String(error),
          task: "failed",
        },
        { status: 502 },
      );
    }
  }),
  route("/sandbox/demo-executor/tools/execute", async ({ request }) => {
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

    const token = getBearerToken(request);
    if (!token || token !== DEMO_TOKEN) {
      return unauthorized();
    }

    let payload: {
      tool_name?: string;
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
            details: null,
          },
        },
        { status: 400 },
      );
    }

    const result = executeBuiltInDemoTool({
      toolName: String(payload.tool_name || ""),
      args: payload.arguments ?? {},
    });

    if (result.state === "failed") {
      return Response.json(
        {
          ok: false,
          state: "failed",
          error: {
            code: "unknown_tool",
            message: result.message,
            details: null,
          },
        },
        { status: 400 },
      );
    }

    if (result.state === "needs_clarification") {
      return Response.json({
        ok: true,
        state: "needs_clarification",
        result: {
          summary: result.message,
        },
      });
    }

    return Response.json({
      ok: true,
      state: result.state,
      result: {
        summary: result.message,
        data: result.data ?? undefined,
      },
    });
  }),
];
