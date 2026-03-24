# Integrations

An integration is the main boundary between familiar and an external system.

## What an integration owns

An integration is responsible for:

- authenticating to familiar
- syncing the tools a user is allowed to use
- exposing an executor endpoint
- exposing a channel delivery endpoint

## Syncing tools

Each integration tells familiar which tools a user is allowed to use.

That tool list should come from `familiar.json`.

The main sync endpoint is:

```text
POST /api/v1/integrations/:integration_id/users/:user_id/tools/sync
```

## Sending input

The main input endpoint is:

```text
POST /api/v1/input
```

Send normalized text plus the integration, user, and channel context. familiar then decides whether to reply directly, ask for clarification, or invoke a tool.

## Thread and channel continuity

familiar uses:

- `integration_id`
- `user_id`
- `channel.type`
- `channel.id`

to continue the right conversation.

If `thread_id` is missing, familiar can still continue the correct thread based on recent channel context.

## Input flow

1. Send normalized text to familiar.
2. familiar resolves thread and context.
3. familiar decides whether to reply, clarify, or run a tool.
4. If a tool is needed, familiar calls the integration's executor target.

## Why this split matters

This keeps one clear split:

- familiar owns conversation behavior
- the integration owns business connectivity

That split is what makes the product easier to integrate and easier to reason about.
