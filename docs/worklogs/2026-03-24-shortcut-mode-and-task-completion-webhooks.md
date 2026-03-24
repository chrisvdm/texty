# 2026-03-24 Shortcut Mode And Task Completion Webhooks

## Goal

Resume Texty after MVP demo feedback by adding two missing usability features:

- explicit tool shortcut mode using `@[tool-name]`
- webhook-driven async executor result delivery back into the originating channel

## Changes

- Added persisted per-thread shortcut mode state in chat sessions.
- Added shortcut parsing and exit phrase handling:
  - `@[tool-name]` enables direct tool mode for the thread
  - the remainder of the same message, and later messages while the mode is active, are passed straight to that tool
  - phrases such as `that's enough` or `done` end shortcut mode
- Added shortcut argument helpers so verbatim text can still be mapped into simple string or string-array schemas without going back through LLM extraction.
- Extended executor calls to include:
  - channel context
  - raw shortcut input
  - a Texty completion webhook URL
- Added provider async result callback support at:
  - `/api/v1/webhooks/executor`
- Added provider-side outbound channel delivery calls at:
  - `POST {provider.baseUrl}/channels/messages`
- Added thread-to-channel binding persistence so async completions can route back to the correct channel even after the original turn is over.
- Updated the minimal executor example so it can:
  - consume shortcut raw input
  - simulate async completion callbacks
  - accept outbound channel message delivery calls

## Result

Texty now supports two practical flows that were missing in the MVP demo:

- users can intentionally force a specific tool without relying on routing confidence
- executors can finish work later and still have Texty append the later result into the thread and send it back to the channel

## Verification

- `npm run types`
- `npm test -- src/app/provider/provider.logic.test.ts src/app/provider/provider.execution.test.ts src/app/provider/provider.conversation.endpoint.test.ts src/app/provider/provider.executor-result.endpoint.test.ts src/app/chat/shared.test.ts src/app/provider/provider.idempotency.test.ts`
