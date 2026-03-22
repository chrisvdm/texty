import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT || 8787);
const expectedToken = (process.env.TEXTY_EXECUTOR_TOKEN || "dev-token").trim();
const textyBaseUrl = (process.env.TEXTY_BASE_URL || "http://localhost:5173").trim();
const providerId = (process.env.TEXTY_PROVIDER_ID || "demo_executor").trim();
const defaultUserId = (process.env.TEXTY_USER_ID || "demo_user").trim();
const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);
const homePageTemplate = readFileSync(join(currentDir, "index.html"), "utf8");

const renderHomePage = () =>
  homePageTemplate
    .replaceAll("__PORT__", String(port))
    .replaceAll("__TOKEN__", expectedToken)
    .replaceAll("__TEXTY_BASE_URL__", textyBaseUrl)
    .replaceAll("__PROVIDER_ID__", providerId)
    .replaceAll("__USER_ID__", defaultUserId)
    .replaceAll("__PLAYGROUND_PATH__", "/playground/texty")
    .replaceAll("__PLAYGROUND_MODE__", "proxy");

const buildSyncBody = (userId) => ({
  provider_id: providerId,
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

const buildInputBody = (userId, text) => ({
  provider_id: providerId,
  user_id: userId,
  input: {
    kind: "text",
    text,
  },
  channel: {
    type: "web",
    id: "minimal-executor-playground",
  },
});

const sendJson = (response, status, body) => {
  response.writeHead(status, {
    "Content-Type": "application/json",
  });
  response.end(JSON.stringify(body));
};

const readJsonBody = async (request) => {
  let body = "";

  for await (const chunk of request) {
    body += chunk;
  }

  return JSON.parse(body || "{}");
};

const unauthorized = (response) =>
  sendJson(response, 401, {
    ok: false,
    state: "failed",
    error: {
      code: "unauthorized",
      message: "Missing or invalid executor token.",
    },
  });

const syncNotesToolWithTexty = async ({ token, userId }) => {
  const response = await fetch(
    `${textyBaseUrl.replace(/\/$/, "")}/api/v1/providers/${providerId}/users/${userId}/tools/sync`,
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
    body: await response.json(),
  };
};

const runTextyInput = async ({ token, userId, text }) => {
  const response = await fetch(`${textyBaseUrl.replace(/\/$/, "")}/api/v1/input`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildInputBody(userId, text)),
  });

  return {
    status: response.status,
    body: await response.json(),
  };
};

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/") {
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
    });
    response.end(renderHomePage());
    return;
  }

  if (request.method === "POST" && request.url === "/playground/texty") {
    let payload;

    try {
      payload = await readJsonBody(request);
    } catch {
      sendJson(response, 400, {
        ok: false,
        error: {
          code: "invalid_json",
          message: "Request body must be valid JSON.",
        },
      });
      return;
    }

    const token = String(payload.token || "").trim();
    const userId = String(payload.user_id || defaultUserId).trim();
    const text = String(payload.text || "").trim();

    if (!token || token !== expectedToken) {
      unauthorized(response);
      return;
    }

    if (!text) {
      sendJson(response, 400, {
        ok: false,
        error: {
          code: "missing_text",
          message: "Text input is required.",
        },
      });
      return;
    }

    try {
      const syncResult = await syncNotesToolWithTexty({
        token,
        userId,
      });
      const textyResult = await runTextyInput({
        token,
        userId,
        text,
      });

      sendJson(response, 200, {
        ok: true,
        demo_identity: {
          executor_id: providerId,
          user_id: userId,
        },
        observed: {
          sync_status: syncResult.status,
          sync_response: syncResult.body,
          input_status: textyResult.status,
          input_response: textyResult.body,
        },
      });
    } catch (error) {
      sendJson(response, 502, {
        ok: false,
        error: {
          code: "texty_unreachable",
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
    return;
  }

  if (request.method !== "POST" || request.url !== "/tools/execute") {
    sendJson(response, 404, {
      ok: false,
      state: "failed",
      error: {
        code: "not_found",
        message: "Route not found.",
      },
    });
    return;
  }

  const authHeader = request.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!token || token !== expectedToken) {
    unauthorized(response);
    return;
  }

  let payload;

  try {
    payload = await readJsonBody(request);
  } catch {
    sendJson(response, 400, {
      ok: false,
      state: "failed",
      error: {
        code: "invalid_json",
        message: "Request body must be valid JSON.",
      },
    });
    return;
  }

  if (payload.tool_name !== "notes.echo") {
    sendJson(response, 400, {
      ok: false,
      state: "failed",
      error: {
        code: "unknown_tool",
        message: `Unknown tool: ${payload.tool_name || "missing"}.`,
      },
    });
    return;
  }

  const note = String(payload.arguments?.note || "").trim();

  if (!note) {
    sendJson(response, 200, {
      ok: true,
      state: "needs_clarification",
      result: {
        summary: "What note should I save?",
      },
    });
    return;
  }

  sendJson(response, 200, {
    ok: true,
    state: "completed",
    result: {
      summary: `Saved note: ${note}`,
      data: {
        note,
      },
    },
  });
});

server.listen(port, () => {
  console.log(`Minimal executor listening on http://localhost:${port}`);
});
