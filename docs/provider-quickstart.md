# Tool Target Quickstart

## Purpose

This document shows the smallest useful way to connect code to familiar.

Core terms:

- `account`
  - the owner that pays for and manages familiar
- `integration`
  - the configured familiar connection for one app, bot, or deployment
- `executor`
  - the script, service, or workflow runner familiar triggers to do real work
- `channel`
  - the communication surface the user is speaking through, identified by `channel.type` and `channel.id`

Current note:

- the public wire format uses `integration_id`
- familiar chooses the tool before it calls your code

That external system does not need to be a large product. It can be:

- a small script
- a lightweight service
- a workflow runner
- an AI-generated executable system

familiar handles the conversation. Your code handles the work.

## What You Need

To connect something to familiar in the current MVP, you need three things:

1. an API token
2. a URL familiar can call when work should run

That is enough for a first working setup.

Long term, explicit `integration_id` will matter again once one account can manage multiple setups.

## Step 1: Create an account and get a token

```shell
curl -X POST https://familiar.chrsvdmrw.dev/api/v1/accounts \
  -H "Content-Type: application/json" \
  -d '{}'
```

This returns:

- `account.id`
- the first API token

That token is the main machine credential in the current MVP.

## Step 2: Sync Allowed Tools

Tell familiar which tools the current setup should use.

```shell
curl -X POST https://familiar.chrsvdmrw.dev/api/v1/tools/sync \
  -H "Authorization: Bearer fam_your_token" \
  -H "Content-Type: application/json" \
  -d '{
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

This gives familiar permission to reason over that tool for the current setup.

Current MVP shortcut:

- you can also send `tools` directly on `POST /api/v1/input`
- that is useful while setup/admin flows are still evolving

## Step 3: Send Conversation Input

Send a normal message into familiar.

```shell
curl -X POST https://familiar.chrsvdmrw.dev/api/v1/input \
  -H "Authorization: Bearer fam_your_token" \
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

familiar will then:

1. load the thread and memory context
2. decide whether to answer directly, ask a follow-up, or call a tool
3. store the turn
4. return the updated result

Important input rule:

- familiar only receives normalized text here
- if your product supports voice notes or speech input, transcribe or otherwise normalize that upstream before calling `/api/v1/input`
- large transcription blocks are fine as long as they arrive as plain `input.text`

## Step 4: Expose `/tools/execute`

If familiar decides that a tool should run, it will call:

```text
POST {target_url}
```

Example request sent by familiar:

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

- familiar has already chosen the tool
- your target does not need to decide which tool to run again
- ideally, the request body is only the tool arguments
- the current runtime still includes extra wrapper fields in the payload today
- the simplest target just accepts the arguments and performs the action
- shortcut-forced tool mode may also include `context.raw_input_text`
- async executors may receive `context.executor_result_webhook_url` and can call it later when work finishes

### Step 5: Send an async result back to familiar

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

familiar will return that execution state in the conversation response and, when available, include:

- `execution.state`
- `execution.execution_id`

When the task actually finishes, call familiar back:

```shell
curl -X POST https://familiar.chrsvdmrw.dev/api/v1/webhooks/executor \
  -H "Authorization: Bearer fam_your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "thread_id": "thread_abc",
    "result": {
      "execution_id": "exec_123",
      "state": "completed",
      "content": "Your import finished successfully."
    }
  }'
```

Keep this payload minimal unless you need more tracing:

- `thread_id`
- `result.execution_id` when you have one
- `result.state`
- `result.content`

Retry note:

- if you send `Idempotency-Key`, familiar will use it for replay protection
- if you do not send one, familiar falls back to `result.execution_id` when present

That is enough for familiar to append the async executor result into the thread and notify the user through its normal conversation flow.

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

- familiar listens to the user
- familiar decides what the user wants
- familiar picks the tool
- familiar calls your code when work should happen
- your code performs the action
- familiar explains the result back to the user

## Channel Identity

Every request should include:

- `integration_id`
- `user_id`
- `channel.type`
- `channel.id`

This matters because familiar uses channel context to maintain recent thread continuity.

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

familiar handles those parts. Your system only needs to expose useful work at a URL familiar can trigger.
