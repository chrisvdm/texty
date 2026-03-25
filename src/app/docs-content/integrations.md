# Integrations

An integration is one end-to-end *familiar* configuration for a specific app, bot, instance, or deployment.

It is the main boundary between *familiar* and an external system.

In the current MVP happy path, the bearer token can identify that setup directly.

## What an integration owns

An integration is responsible for:

- authenticating to *familiar*
- defining the channel surface for that setup
- syncing the tools that setup should use
- exposing an executor endpoint
- exposing a channel delivery endpoint

In simple terms, an integration is the full setup that connects:

- the channel
- the *familiar* behavior boundary
- the executor or executors behind it

## Syncing tools

Each integration tells *familiar* which tools the current setup should use.

That tool list should come from `*familiar*.json`.

The main sync endpoint is:

```text
POST /api/v1/tools/sync
```

## Sending input

The main input endpoint is:

```text
POST /api/v1/input
```

Send normalized text plus the channel context. *familiar* then decides whether to reply directly, ask for clarification, or invoke a tool.

```shell
curl -X POST https://familiar.chrsvdmrw.dev/api/v1/input \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
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

*familiar* uses:

- the authenticated token
- `channel.type`
- `channel.id`

to continue the right conversation.

If `thread_id` is missing, *familiar* can still continue the correct thread based on recent channel context.

## Input flow

1. Send normalized text to *familiar*.
2. *familiar* resolves thread and context.
3. *familiar* decides whether to reply, clarify, or run a tool.
4. If a tool is needed, *familiar* calls the integration's executor target.

### Tool sync example

```shell
curl -X POST https://familiar.chrsvdmrw.dev/api/v1/tools/sync \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
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

- *familiar* owns conversation behavior
- the integration owns business connectivity

That split is what makes the product easier to integrate and easier to reason about.
