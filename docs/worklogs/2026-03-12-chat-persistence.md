# 2026-03-12 Chat Persistence

## Scope

- Persist chat history across page refreshes.
- Improve the current chat UX without adding RAG or long-term memory yet.

## Completed

- Scaffolded a fresh RedwoodSDK app in this workspace.
- Replaced the starter with a custom OpenRouter-backed chat UI.
- Added RedwoodSDK server functions for chat completions.
- Initialized git, configured the remote, and pushed the initial project to GitHub.
- Added Durable Object-backed chat persistence so conversation history survives page refreshes.
- Added cookie-based per-browser session continuity for chat history.
- Improved the chat UX with auto-scroll, enter-to-send, clearer status text, and a reset action.
- Added Wrangler Durable Object bindings and migration config.

## Current Architecture

- Frontend chat UI lives in `src/app/pages/chat.client.tsx`.
- Initial server render and session hydration live in `src/app/pages/chat-shell.tsx`.
- Chat persistence is handled by `src/app/chat/chat-session-do.ts`.
- Server-side chat orchestration and OpenRouter calls live in `src/app/chat/chat.service.ts`.
- Durable Object reads and writes are centralized in `src/app/chat/chat.storage.ts`.
- Session cookie handling lives in `src/app/chat/session.ts`.

## Current Context Strategy

- Full message history is stored in the Durable Object for display and refresh persistence.
- Only the last 3 exchanges are sent to OpenRouter for prompt context.
- No summarization, embeddings, RAG, auth, or cross-device identity yet.

## Follow-ups

- Refactor session handling to align with RedwoodSDK's documented `defineDurableSession` pattern.
- Improve the chat UX further with streaming responses.
- Decide whether to add rolling summaries, keep the short context window, or combine both.
- Add persistent user identity if chat history should survive across browsers/devices.
- Add RAG only after the core chat/session UX is stable.

## Notes

- RedwoodSDK docs indicate there are stronger built-in patterns for sessions, realtime state, and streaming than the current first-pass implementation uses.
- Wrangler emits a local log-file permission warning on this machine, but builds and generated types still succeed.
