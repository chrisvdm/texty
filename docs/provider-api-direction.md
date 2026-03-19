# Texty Provider API Direction

## Summary

Texty is moving toward a provider-agnostic architecture.

Texty should act as the conversational interface and memory layer. External systems should expose tools and perform side effects. Texty should then decide when to answer directly, when to clarify, and when to call a provider-owned tool.

This allows Texty to be reused by multiple execution systems such as:

- internal execution systems
- third-party tool runtimes
- future provider platforms

This document focuses on the provider API boundary.
Identity, storage, and memory-policy semantics are defined in `docs/architecture-foundations.md`.

## End Goal In Plain Language

Texty should be the system a user talks to.

Providers should be the systems that actually do things.

So when a user asks for something:

1. Texty understands the request
2. Texty uses memory and thread context
3. Texty decides whether a provider tool should run
4. the provider executes the work
5. Texty explains the result back to the user

## Product Split

### Texty owns

- user-facing conversation
- chat history and threads
- command handling
- multimodal input normalization
- memory and long-term context
- current-turn reasoning
- tool selection
- follow-up questions and clarification
- final response composition

### Providers own

- tool and workflow definitions
- side effects
- domain rules
- execution logs
- integrations with business systems
- validation of domain-specific arguments

## Identity Model

### One provider can have many users

Yes.

A provider is a system that exposes tool execution capabilities to Texty. One provider may serve many end users.

### Purpose of `provider_id`

`provider_id` identifies the external execution system.

Its purpose is to:

- route tool execution to the correct provider
- namespace tools so names do not collide
- support multiple providers for the same Texty deployment
- separate permissions and sync state by provider

Examples:

- `provider_a`
- `provider_b`

### Who is the user?

The user is the human using the provider, not the provider itself.

Examples:

- Chris using Provider A
- Sam using Provider B

The provider is the application/system.
The user is the person.

So a valid identity tuple is:

- `provider_id = provider_a`
- `user_id = chris_123`

This means:

- Provider A is the provider
- Chris is the end user

## Memory Policy

Providers should not be forced into one memory-retrieval model.

Texty should capture memory from normal conversations by default, unless the thread is explicitly private.

After that, providers should be able to choose how much of that captured memory they want to retrieve and use.

Examples:

- one provider may want `none`
- one provider may want `thread`
- another may want `provider_user`
- some providers may want `external` context from their own RAG system

The full policy model is described in `docs/architecture-foundations.md`.

## Recommended Contract

### 1. Tool sync

Providers should sync the allowed tools for a given user into Texty.

This should happen:

- on initial connection/setup
- when the user gains or loses access to tools
- when tool schemas change materially

Example request:

`POST /api/v1/providers/:provider_id/users/:user_id/tools/sync`

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
      }
    }
  ]
}
```

### 2. Conversation input

Clients should talk to Texty through a single main input endpoint.

Example request:

`POST /api/v1/conversation/input`

```json
{
  "provider_id": "provider_a",
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

Texty should then:

1. load memory and thread context
2. reason over the user's allowed tools
3. either answer directly, ask a follow-up, or call a provider tool

### 3. Tool execution

When a tool should run, Texty should call the provider that owns it.

Example request from Texty to the provider:

`POST {provider_base_url}/tools/execute`

```json
{
  "execution_id": "exec_123",
  "provider_id": "provider_a",
  "user_id": "user_123",
  "tool_name": "spreadsheet.update_row",
  "arguments": {
    "sheet": "Sales Leads",
    "row_id": "42",
    "values": {
      "status": "contacted"
    }
  },
  "context": {
    "thread_id": "thread_abc"
  }
}
```

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

- Texty performs the single conversational reasoning step
- providers execute deterministically
- providers should not do a second AI routing pass for requests coming from Texty unless there is a very strong reason

That means:

- command handling should be deterministic
- obvious thread actions should be deterministic
- one model call should usually decide:
  - direct answer
  - clarification
  - tool call

## Current Status

This provider model is the intended architecture direction.

The current codebase already has:

- threads
- memory
- unified conversation input handling
- command-based interaction

But it does not yet expose the provider-facing HTTP API described here.
