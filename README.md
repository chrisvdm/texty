<img src="public/logo.png" width="325" align="right" />

# texty

_coming soon..._

Texty is a hosted conversation layer for executable systems.

Texty is still in progress and not yet ready for general use.

Its end goal is simple:

- people talk to Texty
- Texty keeps track of threads, context, and memory
- Texty decides when to answer directly and when work needs to be handed off
- connected executors perform the work
- Texty explains the result back to the user

That means Texty is not meant to be the place where workflows or business logic are built. It is the layer that makes those systems usable through conversation.

## Why This Is Useful

Without Texty, every app or script that wants a conversational interface has to rebuild the same things:

- thread handling
- context and memory
- clarification questions
- channel continuity
- user-facing replies

Texty is meant to own those parts once.

A connected executor can be:

- a product backend
- a workflow runner
- a small script
- an AI-generated service

So the value of Texty is that it turns executable systems into systems people can talk to.

## Current Status

Texty is currently an MVP in progress.

The core shape is there, but the product is still being hardened and simplified before it should be treated as a stable hosted service.

## Current Features

- hosted conversation flow with a provider-style API
- thread history and thread management
- shared memory and thread-local memory
- private threads
- channel-aware thread continuation
- tool sync for connected executors
- tool execution callback flow
- request tracing
- idempotency on write routes
- rate limiting on conversation input
- local web client and sandbox testing routes
- mock execution endpoint for local development

## What’s Next

- simplify the public API further for easier human and AI integration
- replace remaining `provider` terminology in the wire format with clearer executor language
- strengthen hosted onboarding and token management
- remove more browser-era assumptions from the core architecture
- improve async execution handling for longer-running work
- provide a tiny canonical reference executor
- continue hardening auth, observability, and operational behavior

## What Texty Should Become

Texty should work as a hosted service that sits in front of many different executors.

In that model:

- Texty owns conversation
- Texty owns memory
- Texty owns threads
- executors own actions and side effects

The same core should be usable across:

- web chat
- messaging
- email
- transcribed voice

## Hosted Model

The simple MVP identity model is:

- `account`
  - owns billing and connected apps
- `executor`
  - one connected app or service
  - gets one shared runtime token for that app/team
- `end_user`
  - the person talking through Texty

For the current MVP, the runtime token is scoped per executor/app, not per teammate and not per end user.

## Basic Integration Flow

The normal integration path is:

1. create an executor
2. give it a token
3. sync its tools into Texty
4. send user input to Texty
5. let Texty call the executor when work should happen

The main endpoint is:

```text
POST /api/v1/conversation/input
```

That is the center of the integration story.

## Setup

1. Install dependencies:

```shell
npm install
```

2. Create a `.dev.vars` file for local development:

```shell
OPENROUTER_API_KEY=your_openrouter_key
OPENROUTER_MODEL=openai/gpt-4o-mini
OPENROUTER_SITE_URL=http://localhost:5173
OPENROUTER_SITE_NAME=Texty
TEXTY_PROVIDER_CONFIG='{"provider_a":{"token":"dev-token","baseUrl":"http://localhost:5173/sandbox/mock-provider"}}'
```

3. Start the app:

```shell
npm run dev
```

## Local Use

For local testing:

- `/` is the main web client
- `/sandbox/messenger` is the phone-style message simulator
- `/sandbox/provider` is the API harness
- `/sandbox/mock-provider/tools/execute` is the mock execution endpoint
- `/debug` shows stored memory state

## API Quickstart

Sync tools:

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

Send input:

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

Read threads:

```shell
curl http://localhost:5173/api/v1/providers/provider_a/users/user_123/threads \
  -H "Authorization: Bearer dev-token"
```

## Current API Behavior

- responses include `request_id` and `X-Request-Id`
- write routes support `Idempotency-Key`
- conversation input is rate-limited per executor/user pair
- normal conversations are captured into memory by default
- private threads are excluded from shared-memory capture and retrieval

Current execution states:

- `completed`
- `needs_clarification`
- `accepted`
- `in_progress`
- `failed`

## Scripts

- `npm run dev`
- `npm run check`
- `npm run build`
- `npm test`
