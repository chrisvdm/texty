# Texty Security Architecture

## Why This Document Exists

Texty is moving from a browser-session prototype toward a multi-tenant conversation service.

That shift changes the security requirements substantially.

Today, the app mostly protects one browser session from another.
The end goal is to protect:

- one executor from another
- one user from another
- one thread from another
- private conversations from shared memory
- provider execution boundaries from abuse or impersonation

This document explains:

- how security works today
- what the target security model is
- what controls are required before Texty should be treated as a real external service

## Security Position Today

Today, Texty is a browser-session application.

The current runtime uses:

- a browser session cookie
- a browser-session Durable Object
- per-thread Durable Objects for transcript storage

In practical terms, that means the current security boundary is:

- whoever holds the browser session cookie controls that browser session's threads and memory

This is acceptable for a prototype, but it is not yet a production-ready authentication or tenancy model.

## Current Authentication Model

Today, Texty identifies a client by browser session.

The current pieces are:

- `texty_session` cookie
- `BrowserSessionDurableObject`
- per-thread `ChatSessionDurableObject`

What this means:

- the browser session cookie identifies the session
- the browser session Durable Object stores:
  - active thread
  - thread list
  - selected model
  - global memory
- each thread Durable Object stores:
  - transcript
  - thread-local memory

What this does not mean:

- there is no real provider identity yet
- there is no real end-user identity yet
- there is no multi-tenant access model yet
- there is no public API authentication layer yet

## Target Authentication Model

In the target architecture, Texty should authenticate the executor system and scope every request to the represented end user.

The target request identity should always be built from:

- `executor_id`
- `user_id`

That gives Texty a stable way to decide:

- who is calling
- which user the request belongs to
- what memory and tools are allowed
- what data the request may read or write

## Core Security Concepts

### Account

An account owns billing and connected apps.

For MVP, account administration should stay minimal:

- an account can create executors
- each executor gets one shared runtime token
- the team working on that app shares the executor token through normal secret management

### Executor

An executor is an external system that connects to Texty.

Examples:

- an automation platform
- an app-building system
- a messaging integration backend

An executor is not a person.
It is the system making authenticated requests to Texty.

### End User

An end user is the human represented inside that executor.

The executor tells Texty which user the request belongs to.

That means:

- executors need their own authentication
- providers need a trusted way to assert `user_id`

### Thread

A thread is one conversation record.

A request may only access:

- the specific thread it is authorized to use
- memory allowed by the applicable memory policy

### Private Thread

A private thread is a conversation that must not contribute to shared memory and must not read from shared memory.

This needs to be a storage and retrieval rule, not just a user-interface label.

## Required Target Controls

Before Texty should be treated as a real service, these controls are necessary.

### 1. Executor Authentication

Every executor must authenticate to Texty.

Acceptable options:

- signed API keys
- service credentials
- OAuth-style machine authentication

Texty should reject:

- unauthenticated executor requests
- expired credentials
- requests signed for the wrong executor

### 2. Tenant Isolation

Texty must isolate data by executor and user.

At minimum, one executor must not be able to:

- read another executor's threads
- write another executor's memory
- sync tools for another executor
- execute work as another executor

This is the primary tenancy boundary.

### 3. User Authorization

Within an executor, requests must be scoped to the correct user.

Texty should not trust arbitrary `user_id` values without an authenticated executor context.

The executor may define the user identity, but Texty must enforce:

- all reads are scoped to that executor/user pair
- all writes are scoped to that executor/user pair

### 4. Thread Authorization

Every request involving a thread must confirm that the thread belongs to the authenticated executor/user context.

This prevents:

- reading another user's thread by guessing an id
- writing messages into another user's thread
- deleting or renaming threads outside the authorized scope

### 5. Private Thread Enforcement

Private threads need an explicit enforcement rule:

- no promotion into shared memory
- no retrieval from shared memory
- no cross-thread memory tree inclusion

If private mode only affects the UI, it is not secure enough.

### 6. Webhook Verification

If Texty accepts direct inbound traffic from external channels such as messaging or email systems, every inbound webhook must be verified.

That should include:

- signature verification or shared-secret verification
- replay protection where possible
- request timestamp validation where possible

Without this, an attacker could inject fake messages into a user's conversation.

### 7. Rate Limiting and Abuse Protection

Conversation input and executor sync endpoints must be rate-limited.

This protects against:

- model-cost abuse
- accidental loops
- provider bugs
- simple denial-of-service attempts

Rate limiting should exist at least at:

- provider level
- provider/user level
- possibly IP level for public web endpoints

### 8. Audit Logging

Texty should maintain an audit trail for security-relevant events.

At minimum:

- provider authentication failures
- tool sync events
- tool execution requests
- memory policy changes
- private-thread creation
- thread deletion
- export or deletion requests

This is necessary for debugging, incident response, and operational trust.

### 9. Secret Management

All secrets must be stored in secure secret storage.

This includes:

- model API keys
- provider credentials
- webhook secrets
- internal service tokens

They should not live in:

- source control
- client-side code
- synced configuration files

### 10. Data Lifecycle Controls

Texty needs documented rules for:

- retention
- deletion
- export
- redaction
- recovery behavior

This is especially important because Texty stores:

- conversation transcripts
- user memory
- thread summaries
- potentially sensitive personal details

## Memory Security Rules

Texty's memory model creates its own security requirements.

### Default Capture Rule

Normal conversations are captured into memory by default.

### Exception

Private threads are excluded from shared memory capture.

### Usage Rule

Providers may decide how much captured memory they use.

That means security must distinguish between:

- memory being stored
- memory being retrievable for a given request

Texty must enforce both.

It is not enough to store a policy in documentation.
The runtime has to check it during:

- memory write
- memory retrieval
- tool-context assembly
- thread summary indexing

## Security Headers and Browser Protections

The current app already sets several useful browser-side protections:

- `Strict-Transport-Security` in non-dev
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy`
- a nonce-based `Content-Security-Policy`

These are helpful, but they are not a substitute for:

- real provider authentication
- tenant isolation
- request authorization
- webhook verification

They protect the browser surface, not the future service boundary.

## What Is Missing Today

The current codebase does not yet implement:

- authenticated provider API access
- user-scoped tenancy outside browser session
- documented thread ownership checks by provider/user
- webhook signature verification for external channels
- a formal audit trail
- a documented retention and deletion policy

So the right way to describe the current project is:

- secure enough for a prototype browser-session app
- not yet a production external service

## Recommended Next Security Milestones

The next concrete steps should be:

1. Introduce explicit provider authentication for future API routes.
2. Move thread and memory ownership from browser session to `(provider_id, user_id)`.
3. Enforce private-thread behavior at storage and retrieval level.
4. Define a provider request-signing model.
5. Add rate limiting to conversation and tool-sync endpoints.
6. Define retention, deletion, and export behavior.
7. Add an audit log for security-relevant operations.

## Short Version

Today, Texty authenticates a browser session.

In the target architecture, Texty must authenticate providers, authorize user-scoped access, isolate tenants, enforce private-thread memory rules, verify external webhooks, and maintain an auditable record of security-sensitive actions.
