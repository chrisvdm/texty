# API Reference

This page is the practical API reference for integrating with _familiar_.

## Authentication

Every inbound request to _familiar_ should include:

```text
Authorization: Bearer <api-token>
Content-Type: application/json
```

Use `Idempotency-Key` on write operations that may be retried.

## Common response shape

Successful responses are JSON.

Errors should follow one simple shape:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "The request payload is missing user_id.",
    "details": null
  }
}
```

## Create account

Endpoint:

```text
POST /api/v1/accounts
```

Create an account and immediately issue the first API token.

```json
{}
```

Example response:

```json
{
  "account": {
    "id": "acct_123",
    "created_at": "2026-03-25T10:00:00.000Z"
  },
  "token": {
    "value": "fam_abc123",
    "prefix": "fam_abcd",
    "last_four": "c123",
    "created_at": "2026-03-25T10:00:00.000Z"
  }
}
```

## Get account

Endpoint:

```text
GET /api/v1/account
```

Resolve the account from the bearer token.

Example response:

```json
{
  "account": {
    "id": "acct_123",
    "created_at": "2026-03-25T10:00:00.000Z"
  },
  "setup": {
    "id": "setup_123"
  },
  "token": {
    "id": "tok_123",
    "prefix": "fam_abcd",
    "last_four": "c123",
    "created_at": "2026-03-25T10:00:00.000Z",
    "last_used_at": "2026-03-25T10:05:00.000Z"
  }
}
```

## Send input

Endpoint:

```text
POST /api/v1/input
```

Send one normalized message into _familiar_.

Use this when:

- a user sends a normal message
- you want _familiar_ to continue a thread
- you want _familiar_ to decide whether to reply, clarify, or run a tool

```json
{
  "user_id": "user_123",
  "thread_id": "thread_abc",
  "input": {
    "kind": "text",
    "text": "Update the client spreadsheet"
  },
  "channel": {
    "type": "web",
    "id": "browser_session_abc",
    "name": "Chris browser"
  },
  "tools": [
    {
      "tool_name": "calendar.create_event",
      "description": "Create a calendar event",
      "input_schema": {
        "type": "object",
        "properties": {
          "title": { "type": "string" },
          "date": { "type": "string" }
        },
        "required": ["title", "date"]
      },
      "status": "active"
    }
  ]
}
```

`tools` is optional.

Use it when:

- you are still developing and do not want a separate tool-push step yet
- you want to bootstrap the current account-backed setup from the same request

If `tools` is present, _familiar_ stores those tools for that user in the current token-backed setup and then uses them for routing.

If `tools` is omitted, _familiar_ uses the tools already stored for that user.

Example response:

```json
{
  "integration_id": "integration_a",
  "user_id": "user_123",
  "thread_id": "thread_abc",
  "messages": [
    {
      "message_id": "msg_1",
      "role": "user",
      "content": "Update the client spreadsheet"
    },
    {
      "message_id": "msg_2",
      "role": "assistant",
      "content": "Which spreadsheet do you mean?"
    }
  ],
  "execution": {
    "state": "accepted",
    "execution_id": "exec_123"
  }
}
```

> [!NOTE]
> `input.text` is always normalized text. Voice or audio should be transcribed before calling this endpoint.

`integration_id` is optional on this endpoint in the current MVP happy path. The bearer token can identify the active setup.

## Sync tools

Endpoint:

```text
POST /api/v1/users/:user_id/tools/sync
```

Tell _familiar_ which tools a user is allowed to use.

Use this when:

- a new integration is being set up
- a user gains or loses access to tools
- a tool schema changes

```shell
curl -X POST https://texty.chrsvdmrw.workers.dev/api/v1/users/user_123/tools/sync \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user_123",
    "tools": [
      {
        "tool_name": "spreadsheet.update_row",
        "description": "Update a spreadsheet row",
        "input_schema": {
          "type": "object",
          "properties": {
            "sheet": { "type": "string" },
            "row_id": { "type": "string" },
            "values": { "type": "object" }
          },
          "required": ["sheet", "row_id", "values"]
        },
        "status": "active"
      }
    ]
  }'
