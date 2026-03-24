# Tool Target Quickstart

## Purpose

This document shows the smallest useful way to connect code to Texty.

Core terms:

- `account`
  - the owner that pays for and manages Texty
- `integration`
  - the configured Texty connection for one app, bot, or deployment
- `executor`
  - the script, service, or workflow runner Texty triggers to do real work
- `user_id`
  - the end user identity within an integration
- `channel`
  - the communication surface the user is speaking through, identified by `channel.type` and `channel.id`

Current note:

- the current wire format still uses `provider_id`
- in product language, this is the integration id
- Texty chooses the tool before it calls your code

That external system does not need to be a large product. It can be:

- a small script
- a lightweight service
- a workflow runner
- an AI-generated executable system

Texty handles the conversation. Your code handles the work.

## What You Need

To connect something to Texty, you need three things:

1. An integration id
2. A shared API token
3. A URL Texty can call when work should run

That is enough for a first integration.

## Step 1: Configure An Integration

In local development, add connection config to `.dev.vars`:

```shell
TEXTY_EXECUTOR_CONFIG='{"provider_a":{"token":"dev-token","baseUrl":"http://localhost:8787"}}'
```

Meaning:

- `provider_a` is the current wire-format integration id
- `dev-token` is the bearer token used for this integration
- `baseUrl` is where Texty will call your code

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

This gives Texty permission to reason over that tool for that integration/user pair.

## Step 3: Send Conversation Input

Send a normal message into Texty.

```shell
curl -X POST http://localhost:5173/api/v1/input \
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

Important input rule:

- Texty only receives normalized text here
- if your product supports voice notes or speech input, transcribe or otherwise normalize that upstream before calling `/api/v1/input`
- large transcription blocks are fine as long as they arrive as plain `input.text`

## Step 4: Expose `/tools/execute`

If Texty decides that a tool should run, it will call:

```text
POST {target_url}
```

Example request sent by Texty:

```json
{
  "sheet": "Sales",
  "row_id": "42",
  "values": {
    "status": "contacted"
  }
}
```

Your system should execute the work and return a structured result.

Important:

- Texty has already chosen the tool
- your target does not need to decide which tool to run again
- ideally, the request body is only the tool arguments
- the current runtime still includes extra wrapper fields in the payload today
- the simplest target just accepts the arguments and performs the action
- shortcut-forced tool mode may also include `context.raw_input_text`
- async executors may receive `context.executor_result_webhook_url` and can call it later when work finishes

### Step 5: Send an async result back to Texty

If your executor launches work and returns `accepted` or `in_progress`, keep the first response short and user-facing, for example:

```json
{
  "ok": true,
  "state": "accepted",
  "result": {
    "summary": "Action started."
  }
}
```

When the task actually finishes, call Texty back:

```shell
curl -X POST http://localhost:5173/api/v1/webhooks/executor \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": "provider_a",
    "user_id": "user_123",
    "thread_id": "thread_abc",
    "result": {
      "state": "completed",
      "content": "Your import finished successfully."
    }
  }'
```

Keep this payload minimal unless you need more tracing:

- `provider_id`
- `user_id`
- `thread_id`
- `result.state`
- `result.content`

That is enough for Texty to append the async executor result into the thread and notify the user through its normal conversation flow.

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
- Texty picks the tool
- Texty calls your code when work should happen
- your code performs the action
- Texty explains the result back to the user

## Channel Identity

Every request should include:

- `provider_id`
- `user_id`
- `channel.type`
- `channel.id`

This matters because Texty uses channel context to maintain recent thread continuity.

Optional channel metadata:

- `channel.name`
  - a descriptive label for admin or UI use
  - not required for routing or identity

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
  - browser UI for exercising the current API
- `/sandbox/mock-provider/tools/execute`
  - local mock tool execution endpoint

## What This Gives You

Once connected, your system does not need to build:

- conversation threads
- memory handling
- clarification flow
- channel continuity
- user-facing replies

Texty handles those parts. Your system only needs to expose useful work at a URL Texty can trigger.
