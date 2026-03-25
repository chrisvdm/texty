# familiar MVP Plan

## Purpose

This document defines the current shippable MVP surface.

It is intentionally narrower than the long-term product architecture.

The target architecture is still:

- one account can have many integrations
- one integration can have many end users
- `integration_id` differentiates those setups

But the current MVP public model is simpler so humans and AI can get to first success faster.

## Current MVP Goals

The MVP should prove that familiar can:

1. create an account quickly
2. issue one usable API token immediately
3. let that token identify the current default setup
4. accept a user and channel conversation turn
5. resolve the right thread
6. load the right memory
7. answer directly, clarify, or call a tool
8. persist the result
9. expose the same behavior to the existing web UI

## Current MVP Scope

### In scope

- account creation
- one default API token per account
- token-authenticated conversation access
- token-backed default setup resolution
- user/channel-scoped conversation identity
- channel-linked thread resolution
- thread create/list/rename/delete
- conversation input endpoint
- tool sync endpoint
- optional tools on input for bootstrap and development
- sync tool execution callout
- async executor callback endpoint
- private-thread enforcement
- user-scoped shared memory within the current setup
- web UI as a channel client of the same backend path

### Out of scope

- explicit multi-integration account management
- setup selection UX
- account claiming and human login
- billing
- advanced admin tooling
- streaming provider API responses
- cross-account shared memory

## Current MVP Identity Model

Public happy path:

- bearer token identifies the account and its current default setup
- request carries `user_id`
- request carries `channel.type`
- request carries `channel.id`
- request may carry `thread_id`
- `integration_id` is optional in the happy path

Important note:

- this is an MVP simplification, not the long-term product model
- later, when one account can manage multiple integrations, explicit `integration_id` becomes important again

## Current MVP Thread Rule

If `thread_id` is supplied:

- use it

If `thread_id` is not supplied:

- look up the most recent thread for that channel
- if the new input clearly fits that thread, continue it
- otherwise infer a better thread or start a new one

## Current MVP Memory Rule

### Capture

- normal conversations are captured by default
- private threads are the exception

### Retrieval

Supported retrieval modes in practice:

- `thread`
- `provider_user`
- `external`

The current simplification under discussion is that early hosted flows may use `user_id = account_id` until end-user separation matters more.

That is an MVP convenience, not the long-term identity model.

## Current MVP Execution Rule

The MVP supports:

- direct reply
- clarification
- sync tool execution
- async executor callbacks through `POST /api/v1/webhooks/executor`

Useful execution states remain:

- `completed`
- `needs_clarification`
- `accepted`
- `in_progress`
- `failed`

## Current MVP API Surface

Account bootstrap:

- `POST /api/v1/accounts`
- `GET /api/v1/account`

Conversation/runtime:

- `POST /api/v1/input`
- `POST /api/v1/conversation/input`
- `POST /api/v1/webhooks/executor`
- `POST /api/v1/threads`
- `GET /api/v1/users/:user_id/threads`
- `PATCH /api/v1/threads/:thread_id`
- `DELETE /api/v1/threads/:thread_id`
- `GET /api/v1/users/:user_id/memory`
- `GET /api/v1/threads/:thread_id/memory`

Compatibility routes still exist for integration-scoped paths, but they are not the primary MVP teaching surface.

## Current MVP Tool Setup Rule

There are two valid MVP ways to provide tools:

1. `POST /api/v1/users/:user_id/tools/sync`
2. include optional `tools` on `POST /api/v1/input`

The second path exists to reduce admin/setup friction during development.

Long term, the hosted registry remains the intended source of truth.

## Current MVP Security Requirements

Minimum security for MVP:

- bearer token authentication
- token-to-account resolution
- token-to-default-setup resolution
- thread ownership checks
- private-thread retrieval and capture enforcement
- request tracing for write operations
- basic rate limiting on input and tool setup routes

## Current MVP Build Order

1. add account creation and token issuance
2. make token resolve the current default setup
3. expose account lookup by token
4. support conversation input on the token-scoped happy path
5. support tool setup through sync and optional inline tools
6. support sync and async executor boundaries
7. keep the web UI on the same conversation core
8. later reintroduce explicit integration lifecycle when multi-setup support becomes necessary

## Definition of Done

The MVP is successful when:

- a user can create an account
- a user can receive one API token immediately
- that token can fetch account info
- that token can send a message for a `user_id` and `channel`
- familiar can continue the right thread or create a new one
- familiar can retrieve the right memory according to policy
- familiar can use stored tools or optional tools supplied on input
- familiar can call an executor and receive async results
- the existing web UI can operate through the same core path