```

Example response:

```json
{
  "integration_id": "integration_a",
  "user_id": "user_123",
  "synced_tools": 1,
  "status": "ok"
}
```

The response still includes `integration_id` so callers can see which setup the token resolved to.

## Create a thread

Endpoint:

```text
POST /api/v1/threads
```

Create a new thread.

Use this when:

- you want to create a thread before the first message
- you want to separate a new task or theme from an older one

```json
{
  "user_id": "user_123",
  "title": "Q2 planning"
}
```

## List threads

Endpoint:

```text
GET /api/v1/users/:user_id/threads
```

List threads for one user inside the setup identified by the token.

Use this when:

- showing a thread picker
- restoring previous conversations

## Rename a thread

Endpoint:

```text
PATCH /api/v1/threads/:thread_id
```

Update thread metadata.

Current use:

- rename a thread

```json
{
  "title": "Client spreadsheet cleanup"
}
```

## Delete a thread

Endpoint:

```text
DELETE /api/v1/threads/:thread_id
```

Delete a thread.

Use this when:

- the user wants to remove an old conversation
- a thread was created by mistake

## Read shared memory

Endpoint:

```text
GET /api/v1/integrations/:integration_id/users/:user_id/memory
```

Read the shared memory for one integration and user.

Use this when:

- you want to inspect what _familiar_ remembers across normal conversations

## Read thread memory

Endpoint:

```text
GET /api/v1/threads/:thread_id/memory
```

Read memory for one specific thread.

Use this when:

- you want to inspect thread-local context
- you are debugging how _familiar_ is carrying a task forward

## Receive async executor results

Endpoint:

```text
POST /api/v1/webhooks/executor
```

Send a delayed executor result back into the conversation.

Use this when:

- the executor accepted work first
- the final result only becomes available later

```shell
curl -X POST https://texty.chrsvdmrw.workers.dev/api/v1/webhooks/executor \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: exec_123" \
  -d '{
    "integration_id": "integration_a",
    "user_id": "user_123",
    "thread_id": "thread_abc",
    "result": {
      "execution_id": "exec_123",
      "state": "completed",
      "content": "Your import finished successfully."
    }
  }'
```

> [!NOTE]
> If you retry the callback, send `Idempotency-Key`. If you do not send one, _familiar_ can fall back to `result.execution_id` when present.

## Executor-side endpoints

These are not _familiar_ endpoints. They are endpoints your integration exposes so _familiar_ can talk to your system.

## Run a tool

Endpoint:

```text
POST {integration.baseUrl}/tools/execute
```

_familiar_ calls this when it has already chosen a tool and prepared the arguments.

Use case:

- a user asks to update a spreadsheet row
- _familiar_ chooses `spreadsheet.update_row`
- _familiar_ sends structured arguments to your executor

Default payload:

```json
{
  "integration_id": "integration_a",
  "user_id": "user_123",
  "thread_id": "thread_abc",
  "tool_name": "spreadsheet.update_row",
  "arguments": {
    "sheet": "Sales Leads",
    "row_id": "42",
    "values": {
      "status": "contacted"
    }
  },
  "context": {
    "executor_result_webhook_url": "https://example.com/api/v1/webhooks/executor"
  }
}
```

> [!NOTE]
> This default body shape is not the only option. A tool can define `executor_payload` during tool sync, and _familiar_ will send that rendered JSON body instead.

Example custom payload:

```json
{
  "operation": "spreadsheet.update_row",
  "params": {
    "sheet": "Sales Leads",
    "row_id": "42",
    "values": {
      "status": "contacted"
    }
  },
  "meta": {
    "user": "user_123",
    "thread": "thread_abc"
  }
}
```

## Deliver a channel message

Endpoint:

```text
POST {integration.baseUrl}/channels/messages
```

_familiar_ calls this when it wants your integration to deliver a user-facing message back to the active channel.

Use case:

- an async executor result arrives
- _familiar_ appends it to the thread
- _familiar_ asks the integration to deliver that message to the right channel

Example payload:

```json
{
  "integration_id": "integration_a",
  "user_id": "user_123",
  "thread_id": "thread_abc",
  "channel": {
    "type": "whatsapp",
    "id": "+27731234567"
  },
  "message": {
    "kind": "text",
    "text": "Your import finished successfully."
  }
}
```

> [!NOTE]
> Channel delivery should target one concrete channel, not broadcast to all channels by default.

## Status codes

The main status codes you should expect are:

- `200` success
- `400` invalid payload
- `401` unauthenticated
- `403` integration mismatch or forbidden action
- `404` thread not found or not owned by the integration/user
- `409` idempotency conflict
- `429` rate limited

## Practical mental model

The API gets much easier to understand if you think of it like this:

1. Sync tools.
2. Send text into _familiar_.
3. Let _familiar_ decide what should happen.
4. Let your executor do the work.
5. If needed, send the final result back later with the executor webhook.
