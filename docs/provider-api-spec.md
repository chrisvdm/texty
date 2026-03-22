# Texty Provider API Specification

## Why This Document Exists

The provider API direction document explains the architecture.

This document explains the actual contract Texty should expose to connected systems.

It focuses on:

- authentication expectations
- endpoint shape
- request and response payloads
- status codes
- error format
- idempotency and ownership rules

## Scope

This is the target API specification.

It describes the intended service contract, not a claim that every endpoint already exists in the current runtime.

If you want the simplest path to connect an external script or service first, read `docs/provider-quickstart.md` before this document.

## Authentication Model

Every provider request to Texty should be authenticated.

Recommended default:

- `Authorization: Bearer <provider_token>`

That token should identify:

- the provider
- the environment
- the allowed API scope

Texty should never accept unauthenticated provider requests for:

- tool sync
- conversation input
- memory access
- thread access

## Ownership Rule

Every request is scoped to:

- `provider_id`
- `user_id`
- channel context

And where applicable:

- `thread_id`

Texty must verify that the authenticated provider is allowed to act for the `provider_id` in the request.

## Common Headers

Recommended headers:

- `Authorization: Bearer <provider_token>`
- `Content-Type: application/json`
- `Idempotency-Key: <unique-key>` for write operations that may be retried
- `X-Request-Id: <request-id>` for tracing

## Common Response Shape

Successful responses should be JSON.

Every successful and error response should also include:

- `request_id` in the JSON body
- `X-Request-Id` in the response headers

If the caller provides `X-Request-Id`, Texty should reuse it. Otherwise Texty should generate one.

