# Quickstart

This is the smallest useful path for getting _familiar_ working with your own executor.

## What you need

You need three things:

- a bearer token for the current _familiar_ setup
- a `user_id` from your own app
- a base URL where _familiar_ can call your executor

For this guide, think of the token as identifying one current _familiar_ setup for one app or deployment:

- the user-facing channel
- the _familiar_ conversation layer
- the executor endpoints that do the work

In local development, that configuration can look like:

```text
TEXTY_EXECUTOR_CONFIG='{"integration_a":{"token":"dev-token","baseUrl":"http://localhost:8787"}}'
```

> [!NOTE]
> The current local development config still uses an internal setup key such as `integration_a` inside `TEXTY_EXECUTOR_CONFIG`. That is an implementation detail. The public API happy path can now derive the active setup from the bearer token.

## Step 1: Sync tools with _familiar_

Sync the tools a user is allowed to use.

```shell
curl -X POST https://texty.chrsvdmrw.workers.dev/api/v1/users/user_123/tools/sync \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user_123",
    "tools": [
      {
        "tool_name": "countdown.start",
        "description": "Start a 10 second countdown",
        "input_schema": {
          "type": "object",
          "properties": {
            "label": { "type": "string" }
          },
          "required": ["label"]
        },
        "status": "active"
      }
    ]
  }'
```

## Step 2: Send text input to _familiar_

Send normalized text into _familiar_.

```shell
curl -X POST https://texty.chrsvdmrw.workers.dev/api/v1/input \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user_123",
    "input": {
      "kind": "text",
      "text": "Start a countdown for the deployment check"
    },
    "channel": {
      "type": "web",
      "id": "browser_session_abc"
    }
  }'
```

## Step 3: Expose your executor endpoint

Expose an executor endpoint that _familiar_ can call.

```text
POST {integration.baseUrl}/tools/execute
```

The executor receives structured tool input rather than raw user text.

> [!NOTE]
> The current default executor request body is wrapped and includes fields like `tool_name`, `arguments`, and `context`. If a tool defines `executor_payload`, _familiar_ can send a different JSON body shape instead.

### Example execution payload

```json
{
  "integration_id": "integration_a",
  "user_id": "user_123",
  "thread_id": "thread_abc",
  "tool_name": "countdown.start",
  "arguments": {
    "label": "deployment check"
  },
  "context": {
    "executor_result_webhook_url": "https://texty.chrsvdmrw.workers.dev/api/v1/webhooks/executor"
  }
}
```

## Step 4: Return a sync or async result

Return either:

- a completed result immediately
- or an accepted result now and the final result later

### Immediate response

```json
{
  "ok": true,
  "state": "completed",
  "result": {
    "summary": "Countdown completed."
  }
}
```

### Async response

```json
{
  "ok": true,
  "state": "accepted",
  "result": {
    "summary": "Countdown started."
  }
}
```

## Step 5: Send the final async result back

If the executor returned `accepted`, send the final result later:

```shell
curl -X POST https://texty.chrsvdmrw.workers.dev/api/v1/webhooks/executor \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: exec_123" \
  -d '{
    "user_id": "user_123",
    "thread_id": "thread_abc",
    "result": {
      "execution_id": "exec_123",
      "state": "completed",
      "content": "Countdown finished."
    }
  }'
```

## What to open next

If you want a working reference instead of raw API calls, open the live examples:

- [Minimal Executor](/sandbox/demo-executor)
- [Async Countdown](/sandbox/async-countdown)
- [Pinned Tool](/sandbox/pinned-tool)
