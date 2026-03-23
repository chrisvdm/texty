export const BUILT_IN_DEMO_PROVIDER_ID = "demo_executor";
export const BUILT_IN_DEMO_TOKEN = "dev-token";
export const BUILT_IN_DEMO_USER_ID = "demo_user";
export const BUILT_IN_DEMO_CHANNEL_ID = "minimal-executor-playground";

const todoStore = new Map<
  string,
  Array<{
    id: string;
    text: string;
    created_at: string;
  }>
>();

const TODO_ITEM_VERB_PATTERN =
  /^(call|email|buy|send|pay|book|schedule|cancel|renew|reply|write|pick up|pickup|drop off|follow up|text|message|plan|order|get)\b/i;

const normalizeDemoTodo = (value: unknown) => {
  const todo = typeof value === "string" ? value.trim() : "";

  if (!todo) {
    return "";
  }

  if (todo.toLowerCase() === "null" || todo.toLowerCase() === "undefined") {
    return "";
  }

  return todo;
};

const splitDemoTodoItems = (todo: string) => {
  const normalized = todo
    .replace(/\b(?:to do|todo)\s+list\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

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

export const getBuiltInDemoTodos = (userId: string) => [
  ...(todoStore.get(userId) ?? []),
];

const addBuiltInDemoTodo = ({
  userId,
  todo,
}: {
  userId: string;
  todo: string;
}) => {
  const currentTodos = getBuiltInDemoTodos(userId);
  const nextTodo = {
    id: crypto.randomUUID(),
    text: todo,
    created_at: new Date().toISOString(),
  };
  const nextTodos = [...currentTodos, nextTodo];
  todoStore.set(userId, nextTodos);
  return nextTodos;
};

export const executeBuiltInDemoTool = ({
  toolName,
  args,
  userId,
}: {
  toolName: string;
  args: Record<string, unknown>;
  userId?: string;
}) => {
  if (toolName !== "todos.add") {
    return {
      state: "failed" as const,
      message: `Unknown tool: ${toolName || "missing"}.`,
      data: null,
    };
  }

  const todo = normalizeDemoTodo(args.todo);
  const todoItems = todo ? splitDemoTodoItems(todo) : [];

  if (todoItems.length === 0) {
    return {
      state: "needs_clarification" as const,
      message: "What should I add to the todo list?",
      data: null,
    };
  }

  let todos = getBuiltInDemoTodos(userId || BUILT_IN_DEMO_USER_ID);

  for (const todoItem of todoItems) {
    todos = addBuiltInDemoTodo({
      userId: userId || BUILT_IN_DEMO_USER_ID,
      todo: todoItem,
    });
  }

  return {
    state: "completed" as const,
    message:
      todoItems.length === 1
        ? `Added "${todoItems[0]}" to the todo list.`
        : `Added ${todoItems.length} items to the todo list: ${todoItems.join(", ")}.`,
    data: {
      added_todo: todoItems[0],
      added_todos: todoItems,
      todos,
    },
  };
};
