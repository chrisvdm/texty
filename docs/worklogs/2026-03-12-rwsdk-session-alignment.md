# 2026-03-12 RedwoodSDK Session Alignment

## Scope

- Replace the custom cookie/session handling with RedwoodSDK's documented session pattern.
- Keep the existing chat history Durable Object, but move browser identity onto RedwoodSDK-backed sessions.

## Completed

- Reviewed RedwoodSDK docs for authentication/session management and aligned the implementation to that model.
- Replaced the custom cookie parsing code with `defineDurableSession` from `rwsdk/auth`.
- Added a dedicated `BrowserSessionDurableObject` for signed browser sessions.
- Updated app middleware to load session data into `ctx.session`.
- Preserved the existing chat history Durable Object, keyed by `session.chatId`.
- Regenerated Wrangler types for the new Durable Object binding.

## Architecture

- `src/app/session/session.ts` defines the RedwoodSDK durable session store.
- `src/app/session/browser-session-do.ts` stores the signed browser session payload.
- `src/worker.tsx` now loads the session in middleware and exposes it on `ctx.session`.
- `src/app/chat/chat.service.ts` now reads `requestInfo.ctx.session.chatId` instead of parsing cookies directly.
- `src/app/chat/chat-session-do.ts` still stores the actual chat transcript.

## Result

- The browser cookie now follows RedwoodSDK's documented session flow.
- Chat history still persists across refreshes.
- The session boundary is cleaner and easier to extend toward auth later.

## Follow-ups

- Consider using RedwoodSDK streaming patterns for assistant responses next.
- Decide whether to keep the short prompt window or add rolling summaries once longer threads matter.
- If auth is added later, map the authenticated user to the chat session strategy cleanly instead of coupling the chat DO directly to anonymous browser state.
