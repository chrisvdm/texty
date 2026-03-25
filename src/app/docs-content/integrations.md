# Integrations

An integration is one end-to-end _familiar_ configuration for a specific app, bot, instance, or deployment.

It is the main boundary between _familiar_ and an external system.

In the current MVP happy path, the bearer token can identify that setup directly.

## What an integration owns

An integration is responsible for:

- authenticating to _familiar_
- defining the channel surface for that setup
- syncing the tools a user is allowed to use
- exposing an executor endpoint
- exposing a channel delivery endpoint

In simple terms, an integration is the full setup that connects:

- the channel
- the _familiar_ behavior boundary
- the executor or executors behind it

## Syncing tools

Each integration tells _familiar_ which tools a user is allowed to use.

That tool list should come from `*familiar*.json`.

The main sync endpoint is:

```text
POST /api/v1/users/:user_id/tools/sync
```

## Sending input

The main input endpoint is:

```text
POST /api/v1/input
```

Send normalized text plus the user and channel context. _familiar_ then decides whether to reply directly, ask for clarification, or invoke a tool.

```shell
curl -X POST https://texty.chrsvdmrw.workers.dev/api/v1/input \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user_123",
    "input": {
      "kind": "text",
      "text": "Update the sales sheet and mark Acme as contacted"
    },
    "channel": {
      "type": "email",
      "id": "chris@example.com"
    }
  }'
```

## Thread and channel continuity

_familiar_ uses:

- the authenticated token
- `user_id`
- `channel.type`
- `channel.id`

to continue the right conversation.

If `thread_id` is missing, _familiar_ can still continue the correct thread based on recent channel context.

## Input flow

1. Send normalized text to _familiar_.
2. _familiar_ resolves thread and context.
3. _familiar_ decides whether to reply, clarify, or run a tool.
4. If a tool is needed, _familiar_ calls the integration's executor target.

### Tool sync example

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

## Why this split matters

This keeps one clear split:

- _familiar_ owns conversation behavior
- the integration owns business connectivity

That split is what makes the product easier to integrate and easier to reason about.
