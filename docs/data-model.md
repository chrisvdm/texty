# familiar Data Model

## Why This Document Exists

familiar's architecture depends on a small set of core entities.

Those entities appear across:

- storage
- APIs
- memory policy
- tool sync
- conversation handling

This document defines them in plain language so the rest of the system can use the same terminology consistently.

## Core Rule

familiar should keep a clear distinction between:

- who is talking
- which conversation they are in
- what memory is available
- what tools can be used

## Main Entities

### Account

An account owns billing and connected apps.

Long term:

- one account can own many integrations
- each integration gets its own setup boundary
- `integration_id` differentiates those setups

Current MVP:

- one account gets one default setup
- one default API token identifies that account and current setup
- explicit integration management is deferred

### Integration

An integration is a configured familiar connection for one app, instance, or deployment.

It is not a person.

It represents the system that:

- authenticates to familiar
- syncs tools into familiar
- receives tool execution requests from familiar

Key fields:

- `integration_id`
- `name`
- `base_url`
- `auth_config`
- `status`

Example:

```json
{
  "integration_id": "integration_a",
  "name": "Integration A",
  "base_url": "https://integration-a.example.com",
  "status": "active"
}
```

### End User

An end user is the human represented inside an integration.

Key fields:

- `integration_id`
- `user_id`
- `display_name`
- `memory_policy`
- `selected_model`

Important rule:

`user_id` is scoped to an integration unless a higher-level shared identity is added later.

Current MVP note:

- the public happy path can operate without explicit `integration_id`
- the authenticated token resolves the current default setup instead
- later, explicit `integration_id` becomes important again when one account can manage multiple setups

### Integration User Context

This is the user-level familiar record for one integration/user pair.

It should store:

- default model
- memory policy
- allowed tools
- integration-specific preferences
- references to global memory scope
- linked channel identities

Recommended key:

- `(integration_id, user_id)`

### Thread

A thread is one conversation.

It should store:

- `thread_id`
- `integration_id`
- `user_id`
- `title`
- `is_private`
- `created_at`
- `updated_at`
- `channel_context`

Important rule:

A thread belongs to one integration/user pair.

It may also carry channel metadata so familiar can resolve likely continuation when no `thread_id` is supplied.

### Channel Identity

A channel identity is the record of how the same user reaches familiar through a specific surface.

Examples:

- web session
- email address
- messaging account

Key fields:

- `integration_id`
- `user_id`
- `channel_type`
- `channel_id`
- `last_active_thread_id`
- `updated_at`

Important rule:

A channel is not a separate user.

It is a linked identity or surface for the same integration/user pair.

Its purpose is to help familiar decide which thread is most likely to continue naturally when no explicit `thread_id` is provided.

### Message

A message is one event in a thread.

It can represent:

- a user message
- an assistant reply
- a command
- a system notice

Key fields:

- `message_id`
- `thread_id`
- `role`
- `content`
- `created_at`
- `metadata`

Possible `role` values:

- `user`
- `assistant`
- `system`

### Thread Memory

Thread memory is the local memory for one thread.

It should contain:

- summary
- keywords
- extracted facts
- updated timestamp

This memory is local to the thread.

### Global Memory

Global memory is durable memory beyond one thread.

It should contain structured sections such as:

- identity
- family
- preferences
- work
- thread summary index

Global memory should be scoped by policy, not assumed to be universal.

### Memory Policy

Memory policy controls what familiar may retrieve and use.

It should be attached to the integration/user context.

Common modes:

- `none`
- `thread`
- `provider_user`
- `custom_scope`
- `external`

Even when usage is restricted, normal non-private conversations may still be captured by default.

Important rule:

- these modes control retrieval and usage
- they do not disable default capture for normal conversations
- private threads remain the explicit exception

### Memory Scope

A memory scope is the bucket from which shared memory is retrieved.

In the simplest case, that scope is the integration/user pair.

Later, a custom shared scope could allow controlled memory sharing across systems.

Key fields:

- `memory_scope_id`
- `mode`
- `owner`

### Allowed Tool

An allowed tool is one tool that familiar may consider for a specific integration/user pair.

It should contain:

- `integration_id`
- `tool_name`
- `description`
- `input_schema`
- `policy`
- `status`

This is the object familiar reasons over during a tool-capable conversation.

### Tool Policy

Tool policy defines how a tool may be used.

Possible rules include:

- confirmation required
- read-only
- write action
- long-running
- disabled

### Tool Execution Request

This is the structured request familiar sends to an executor.

It should contain:

- `execution_id`
- `integration_id`
- `user_id`
- `thread_id`
- `tool_name`
- `arguments`
- `context`

### Tool Execution Result

This is the executor's structured response after trying to perform work.

It should contain:

- `ok`
- `result` or `error`
- `summary`
- optional machine-readable data

## Relationship Overview

In plain terms:

- one account has many integrations
- one integration has many users
- one integration/user pair can have many linked channels
- one integration/user pair has many threads
- one thread has many messages
- one thread has one thread-memory record
- one integration/user pair has one main shared memory scope by default
- one integration/user pair has many allowed tools

## Suggested Storage Keys

- Integration: `integration_id`
- Integration user context: `(integration_id, user_id)`
- Thread: `thread_id`
- Message: `message_id`
- Shared memory: `memory_scope_id` or `(integration_id, user_id)`
- Allowed tool: `(integration_id, user_id, tool_name)`

## Current vs Intended State

### Current state

Today, the live implementation is still centered on:

- browser session
- active thread id
- thread list
- browser-session global memory

### Intended state

The intended model is:

- integration-scoped users
- explicit thread ownership
- policy-scoped memory
- synced allowed tools
- executor-facing tool execution

## Short Version

familiar's core data model is built around:

- account
- integration
- end user
- thread
- message
- memory
- tool access

Those entities need to stay distinct so conversation, memory, and execution rules remain predictable.
