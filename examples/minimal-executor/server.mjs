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
const todoStore = new Map();
const todoItemVerbPattern =
  /^(call|email|buy|send|pay|book|schedule|cancel|renew|reply|write|pick up|pickup|drop off|follow up|text|message|plan|order|get)\b/i;

const renderHomePage = () =>
  homePageTemplate
    .replaceAll("__PORT__", String(port))
    .replaceAll("__TOKEN__", expectedToken)
    .replaceAll("__TEXTY_BASE_URL__", textyBaseUrl)
    .replaceAll("__PROVIDER_ID__", providerId)
    .replaceAll("__USER_ID__", defaultUserId)
    .replaceAll("__PLAYGROUND_PATH__", "/playground/texty")
    .replaceAll("__PLAYGROUND_MODE__", "proxy")
    .replaceAll("__NONCE__", "");

const buildSyncBody = (userId) => ({
  provider_id: providerId,
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

const normalizeTodo = (value) => {
  const todo = typeof value === "string" ? value.trim() : "";

  if (!todo) {
    return "";
  }

  if (todo.toLowerCase() === "null" || todo.toLowerCase() === "undefined") {
    return "";
  }

  return todo;
};

const splitTodoItems = (todo) => {
  const normalized = todo
    .replace(/\b(?:to do|todo)\s+list\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const parts = normalized
    .split(/\s*(?:,|;|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length > 1 && parts.every((part) => todoItemVerbPattern.test(part))) {
    return parts;
  }

  return [normalized];
};

const getTodosForUser = (userId) => [...(todoStore.get(userId) ?? [])];

const addTodoForUser = ({ userId, todo }) => {
  const currentTodos = getTodosForUser(userId);
  const nextTodo = {
    id: crypto.randomUUID(),
    text: todo,
    created_at: new Date().toISOString(),
  };
  const nextTodos = [...currentTodos, nextTodo];
  todoStore.set(userId, nextTodos);
  return nextTodos;
};

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

const syncTodoToolWithTexty = async ({ token, userId }) => {
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

const extractAssistantReply = (inputResponse) => {
  const messages = Array.isArray(inputResponse?.messages) ? inputResponse.messages : [];
  const assistantMessage = [...messages].reverse().find((message) => message.role === "assistant");
  return typeof assistantMessage?.content === "string" ? assistantMessage.content : "";
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
      const syncResult = await syncTodoToolWithTexty({
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
        assistant_reply: extractAssistantReply(textyResult.body),
        task: {
          thread_id: textyResult.body?.thread_id ?? null,
          action: textyResult.body?.action?.type ?? null,
          execution_state: textyResult.body?.execution?.state ?? null,
        },
        todos: getTodosForUser(userId),
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

  if (payload.tool_name !== "todos.add") {
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

  const userId = String(payload.user_id || defaultUserId).trim();
  const todo = normalizeTodo(payload.arguments?.todo);
  const todoItems = todo ? splitTodoItems(todo) : [];

  if (todoItems.length === 0) {
    sendJson(response, 200, {
      ok: true,
      state: "needs_clarification",
      result: {
        summary: "What should I add to the todo list?",
      },
    });
    return;
  }

  let todos = getTodosForUser(userId);

  for (const todoItem of todoItems) {
    todos = addTodoForUser({
      userId,
      todo: todoItem,
    });
  }

  sendJson(response, 200, {
    ok: true,
    state: "completed",
    result: {
      summary:
        todoItems.length === 1
          ? `Added "${todoItems[0]}" to the todo list.`
          : `Added ${todoItems.length} items to the todo list: ${todoItems.join(", ")}.`,
      data: {
        added_todo: todoItems[0],
        added_todos: todoItems,
        todos,
      },
    },
  });
});

server.listen(port, () => {
  console.log(`Minimal executor listening on http://localhost:${port}`);
});
