# familiar Tool Target Direction

## Summary

familiar is moving toward a simpler tool-target architecture.

familiar should act as the conversational interface and memory layer. External systems should expose tools and perform side effects. familiar should then decide when to answer directly, when to clarify, and when to call a tool target.

This allows familiar to be reused by multiple execution systems such as:

- internal execution systems
- third-party tool runtimes
- future provider platforms

This document focuses on the tool-target API boundary.
Identity, storage, and memory-policy semantics are defined in `docs/architecture-foundations.md`.

## End Goal In Plain Language

familiar should be the system a user talks to.

Connected tools should be the things that actually do things.

So when a user asks for something:

1. familiar understands the request
2. familiar uses memory and thread context
3. familiar decides whether a tool should run
4. the target executes the work
5. familiar explains the result back to the user

## Product Split

### familiar owns

- user-facing conversation
- chat history and threads
- command handling
- multimodal input normalization
- memory and long-term context
- current-turn reasoning
- tool selection
- follow-up questions and clarification
- final response composition

### Connected systems own

- tool implementation
- side effects
- domain rules
- execution logs
- integrations with business systems
- optional final validation of already-structured arguments

## Important Execution Rule

familiar chooses the tool.

The target familiar calls does not need to decide which tool to run again.

That means the simplest model is:

- familiar stores the tool id
- familiar stores where that tool lives
- familiar decides when the tool is relevant
- familiar extracts schema-valid arguments and sends them to the correct target
- the target just performs the work and returns the result

This is intentionally simpler than a second dispatch layer.

## Identity Model

### One integration can have many users

Yes.

An integration is the external system identity familiar uses for auth, ownership, and tool sync. One integration may serve many end users.

### Purpose of `integration_id`

`integration_id` identifies the external integration.

Its purpose is to:

- route to the correct group of tools
- namespace tools so names do not collide
- support multiple integrations for the same familiar deployment
- separate permissions and sync state by integration

Examples:

- `integration_a`
- `integration_b`

### Who is the user?

The user is the human using the connected system, not the system itself.

Examples:

- Chris using Provider A
- Sam using Provider B

The integration is the application/system identity.
The user is the person.

So a valid identity tuple is:

- `integration_id = integration_a`
- `user_id = chris_123`

This means:

- Integration A is the integration
- Chris is the end user

## Memory Policy

Connected systems should not be forced into one memory-retrieval model.

familiar should capture memory from normal conversations by default, unless the thread is explicitly private.

After that, connected systems should be able to choose how much of that captured memory they want to retrieve and use.

Examples:

- one provider may want `none`
- one provider may want `thread`
- another may want `provider_user`
- some providers may want `external` context from their own RAG system

The full policy model is described in `docs/architecture-foundations.md`.

## Recommended Contract

### 1. Tool sync

Integrations should sync the allowed tools for a given user into familiar.

The preferred source of that sync payload is a manifest file named `familiar.json`.

This should happen:

- on initial connection/setup
- when the user gains or loses access to tools
- when tool schemas change materially

Example request:

`POST /api/v1/integrations/:integration_id/users/:user_id/tools/sync`

```json
{
  "integration_id": "integration_a",
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
      }
    }
  ]
}
```

### 2. Conversation input

Clients should talk to familiar through a single main input endpoint.

Example request:

`POST /api/v1/input`

```json
{
  "integration_id": "integration_a",
  "user_id": "user_123",
  "thread_id": "thread_abc",
  "input": {
    "kind": "text",
    "text": "Update the sales sheet and mark Acme as contacted"
  },
  "model": "openai/gpt-4o-mini",
  "timezone": "Africa/Johannesburg"
}
```

familiar should then:

1. load memory and thread context
2. reason over the user's allowed tools
3. either answer directly, ask a follow-up, or call a tool target

### 3. Tool execution

When a tool should run, familiar should call the target that owns it.

Example request from familiar to the target:

`POST {target_url}`

```json
{
  "tool_name": "spreadsheet.update_row",
  "user_id": "user_123",
  "thread_id": "thread_abc",
  "arguments": {
    "sheet": "Sales Leads",
    "row_id": "42",
    "values": {
      "status": "contacted"
    }
  }
}
```

The important rule is that `arguments` must already match the synced `input_schema`.
The target may receive metadata fields such as `tool_name`, `user_id`, and `thread_id`, but it should not need to re-run intent detection or argument extraction.
familiar has already chosen the tool and already knows where it lives.

Example response:

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

## Efficiency Direction

For efficiency and reduced LLM cost, the preferred direction is:

- familiar performs the single conversational reasoning step
- targets execute deterministically
- targets should not do a second AI routing pass for requests coming from familiar unless there is a very strong reason

That means:

- command handling should be deterministic
- obvious thread actions should be deterministic
- one model call should usually decide:
  - direct answer
  - clarification
  - tool call

## Current Status

This tool-target model is the intended architecture direction.

The current codebase already has:

- threads
- memory
- unified conversation input handling
- command-based interaction

But the current runtime and docs still contain older provider-oriented language and routes.
