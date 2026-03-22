# Provider Quickstart

## Purpose

This document shows the smallest useful way to connect an external system to Texty.

Current note:

- the wire format still uses `provider_id`
- the product framing is moving toward `executor`
- for this document, "executor" means the connected app or service

That external system does not need to be a large product. It can be:

- a small script
- a lightweight service
- a workflow runner
- an AI-generated executable system

Texty handles the conversation. The external system handles the work.

## What You Need

To connect something to Texty, you need three things:

1. An executor id
2. An executor API token
3. A `/tools/execute` endpoint that Texty can call when work should run

That is enough for a first integration.

## Step 1: Configure a Provider

In local development, add executor config to `.dev.vars`:

```shell
TEXTY_PROVIDER_CONFIG='{"provider_a":{"token":"dev-token","baseUrl":"http://localhost:8787"}}'
```

Meaning:

- `provider_a` is the current wire-format executor id
- `dev-token` is the bearer token the executor will use when calling Texty
- `baseUrl` is where Texty will call the provider for tool execution

## Step 2: Sync Allowed Tools

Tell Texty which tools a given user is allowed to use.

```shell
curl -X POST http://localhost:5173/api/v1/providers/provider_a/users/user_123/tools/sync \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": "provider_a",
    "user_id": "user_123",
    "tools": [
      {
        "tool_name": "spreadsheet.update_row",
        "description": "Update a row in a spreadsheet",
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

This gives Texty permission to reason over that tool for that executor/user pair.

## Step 3: Send Conversation Input

Send a normal message into Texty.

```shell
curl -X POST http://localhost:5173/api/v1/conversation/input \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": "provider_a",
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

Texty will then:

1. load the thread and memory context
2. decide whether to answer directly, ask a follow-up, or call a tool
3. store the turn
4. return the updated result

## Step 4: Expose `/tools/execute`

If Texty decides that a tool should run, it will call:

```text
POST {provider_base_url}/tools/execute
```

Example request sent by Texty:

```json
{
  "provider_id": "provider_a",
  "user_id": "user_123",
  "tool_name": "spreadsheet.update_row",
  "arguments": {
    "sheet": "Sales",
    "row_id": "42",
    "values": {
      "status": "contacted"
    }
  },
  "context": {
    "thread_id": "thread_abc",
    "request_id": "req_123"
  }
}
```

Your system should execute the work and return a structured result.

Example successful response:

```json
{
  "ok": true,
  "state": "completed",
  "result": {
    "summary": "Updated row 42 in Sales.",
    "data": {
      "sheet": "Sales",
      "row_id": "42"
    }
  }
}
```

Example clarification response:

```json
{
  "ok": true,
  "state": "needs_clarification",
  "result": {
    "summary": "I need to know which sheet to update."
  }
}
```

Example failure response:

```json
{
  "ok": false,
  "state": "failed",
  "error": {
    "code": "sheet_not_found",
    "message": "No sheet named Sales exists."
  }
}
```

## The Minimum Mental Model

If you are connecting something simple, think of it like this:

- Texty listens to the user
- Texty decides what the user wants
- Texty calls your system when work should happen
- your system performs the action
- Texty explains the result back to the user

## Channel Identity

Every request should include:

- `provider_id`
- `user_id`
- `channel.type`
- `channel.id`

This matters because Texty uses channel context to maintain recent thread continuity.

Example:

- `channel.type = "email"`
- `channel.id = "chris@example.com"`

or

- `channel.type = "web"`
- `channel.id = "browser_session_abc"`

## Private Threads

Normal conversations are captured into memory by default.

Private threads are the exception.

If you create a private thread:

- it should not contribute to shared memory
- it should not retrieve shared memory

## Useful Local Routes

For local development, these built-in routes are useful:

- `/sandbox/provider`
  - browser UI for exercising the provider API
- `/sandbox/mock-provider/tools/execute`
  - local mock tool execution endpoint

## What This Gives You

Once connected, your system does not need to build:

- conversation threads
- memory handling
- clarification flow
- channel continuity
- user-facing replies

Texty handles those parts. Your system only needs to expose useful work.
