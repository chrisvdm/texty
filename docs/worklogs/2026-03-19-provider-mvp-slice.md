# 2026-03-19 Provider MVP Slice

## Goal

Start executing the provider-aware MVP plan by adding the first real provider service path to Texty.

## What Was Added

- Provider-side types in `src/app/provider/provider.types.ts`
- Provider API-token authentication in `src/app/provider/provider-auth.ts`
- Provider/user context Durable Object storage in:
  - `src/app/provider/provider-user-context-do.ts`
  - `src/app/provider/provider.storage.ts`
- Provider-aware service logic in `src/app/provider/provider.service.ts`
- First provider API routes in `src/app/provider/provider.routes.ts`

## Implemented Behavior

- Added authenticated provider routes for:
  - tool sync
  - conversation input
  - thread create
  - thread list
  - thread rename
  - thread delete
  - shared memory read
  - thread memory read
- Added provider/user-scoped context storage for:
  - shared memory
  - thread list
  - allowed tools
  - channel-linked recent-thread continuity
  - memory policy
  - selected model
- Added channel-linked thread resolution so the service can:
  - use an explicit `thread_id` when provided
  - otherwise prefer the most recent thread for the channel when the new input appears to fit it
  - otherwise create a new thread
- Added sync provider tool execution callout through the provider's `/tools/execute` endpoint
- Added provider-side private-thread enforcement for shared-memory retrieval and shared-memory writes
- Rewired the browser chat service so the web UI now uses the provider-backed core path for:
  - message sends
  - thread creation
  - thread selection
  - thread rename
  - thread deletion
- Rewired initial page hydration for the web chat and sandbox messenger so they now load from provider/user/channel-backed state first, using browser session only as a bootstrap and rendering bridge
- Used the browser session as a linked web-channel identity by:
  - deriving a stable web user id from the browser session cookie
  - bootstrapping provider context from existing browser-session thread and memory state when needed
  - syncing provider-backed state back into the browser session for UI rendering

## Worker Changes

- Added the new provider context Durable Object binding and migration tag in `wrangler.jsonc`
- Updated `src/worker.tsx` so `/api/v1/*` routes bypass browser-session bootstrapping and use the provider API routes instead

## Notes

- The existing browser-session web UI still exists as a rendering/session layer, but both its hydration path and its thread/message actions now use provider-backed state.
- Browser session still exists as the current web-channel bridge and persistence helper rather than the long-term provider-authenticated user identity model for all surfaces.
- Provider auth currently expects `TEXTY_PROVIDER_CONFIG` as JSON in the environment, with per-provider API token configuration and optional base URL.

## Verification

- `npm run types` passed
- `npm run build` passed

The only build noise was Wrangler attempting to write its log file under the local `~/Library/Preferences/.wrangler/logs/` path.
