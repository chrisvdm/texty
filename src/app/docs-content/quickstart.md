# Quickstart

This is the smallest useful path for getting *familiar* working with your own executor.

## Step 0: Create an account

Use the API today:

```shell
curl -X POST https://familiar.chrsvdmrw.dev/api/v1/accounts \
  -H "Content-Type: application/json" \
  -d '{}'
```

That returns your first API token.

The CLI is being prepared as `@familiar/cli`, but it is not published yet.

## What you need

You need two things:

- a bearer token for the current *familiar* setup
- a base URL where *familiar* can call your executor

For this guide, think of the token as identifying one current *familiar* setup for one app or deployment:

- the user-facing channel
- the *familiar* conversation layer
- the executor endpoints that do the work

If you are working on the *familiar* codebase locally, that configuration can look like:

```text
TEXTY_EXECUTOR_CONFIG='{"integration_a":{"token":"dev-token","baseUrl":"http://localhost:8787"}}'
```

> [!NOTE]
> The current local development config still uses an internal setup key such as `integration_a` inside `TEXTY_EXECUTOR_CONFIG`. That is an implementation detail. The public API happy path can now derive the active setup from the bearer token.

## Step 1: Sync tools with *familiar*

Sync the tools for the current token-backed setup.

The setup already exists behind your token after account creation. This call configures that setup. It does not create a new one.

```shell
curl -X POST https://familiar.chrsvdmrw.dev/api/v1/tools/sync \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
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

The token-scoped route is the primary MVP path.
For now, the authenticated token is enough for the single-user happy path.

## Step 2: Send text input to *familiar*

Send normalized text into *familiar*.

```shell
curl -X POST https://familiar.chrsvdmrw.dev/api/v1/input \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
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

Expose an executor endpoint that *familiar* can call.

```text
POST {integration.baseUrl}/tools/execute
```

The executor receives structured tool input rather than raw user text.

> [!NOTE]
> The current default executor request body is wrapped and includes fields like `tool_name`, `arguments`, and `context`. If a tool defines `executor_payload`, *familiar* can send a different JSON body shape instead.

### Example execution payload

```json
{
  "thread_id": "thread_abc",
  "tool_name": "countdown.start",
  "arguments": {
    "label": "deployment check"
  },
  "context": {
    "executor_result_webhook_url": "https://familiar.chrsvdmrw.dev/api/v1/webhooks/executor"
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
curl -X POST https://familiar.chrsvdmrw.dev/api/v1/webhooks/executor \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: exec_123" \
  -d '{
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
