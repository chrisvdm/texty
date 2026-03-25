# familiar Current MVP Spec

## Purpose

This is the single reconstruction document for the current working MVP.

If the codebase disappeared, this is the document that should let someone rebuild the system as it exists today without confusing future architecture goals with current runtime behavior.

## Product Shape

The current MVP is a hosted conversation layer with:

- account creation
- one default API token per account
- one default setup behind that token
- thread and memory handling
- tool orchestration
- sync executor calls
- async executor callbacks

The current MVP does **not** expose full multi-integration account management yet.

## Identity Model

Current public model:

- `account`
  - internal owner record
- `api token`
  - machine credential
  - identifies the account
  - identifies the current default setup behind that account
- `channel`
  - where the user is speaking from
- `thread_id`
  - optional explicit conversation id

Current simplification:

- `integration_id` is optional in the public happy path
- the bearer token resolves the active setup implicitly

Long-term target, but not required for MVP:

- one account can have many integrations
- one integration can have many end users
- `integration_id` differentiates those setups explicitly

## Core Behavior

### Input

*familiar* receives normalized text only.

If the original input was audio, voice, or another modality, it must be normalized into text before calling the API.

### Thread continuity

If `thread_id` is present:

- use it

If `thread_id` is absent:

- use channel continuity and recent-thread fit to continue the right thread
- otherwise create a new thread

### Memory

Normal conversations are captured into memory by default.

Private threads are excluded from shared memory capture.

Supported retrieval modes in practice:

- `thread`
- `provider_user`
- `external`

### Tools

The current MVP supports two tool setup paths:

1. sync tools separately with `POST /api/v1/tools/sync`
2. include optional `tools` directly on `POST /api/v1/input`

If `tools` is supplied on input:

- store those tools in the current token-backed setup
- immediately use them for that request

This is a bootstrap convenience while admin/setup flows are still evolving.

`POST /api/v1/tools/sync` also configures that same token-backed setup. It does not create the setup itself.

Long term, the hosted registry remains the intended source of truth.

### Execution

When familiar chooses a tool:

- it calls the configured executor
- the executor decides sync vs async
- async results return through `POST /api/v1/webhooks/executor`

*familiar* is not a job runner.

## Required Endpoints

### 1. Create account

`POST /api/v1/accounts`

Request:

```json
{}
```

Response:

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

Rules:

- creates an internal account record
- creates one default setup for that account
- issues the first API token immediately
- token is shown once

### 2. Get account from token

`GET /api/v1/account`

Headers:

```text
Authorization: Bearer <api-token>
```

Response:

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

Rules:

- bearer token is the lookup key
- no account id needs to be sent

### 3. Send conversation input

`POST /api/v1/input`

Headers:

```text
Authorization: Bearer <api-token>
Content-Type: application/json
```

Request:

```json
{
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
}
```

Rules:

- `integration_id` is optional
- `tools` is optional
- `user_id` is optional on token-authenticated POST requests
- if `user_id` is omitted, runtime can derive it from the authenticated `account.id`
- `input.kind` is always `"text"`
- `input.text` must be non-empty normalized text

Behavior:

- authenticate token
- resolve current default setup
- load or create user context for that setup
- optionally update stored tools if `tools` is present
- resolve the thread
- load memory
- decide direct reply, clarification, or tool call
- persist the conversation state

### 4. Sync tools

`POST /api/v1/tools/sync`

Headers:

```text
Authorization: Bearer <api-token>
Content-Type: application/json
```

Request:

```json
{
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
}
```

Rules:

- authenticated token resolves the active setup
- the endpoint replaces or upserts the tool set for that user in that setup
- response may still include `integration_id` as the resolved backing setup id
- compatibility routes with `user_id` in the URL still exist, but they are no longer the primary MVP path

### 5. Thread endpoints

Required thread/runtime endpoints:

- `POST /api/v1/threads`
- `GET /api/v1/users/:user_id/threads`
- `PATCH /api/v1/threads/:thread_id`
- `DELETE /api/v1/threads/:thread_id`
- `GET /api/v1/users/:user_id/memory`
- `GET /api/v1/threads/:thread_id/memory`

The short explanation:

- create threads explicitly when needed
- list user threads
- mutate or delete threads
- inspect shared memory and thread memory for debugging/admin visibility

### 6. Async executor callback

`POST /api/v1/webhooks/executor`

Headers:

```text
Authorization: Bearer <api-token>
Content-Type: application/json
```

Request:

```json
{
  "user_id": "user_123",
  "thread_id": "thread_abc",
  "result": {
    "execution_id": "exec_123",
    "state": "completed",
    "content": "Your import finished successfully."
  }
}
```

Rules:

- `integration_id` is optional in the MVP happy path
- the callback appends the result into the existing thread
- `Idempotency-Key` is supported
- if no idempotency key is provided, the system may fall back to `result.execution_id`

## Error Model

Errors use one simple shape:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Invalid request payload.",
    "details": null
  }
}
```

Useful error categories:

- `unauthenticated`
- `forbidden`
- `invalid_request`
- `method_not_allowed`
- `rate_limited`

## CLI MVP

Current CLI commands:

- `familiar init`
- `familiar account create`
- `familiar account show`
- `familiar whoami`

Behavior:

- `familiar init`
  - creates an account
  - receives the first API token
  - stores it locally
- `familiar account create`
  - creates an account
  - prints the token without storing it
- `familiar account show`
  - uses the stored token or `--token`
  - fetches `GET /api/v1/account`

Planned npm install paths:

- `npx @familiar/cli@latest init`
- `npm install -g @familiar/cli`

Current status:

- the CLI package name is prepared
- npm publish is not live yet
- current working hosted bootstrap remains:
  - `/setup`
  - `POST /api/v1/accounts`

Current local config path:

```text
~/.codex/familiar/config.json
```

Stored fields today:

- `host`
- `token`
- `account_id`
- `created_at`

## Local Development Notes

The hosted product path and local contributor path are different.

Current local development still uses:

- `TEXTY_EXECUTOR_CONFIG`
- local executor base URLs
- compatibility integration ids inside local env config

That is implementation detail for the contributor environment, not the primary public MVP model.

## Non-Goals Of This Document

This document does not define:

- long-term multi-integration account management
- billing
- web login
- passkeys
- explicit integration lifecycle UX

Those belong in the long-term architecture and roadmap docs.