Error responses should use a consistent shape:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "The request payload is missing user_id.",
    "details": null
  }
}
```

## Endpoints

### 1. Sync allowed tools

`POST /api/v1/providers/:provider_id/users/:user_id/tools/sync`

Purpose:

- tell Texty which tools this provider/user pair is allowed to use

Request:

```json
{
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
      "policy": {
        "confirmation": "required"
      },
      "status": "active"
    }
  ]
}
```

Success response:

```json
{
  "provider_id": "provider_a",
  "user_id": "user_123",
  "synced_tools": 1,
  "status": "ok"
}
```

Notes:

- this operation should replace or upsert the allowed tool set for the given provider/user pair
- removed tools should no longer be considered available unless explicitly retained by policy

Status codes:

- `200` success
- `400` invalid payload
- `401` unauthenticated
- `403` provider mismatch

### 2. Conversation input

`POST /api/v1/conversation/input`

Purpose:

- send one normalized conversation turn into Texty

Request:

```json
{
  "provider_id": "provider_a",
  "user_id": "user_123",
  "thread_id": "thread_abc",
  "input": {
    "kind": "text",
    "text": "Update the client spreadsheet"
  },
  "model": "openai/gpt-4o-mini",
  "timezone": "Africa/Johannesburg",
  "channel": {
    "type": "web",
    "id": "browser_session_abc"
  },
  "context": {
    "external_memories": []
  }
}
```

Behavior:

- Texty loads the thread and allowed memory
- Texty uses the channel context to resolve likely thread continuity if `thread_id` is missing
- Texty decides whether to answer, clarify, or invoke a tool
- Texty stores the turn

Thread resolution rule:

- if `thread_id` is present, use it
- otherwise check the most recent thread for that channel
- if the new input clearly fits that thread, continue it
- otherwise infer a better thread or start a new one

Success response:

```json
{
  "provider_id": "provider_a",
  "user_id": "user_123",
  "thread_id": "thread_abc",
  "messages": [
    {
      "message_id": "msg_1",
      "role": "user",
      "content": "Update the client spreadsheet",
      "created_at": "2026-03-19T09:30:00.000Z"
    },
    {
      "message_id": "msg_2",
      "role": "assistant",
      "content": "Which spreadsheet do you mean?",
      "created_at": "2026-03-19T09:30:01.000Z"
    }
  ],
  "action": {
    "type": "clarification"
  }
}
```

Possible action types:

- `direct_reply`
- `clarification`
- `tool_call`
- `command`

Possible execution states:

- `completed`
- `needs_clarification`
- `accepted`
- `in_progress`
- `failed`

Rate limiting:

- conversation input is rate limited per provider/user pair
- current MVP default: `30` requests per `60` seconds
- rate-limited responses return `429`
- rate-limited responses should include `Retry-After`

Status codes:

- `200` success
- `400` invalid payload
- `401` unauthenticated
- `403` provider mismatch
- `404` thread not found or not owned by provider/user
- `429` rate limited

Example rate-limited response:

```json
{
  "error": {
    "code": "rate_limited",
    "message": "Too many conversation requests. Try again shortly.",
    "details": {
      "retry_after_seconds": 12
    }
  }
}
```

### 3. Create thread

`POST /api/v1/threads`

Purpose:

- create a new thread for a provider/user pair

Request:

```json
{
  "provider_id": "provider_a",
  "user_id": "user_123",
  "title": "Planning notes",
  "is_private": false,
  "channel": {
    "type": "web",
    "id": "browser_session_abc"
  }
}
```

Success response:

```json
{
  "thread_id": "thread_abc",
  "title": "Planning notes",
  "is_private": false,
  "status": "ok"
}
```

### 4. List threads

`GET /api/v1/providers/:provider_id/users/:user_id/threads`

Purpose:

- list threads for one provider/user pair

Success response:

```json
{
  "threads": [
    {
      "thread_id": "thread_abc",
      "title": "Planning notes",
      "is_private": false,
      "updated_at": "2026-03-19T09:30:00.000Z"
    }
  ]
}
```

### 5. Rename thread

`PATCH /api/v1/threads/:thread_id`

Request:

```json
{
  "provider_id": "provider_a",
  "user_id": "user_123",
  "title": "Client planning notes"
}
```

### 6. Delete thread

`DELETE /api/v1/threads/:thread_id`

Request body:

```json
{
  "provider_id": "provider_a",
  "user_id": "user_123"
}
```

Behavior:

- delete transcript
- delete thread-local memory
- remove thread from user-visible thread list
- remove any shared-memory entries that depend only on this thread, according to the implemented provenance model

### 7. Read shared memory

`GET /api/v1/providers/:provider_id/users/:user_id/memory`

Purpose:

- inspect the shared memory currently associated with a provider/user pair

This is primarily useful for:

- debugging
- admin tooling
- future user-facing memory inspection

### 8. Read thread memory

`GET /api/v1/threads/:thread_id/memory`

Purpose:

- inspect thread-local memory for one thread

## Tool Execution Contract

When Texty decides a tool should run, it should call the provider that owns the tool.

Recommended request:

`POST {provider_base_url}/tools/execute`

```json
{
  "execution_id": "exec_123",
  "provider_id": "provider_a",
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
    "request_id": "req_123"
  }
}
```

Provider success response:

```json
{
  "ok": true,
  "result": {
    "summary": "Updated row 42 in Sales Leads.",
    "data": {
      "updated_rows": 1
    }
  }
}
```

Provider failure response:

```json
{
  "ok": false,
  "error": {
    "code": "sheet_not_found",
    "message": "Sales Leads was not found.",
    "details": null
  }
}
```

## Error Codes

Recommended Texty error codes:

- `invalid_request`
- `unauthenticated`
- `forbidden`
- `not_found`
- `conflict`
- `rate_limited`
- `provider_execution_failed`
- `internal_error`

## Idempotency Rules

Some operations should support idempotency keys.

Recommended:

- tool sync
- conversation input from webhook-driven channels
- thread creation if retried by providers
- thread rename and delete for provider-managed retries

Behavior:

- if the same `Idempotency-Key` is retried with the same request body, Texty should replay the original response
- if the same `Idempotency-Key` is reused with a different request body, Texty should return `409`
- replayed responses may include `X-Idempotent-Replay: true`

This avoids duplicate writes when a provider retries after a network failure.

## Security Rules

The provider API must enforce:

- authenticated provider identity
- provider/user ownership checks
- thread ownership checks
- rate limiting
- audit logging for write operations

Private-thread rules must also be enforced in the API runtime:

- no shared-memory retrieval for private threads
- no shared-memory promotion from private threads

## Current vs Intended State

### Current state

The live codebase does not yet expose this full provider API.

### Intended state

This specification is the target contract Texty should converge toward as it moves from browser-session prototype to external service.
