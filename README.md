<img src="public/logo.png" width="325" align="right" />

# texty

_coming soon..._

Texty is a hosted conversation layer for executable systems.

People talk to Texty. Texty keeps track of threads, context, and memory. When work needs to happen, Texty decides which tool should run, triggers that tool's target, and then explains the result back to the user.

## Features

- conversation threads managed by Texty
- shared memory across normal conversations
- private threads that stay out of shared memory
- channel-aware continuity across web, messaging, email, and other inputs
- tool and workflow handoff to connected tool targets
- clarification flow when a request is missing information

## Why It’s Useful

Without Texty, every app or script that wants a conversational interface has to rebuild the same things:

- conversation history
- thread handling
- memory
- clarification questions
- channel continuity
- user-facing replies

Texty is meant to own those parts once, so connected systems can focus on doing useful work.

## Current Status

Texty is currently an MVP in progress.

The core shape is there, but the product is still being hardened and simplified before it should be treated as a stable hosted service.

## Quick Start

The main endpoint is:

```text
POST /api/v1/input
```

## Flow

Every message goes through the same first step:

1. A user sends input to Texty.
2. Texty loads the relevant thread and memory.
3. Texty decides what kind of response is needed.

There are then three main outcomes:

### 1. Direct reply

This happens when Texty can answer on its own.

Example:

- the user asks a question
- the answer is already in the thread or memory
- no outside work is needed

Why it matters:

- fastest path
- no tool call
- best for conversational continuity

### 2. Follow-up question

This happens when the request is real, but important details are missing.

Example:

- “Update the spreadsheet”
- but Texty does not know which spreadsheet or which row

Why it matters:

- prevents bad guesses
- keeps work accurate
- lets Texty gather what the tool will need before calling it

### 3. Tool handoff

This happens when work needs to be done outside Texty.

Example:

- updating a spreadsheet
- sending something to another system
- running a workflow or script

Why it matters:

- this is how Texty turns conversation into action
- Texty stays focused on the conversation
- the target stays focused on doing the work

```mermaid
flowchart LR
    A["Web chat"] --> T["Texty"]
    B["Email"] --> T
    C["Messaging app"] --> T
    D["Voice transcript"] --> T
    T --> M["Threads and memory"]
    T --> E1["Tool target A"]
    T --> E2["Tool target B"]
    T --> E3["Tool target C"]
```

## Minimum Integration Flow

This is the smallest useful setup path for connecting code to Texty and getting a working request through the system.

1. Create a connection and get a token.
2. Define your tools in `texty.json`.
3. Sync the tools Texty can use for a user.
4. Send user input to Texty.
5. Let Texty call the correct tool target when work should happen.

There is a tiny reference example here:

- [`examples/minimal-executor/README.md`](examples/minimal-executor/README.md)

What that example is for:

- you can copy that folder into your own project
- run the tiny example server
- point Texty at it
- see a full request go from Texty to your tool target and back

If you are new to this, think of it like this:

- Texty is the thing the user talks to
- `texty.json` is the contract that tells Texty what tools exist and what arguments they need
- your code or webhook is the thing that actually does the work once Texty has already extracted those arguments
- the example folder shows the smallest possible version of that target

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

## Tool Contract

`texty.json` is the sync manifest.

It is the source of truth for:

- which tools Texty may use
- what each tool does
- the exact schema Texty must satisfy before calling the executor

That means Texty should use the manifest to:

- choose the right tool
- extract arguments into the declared schema
- ask follow-up questions when required fields are missing

The executor should receive validated tool arguments, not raw user language that still needs interpretation.

## API Reference

### Authentication

Every API request needs this header:

```text
Authorization: Bearer YOUR_INTEGRATION_TOKEN
```

That token identifies which connected system is calling Texty.

### Sync tools

Use this endpoint to tell Texty which tools are available for a specific user.

In practice, this payload should usually come from your `texty.json` file.

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

Field guide:

- `provider_id`
  - the current wire-format integration id
  - this must match the token making the request
- `user_id`
  - the end user who will be talking to Texty
  - use a stable id from your own app
- `tools`
  - the list of tools Texty is allowed to use for this user
- `tool_name`
  - the name Texty will use internally when choosing a tool
- `description`
  - a plain-language explanation of what the tool does
  - Texty uses this to decide when the tool is relevant
- `input_schema`
  - the expected shape of the tool arguments
  - keep it simple and explicit
- `status`
  - whether the tool is currently available
  - use `active` when the tool should be callable

Plain English example:

- `provider_id = "provider_a"` means “this integration is called provider_a”
- `user_id = "user_123"` means “these tools are available for this user”
- `tool_name = "spreadsheet.update_row"` means “this tool updates a spreadsheet row”

What Texty should do with that schema:

- if the user asks for spreadsheet work, Texty should choose `spreadsheet.update_row`
- if the schema needs `sheet`, `row_id`, and `values`, Texty should extract those fields
- if one is missing, Texty should ask for it before calling the executor

### Send input

