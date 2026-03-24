import manifest from "./familiar.json" with { type: "json" };

const todoStore = new Map();

export const toolDefinitions = manifest.tools.map((tool) => ({
  ...tool,
  status: "active",
}));

const normalizeTodoItems = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(
      (item) =>
        item &&
        item.toLowerCase() !== "null" &&
        item.toLowerCase() !== "undefined",
    );
};

const getRequestedState = (payload) => {
  const requestedState = payload.arguments?.mock_state;

  if (
    requestedState === "accepted" ||
    requestedState === "in_progress" ||
    requestedState === "completed"
  ) {
    return requestedState;
  }

  return null;
};

export const getTodosForUser = (userId) => [...(todoStore.get(userId) ?? [])];

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

export const executeToolCall = ({
  payload,
  defaultUserId = "demo_user",
}) => {
  if (payload.tool_name !== "todos.add") {
    return {
      ok: false,
      state: "failed",
      error: {
        code: "unknown_tool",
        message: `Unknown tool: ${payload.tool_name || "missing"}.`,
      },
    };
  }

  const userId = String(payload.user_id || defaultUserId).trim();
  const requestedState = getRequestedState(payload);
  const rawInputText =
    typeof payload.context?.raw_input_text === "string"
      ? payload.context.raw_input_text.trim()
      : "";
  const todoItems = normalizeTodoItems(payload.arguments?.todo_items);
  const effectiveTodoItems =
    todoItems.length > 0
      ? todoItems
      : rawInputText
        ? [rawInputText]
        : [];

  if (effectiveTodoItems.length === 0) {
    return {
      ok: true,
      state: "needs_clarification",
      result: {
        summary: "What todo items should I add?",
      },
    };
  }

  if (requestedState && requestedState !== "completed") {
    return {
      ok: true,
      state: requestedState,
      result: {
        summary: `Todo request accepted for ${effectiveTodoItems.join(", ")}.`,
        data: {
          added_todos: effectiveTodoItems,
        },
      },
    };
  }

  let todos = getTodosForUser(userId);

  for (const todoItem of effectiveTodoItems) {
    todos = addTodoForUser({
      userId,
      todo: todoItem,
    });
  }

  return {
    ok: true,
    state: "completed",
    result: {
      summary:
        effectiveTodoItems.length === 1
          ? `Added "${effectiveTodoItems[0]}" to the todo list.`
          : `Added ${effectiveTodoItems.length} items to the todo list: ${effectiveTodoItems.join(", ")}.`,
      data: {
        added_todo: effectiveTodoItems[0],
        added_todos: effectiveTodoItems,
        todos,
      },
    },
  };
};
