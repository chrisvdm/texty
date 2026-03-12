# Texty Project Brief

## Purpose

Texty is a focused AI chat app built with RedwoodSDK and the OpenRouter API.

The current goal is to make the core chat experience solid while adding only lightweight memory primitives that support better continuity without introducing a full RAG stack.

## Current Product Shape

- Single-purpose chat interface with minimal branding.
- OpenRouter-backed assistant responses.
- Per-browser chat continuity across page refreshes.
- Multi-thread chat within a browser session.
- Durable Object-backed storage for chat history.
- RedwoodSDK-native browser session handling.

## Current User Experience

- Users can send prompts in a lightweight chat UI.
- Users can create and switch between multiple threads in the same browser session.
- User messages render optimistically before the assistant finishes.
- A pending assistant placeholder appears while the response is in flight.
- The viewport scrolls to the start of the pending assistant reply.
- Chat history survives refreshes within the same browser session.
- The interface uses a small `texty` wordmark and avoids landing-page style chrome.

## Current Technical Approach

- RedwoodSDK app and routing power the web application.
- OpenRouter is used for model completions.
- Chat transcript persistence lives in a dedicated Durable Object.
- Browser session state uses RedwoodSDK's documented durable session pattern.
- The UI stores full thread history for display, while the model uses a mix of recent messages plus lightweight retrieved memory.

## Context Strategy

- Full conversation history is persisted for the user interface.
- Only the last 3 exchanges are sent to the model for prompt context.
- Each thread also maintains a generated memory document with a summary, keywords, and extracted facts.
- Browser session state maintains a lightweight global user-memory document for stable profile facts.
- Retrieval is keyword and fact based; there is no embeddings layer or vector database.

## What This Project Is Not Yet

- Not a full retrieval-augmented chat system with embeddings or a vector store.
- Not a multi-user product with auth.
- Not a cross-device memory system.
- Not a long-running agent workflow platform.

## Working Decisions So Far

- Prioritize core UX before adding major platform features.
- Prefer RedwoodSDK-native patterns when the framework already provides them.
- Track notable changes with task-scoped worklogs in `docs/worklogs/`.
- Keep the product visually restrained and tool-like.
- Add complexity like embeddings, cross-device sync, or heavier retrieval infrastructure only when the lightweight memory layer becomes limiting.

## Near-Term Priorities

- Continue refining the core chat UX.
- Consider streaming assistant responses.
- Revisit prompt-context strategy once lightweight memory quality is understood in longer conversations.
- Introduce stronger identity/user modeling only when there is a clear product need.

## Source of Truth

This brief is the stable high-level description of the project.

Task-level implementation history and decision logs belong in `docs/worklogs/`.