Use this endpoint when a user sends a message into Texty.

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

Field guide:

- `provider_id`
  - the current wire-format integration id
  - tells Texty which tool set this conversation belongs to
- `user_id`
  - the end user speaking through Texty
  - this is how Texty keeps memory and threads tied to the right person
- `input`
  - the actual thing the user sent
- `input.kind`
  - the type of input
  - for now, the main value is `text`
- `input.text`
  - the user’s message
  - Texty expects normalized text only
  - if your system starts from voice or audio, normalize or transcribe it before calling this API
  - large transcription blocks are valid as long as they are still plain text
- `channel`
  - where the message came from
- `channel.type`
  - the kind of surface, such as `web`, `email`, or `messaging`
- `channel.id`
  - the identity of that surface for this user
  - examples: an email address, a browser session id, or a messaging account id
- `channel.name`
  - optional descriptive label for admin or UI use
  - not required for routing or identity

Why `channel` matters:

- Texty shares memory at the user level
- but it can keep different recent thread continuity per channel

## Execution Contract

When Texty calls a tool target, the important part of the payload is the validated `arguments` object.

The target may also receive metadata such as:

- `provider_id`
- `user_id`
- `thread_id`
- `tool_name`

But the executor should not have to decide intent again or parse the user's natural-language request again.

Example:

If `texty.json` says `todos.add` requires:

```json
{
  "todo_items": ["call dad", "buy dad a birthday present"]
}
```

then Texty should send exactly that schema-shaped data to the executor once it is ready.

If the user forces a tool explicitly in conversation, that still arrives at Texty as ordinary text.
For example, `@[todos.add] call dad and buy milk` is not a separate input type.

Plain English example:

- `channel.type = "email"` means “this came from email”
- `channel.id = "chris@example.com"` means “this specific email identity sent the message”

### List threads

Use this endpoint to fetch the threads Texty knows about for a user.

```shell
curl http://localhost:5173/api/v1/providers/provider_a/users/user_123/threads \
  -H "Authorization: Bearer dev-token"
```

This is mostly useful for admin tools, debug screens, or a UI that wants to show past threads.

### Response behavior

- responses include `request_id` and `X-Request-Id`
- write routes support `Idempotency-Key`
- input is rate-limited per integration/user pair
- normal conversations are captured into memory by default
- private threads are excluded from shared-memory capture and retrieval
- OpenRouter is the default routing model for intent and tool choice
- Texty can optionally use Cloudflare Workers AI for routing if explicitly enabled

Optional routing model setting:

- `TEXTY_USE_WORKERS_AI_ROUTING`
  - set this to `true` if you want Texty to use Workers AI for routing and extraction
- `CLOUDFLARE_ROUTING_MODEL`
  - use this to choose the Workers AI model for the first-pass routing and intent step
  - if unset, Texty uses `@cf/meta/llama-3.1-8b-instruct-fast`
- `CLOUDFLARE_EXTRACTION_MODEL`
  - use this to choose the Workers AI model for schema-shaped argument extraction and follow-up argument updates
  - if unset, Texty uses `@cf/qwen/qwen3-30b-a3b-fp8`
- `CLOUDFLARE_DECISION_MODEL`
  - legacy fallback that applies to both steps if the stage-specific Cloudflare variables are unset
- `OPENROUTER_ROUTING_MODEL`
  - use this to choose the OpenRouter model for the first-pass routing and intent step
- `OPENROUTER_EXTRACTION_MODEL`
  - use this to choose the OpenRouter model for schema-shaped argument extraction and follow-up argument updates
- `OPENROUTER_DECISION_MODEL`
  - legacy fallback that applies to both steps if the stage-specific OpenRouter variables are unset

Recommended Workers AI split for Texty:

- routing: `@cf/meta/llama-3.1-8b-instruct-fast`
- extraction: `@cf/qwen/qwen3-30b-a3b-fp8`

Why:

- the router should be fast and cheap
- extraction quality matters more than raw routing speed
- tool schemas and clarification updates benefit from the stronger extraction pass

Execution states:

- `completed`
- `needs_clarification`
- `accepted`
- `in_progress`
- `failed`

Meaning:

- `completed`
  - the tool finished the work
- `needs_clarification`
  - more information is needed before work can continue
- `accepted`
  - the tool accepted the work but has not finished yet
- `in_progress`
  - the work is actively running
- `failed`
  - the tool could not complete the work

When a tool returns `accepted` or `in_progress`, the intended follow-up path is a minimal executor callback to Texty at `POST /api/v1/webhooks/executor`:

```json
{
  "provider_id": "provider_a",
  "user_id": "user_123",
  "thread_id": "thread_abc",
  "result": {
    "state": "completed",
    "content": "Your import finished successfully."
  }
}
```

This is an async executor result callback, not Texty-owned task management.
Texty should append that result to the thread and handle notifying the user from there, rather than having the executor message the user channel directly.

## Scripts

- `npm run dev`
- `npm run check`
- `npm run build`
- `npm test`
