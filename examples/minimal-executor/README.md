# Minimal Executor

This is the smallest useful example of an executor that can connect to familiar.

This folder answers the practical question:

- "What do I actually build if I want familiar to call my code?"

It does one thing:

- exposes `POST /tools/execute`
- exposes `POST /channels/messages`
- accepts one tool, `todos.add`
- updates a visible todo list in the browser demo

The sync contract for this example lives in:

- `familiar.json`

That file is the source of truth for what familiar should extract and send.

The example is now split into two parts:

- transport/server code
- executor logic

That separation is deliberate so the executor API shape is easy to see.

That visual todo list is intentional.

It makes the side effect obvious without forcing someone to read raw response JSON first.

## What This Example Shows

The flow is:

1. the browser sends a normal user message
2. the example syncs `familiar.json` with familiar
3. the example sends the message to familiar
4. familiar decides whether to reply normally, ask a follow-up, or call the tool
5. if the tool runs, familiar sends schema-valid arguments to the external executor
6. the external executor updates the todo list
7. the browser shows both the assistant reply and the visible todo state

So the person trying the demo can immediately see:

- what they said
- how familiar responded
- whether a tool ran
- what changed in external state

## Files

- `server.mjs`
  - tiny local HTTP server using only Node built-ins
  - handles auth, JSON parsing, and routes
- `executor.mjs`
  - the executor implementation itself
  - imports the synced tool definitions from `familiar.json`
  - exports the function that handles a familiar tool call
- `index.html`
  - the local browser UI shown at `http://localhost:8787`
- `familiar.json`
  - the sync manifest
  - the source of truth for the tool schema familiar must satisfy

## Clean Executor Shape

If you only want to see what the executor API looks like, start with:

- `examples/minimal-executor/executor.mjs`

The main exported function is:

```js
executeToolCall({ payload, defaultUserId })
```

Where `payload` is the request familiar sends to `POST /tools/execute`.

familiar normally sends arguments that already match the schema from `familiar.json`.
For this demo, that usually means `todos.add` receives:

```json
{
  "todo_items": ["call dad", "buy milk"]
}
```

not one raw string that still needs executor-side interpretation.

For this example, the server route is intentionally thin and just does:

```js
const result = executeToolCall({
  payload,
  defaultUserId,
});
```

That keeps the executor example readable without mixing business logic into the HTTP handler.

The current example also accepts two newer runtime helpers:

- `payload.context.raw_input_text`
  - used when the user forces a tool shortcut such as `@todos.add`
- `payload.context.executor_result_webhook_url`
  - used when the executor returns `accepted` or `in_progress` and wants to notify familiar later with the final async result

## Run It

Start the example server:

From the project root:

```shell
TEXTY_EXECUTOR_TOKEN=dev-token node examples/minimal-executor/server.mjs
```

If you are already inside the `examples/minimal-executor` folder:

```shell
TEXTY_EXECUTOR_TOKEN=dev-token node server.mjs
```

It listens on:

```text
http://localhost:8787
```

If you open that address in your browser, you will see:

- a simple message box
- the assistant transcript
- a todo list sidebar
- optional debug JSON

## Local familiar Config

Point local familiar at this executor:

```shell
TEXTY_EXECUTOR_CONFIG='{"demo_executor":{"token":"dev-token","baseUrl":"http://localhost:8787"}}'
```

You do not need to manually create `demo_executor` or `demo_user` first.
familiar creates the demo provider-user context on first sync or input.

## Sync The Tool

```shell
curl -X POST http://localhost:5173/api/v1/tools/sync \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "tools": [
      {
        "tool_name": "todos.add",
        "description": "Add one or more items to the user'\''s visible todo list. Use this only when the user clearly asks to add, capture, or remember tasks. The todo_items field should contain only the task text values themselves.",
        "input_schema": {
          "type": "object",
          "properties": {
            "todo_items": {
              "type": "array",
              "description": "The exact todo items to add.",
              "items": {
                "type": "string"
              },
              "minItems": 1
            }
          },
          "required": ["todo_items"]
        },
        "status": "active"
      }
    ]
  }'
```

## Send Input

```shell
curl -X POST http://localhost:5173/api/v1/input \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "kind": "text",
      "text": "Add buy dog food to my todo list"
    },
    "channel": {
      "type": "web",
      "id": "local-browser"
    }
  }'
```

familiar should decide to call `todos.add`, extract `todo_items`, and the executor should return a completed result with the updated todo list.

You can also make an explicit tool call that pins a tool for the thread:

- `@todos.add buy milk and eggs`
- `@todos.add book the dog groomer for Friday`

In that pinned state, familiar bypasses its normal extraction step and passes the following text straight through to the tool payload until explicit exit or another pinned tool call.

## Browser Demo

Once the server is running, open:

```text
http://localhost:8787
```

Live demo:

- [https://familiar.chrsvdmrw.dev/sandbox/demo-executor](https://familiar.chrsvdmrw.dev/sandbox/demo-executor)

Try messages like:

- `add buy dog food to my todo list`
- `remember to email the landlord`
- `what should I cook for dinner?`

The first two should usually trigger the tool and update the visible list.
The last one should usually stay ordinary conversation.

## What Happens Next

After you send a message:

1. familiar receives the user input.
2. familiar decides whether a tool should run.
3. If needed, familiar sends `POST /tools/execute` to your local executor.
4. familiar sends your executor validated arguments that match the schema in `familiar.json`.
5. Your executor updates the todo list and returns structured JSON.
6. familiar turns that result into the assistant reply.
7. The browser shows the updated todo list state.

That is the basic integration loop.

If your executor returns `accepted` or `in_progress`, familiar also includes an executor-result webhook URL in the execution payload. The example server uses that URL to POST back to familiar at `/api/v1/webhooks/executor` with the later result, and familiar then delivers that thread message to `POST /channels/messages`.

For retries, the safest pattern is:

- reuse the same `execution_id`
- also send `Idempotency-Key` with that same value when posting the callback

## How To Adapt It

Once you understand the example, the normal next step is:

- keep the same route shape in `server.mjs`
- keep the same token check
- replace the implementation inside `executor.mjs`
- replace `todos.add` with your own tool
- replace the in-memory todo update with your real side effect

Examples:

- create a task in a real task system
- update a spreadsheet
- create a record
- run a workflow
