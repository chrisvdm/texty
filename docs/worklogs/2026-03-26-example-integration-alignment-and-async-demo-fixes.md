# 2026-03-26 Example Integration Alignment And Async Demo Fixes

## Goal

Make the public example integrations reflect the current token-backed MVP contract, then fix the async countdown demo so its UI matches the real execution lifecycle instead of showing stale completions.

## Changes

- Updated the example servers to use the current happy-path API shape:
  - `POST /api/v1/tools/sync`
  - `POST /api/v1/input`
  - removed redundant `integration_id` and `user_id` fields from the main example request bodies
- Fixed the minimal executor example to read the current conversation response shape:
  - `response.content`
  - `response.type`
- Aligned the pinned tool example ids so the local server default and manifest both use `demo_pinned_tool`.
- Updated the minimal executor README and UI debug payload so the example teaches the current token-scoped route instead of the older compatibility route.
- Fixed the async countdown demo state handling:
  - added a lightweight polling state read for the playground
  - appended async completion messages to the chat instead of replacing the initial assistant reply
  - matched completion callbacks to the current execution instead of reusing older messages from the same demo user or thread
  - limited the countdown panel to the latest run so older history does not make new runs look completed immediately
- Changed the example payload panels to show the actual `input_response` from *familiar* instead of the example wrapper object.
- Updated explicit tool invocation syntax to `@tool-name` across the runtime parser, tests, examples, and the main user-facing docs.
  - kept `@[tool-name]` working as a compatibility input for now

## Result

The example integrations now follow the current public API contract closely enough to copy the integration pattern, the async countdown demo behaves like a real delayed completion flow instead of surfacing stale UI state, and the pinned-tool flow now matches the intended agent-like `@tool-name` syntax.

## Verification

- `node --check examples/minimal-executor/server.mjs`
- `node --check examples/minimal-executor/executor.mjs`
- `node --check examples/async-countdown/server.mjs`
- `node --check examples/async-countdown/executor.mjs`
- `node --check examples/pinned-tool/server.mjs`
- `node --check examples/pinned-tool/executor.mjs`
- `node --experimental-strip-types --experimental-specifier-resolution=node --test src/app/provider/provider.logic.test.ts`
- `npm run types`
