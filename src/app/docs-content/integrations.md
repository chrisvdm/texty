# Integrations

An integration is the main boundary between familiar and an external system.

## Syncing tools

Each integration tells familiar which tools a user is allowed to use.

That tool list should come from `familiar.json`.

## Input flow

1. Send normalized text to familiar.
2. familiar resolves thread and context.
3. familiar decides whether to reply, clarify, or run a tool.
4. If a tool is needed, familiar calls the integration's executor target.

## Why this matters

This keeps one clear split:

- familiar owns conversation behavior
- the integration owns business connectivity
