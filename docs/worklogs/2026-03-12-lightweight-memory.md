# 2026-03-12 Lightweight Memory

## Scope

- Add lightweight memory to Texty without introducing a full RAG stack.
- Keep memory aligned with the existing per-thread Durable Object model and per-browser session model.
- Preserve a human-readable document shape for thread and user memory, adapted to the Cloudflare runtime.

## Completed

- Extended thread state to include a generated thread-memory document with summary, keywords, extracted facts, and markdown output.
- Extended browser session state to include a generated global user-memory document for stable profile facts.
- Added migration-safe normalization so older chat sessions and browser sessions gain the new memory fields without being reset.
- Added a memory extraction pass that runs after a completed assistant reply and updates both thread memory and global user memory.
- Added lightweight retrieval so prompt construction can include relevant thread summaries, facts, transcript snippets, and user facts.
- Kept transcript persistence in the existing chat Durable Object and stored memory as derived structured data rather than filesystem files.
- Updated the composer helper copy and environment examples for the new memory behavior.
- Updated the project brief to reflect the new lightweight-memory architecture.

## Current Architecture

- Thread transcripts and thread memory are stored together in `src/app/chat/chat-session-do.ts`.
- Chat state normalization and persistence go through `src/app/chat/chat.storage.ts`.
- Memory extraction and retrieval logic live in `src/app/chat/chat.memory.ts`.
- Chat orchestration continues in `src/app/chat/chat.service.ts`, which now enriches prompts with retrieved memory and refreshes memory after replies.
- Global user memory is stored in browser session state in `src/app/session/session.ts`.

## Result

- Texty now has memory continuity beyond the last few prompt messages.
- Each thread has a derived markdown memory document that can act as the runtime equivalent of the earlier “thread text file” idea.
- The app also accumulates lightweight global user memory for stable personal facts without adding embeddings, a vector store, or cross-device identity.

## Constraints

- Cloudflare Workers do not provide a writable application filesystem, so the “file per thread” concept is implemented as persisted markdown strings inside durable state instead of real disk files.
- Memory extraction currently depends on an additional model call, so it improves continuity at the cost of extra latency and token usage.
- Global memory remains per-browser-session because the app still has no auth or cross-device identity model.

## Follow-ups

- Decide whether to expose thread memory and user memory in the UI for inspection and deletion.
- Add better promotion rules or confirmation flows if false-memory risk becomes noticeable.
- Consider a cheaper dedicated memory model or background refresh strategy if memory extraction latency becomes too visible.
- Add embeddings only if keyword and fact retrieval prove insufficient in real usage.

## Subsequent Fixes

- Updated browser-session persistence so memory and thread metadata changes write back to the current session Durable Object instead of rotating the cookie-backed session id on each server query.
- This fixes a bug where global user memory could appear to update during a request but fail to persist cleanly across later requests.
- Fixed new-thread creation to preserve existing global user memory instead of accidentally replacing the browser-session object with one that only contained thread metadata.
- Relaxed personal-memory retrieval so prompts like "what do you know about me?" can return the strongest stored profile facts even when the query tokens do not overlap with the fact values.
- Added deterministic fallback extraction for common profile facts like name, children count, profession, and business ownership so global memory is not fully dependent on the model producing perfect JSON facts.
- Added a temporary in-app debug panel that exposes stored global facts plus current thread memory so extraction and persistence can be inspected directly during testing.
- Tightened global-memory promotion so stable thread facts can be promoted directly into user memory and obviously bad profile promotions, such as interests being stored as professions, are filtered out.
- Tightened global-memory validation further so preference-like or weakly typed values are rejected unless they look like plausible stable biographical facts for the specific key being stored.
- Expanded global-memory scope so stable preferences, interests, and family facts are allowed in user memory, while still validating them by key to avoid category mistakes such as storing an interest as a profession.
- Added a global thread-summary index so each thread contributes a summary node into user memory, creating a lightweight memory tree that can be inspected in debug UI and retrieved into prompts later.
- Moved memory inspection into a dedicated `/debug` route so persisted personal facts, memory-tree nodes, and current-thread memory can be checked without cluttering the main chat UI.
- Fixed the custom document shell to render Redwood-managed stylesheet and preload tags; without that, route CSS modules compiled but were not linked into the HTML document.
- Updated personal-memory retrieval so self-referential questions can fall back to recent thread-summary nodes from the memory tree, not just flat personal facts.
