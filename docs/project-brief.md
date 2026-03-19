# Texty Project Brief

## Purpose

Texty is a focused conversational AI interface built with RedwoodSDK and the OpenRouter API.

The end goal is for Texty to be a reusable conversation layer that owns memory, threads, and interaction flow, while delegating business-side effects to external tool-execution providers.

In the target architecture:

- Texty owns conversation
- providers own execution

Texty should be usable by multiple provider systems, not just one product.

Examples:

- an automation backend
- an app-building backend

This means Texty is being designed as a general-purpose conversational front end for tools and workflows, not as a single-purpose browser chat app.

## Target Product

In its intended final shape, Texty should:

- receive user input from web chat, messaging apps, or other interfaces
- normalize text, voice-note transcripts, and other input into one conversation flow
- maintain thread history and memory according to explicit memory policy
- understand user intent
- ask clarification questions when needed
- decide when to answer directly and when to invoke provider-owned tools
- return the final user-facing response

Texty should not own provider-specific business logic.
It should orchestrate conversation around that logic.

## Current Product Shape

- Web chat interface with minimal branding.
- OpenRouter-backed assistant responses.
- Per-browser chat continuity across page refreshes.
- Multi-thread chat within a browser session.
- Durable Object-backed storage for chat history.
- RedwoodSDK-native browser session handling.
- Early sandbox transport simulation for a WhatsApp-style interface.
- Shared conversation core for command-driven interaction.

## Current User Experience

- Users can send prompts in a lightweight chat UI.
- Users can create and switch between multiple threads in the same browser session.
- Users can also manage threads through text commands such as `:thread`, `:threads`, and `:switch`.
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
- Shared conversation modules now handle command parsing, input parsing, and runtime context assembly before the UI layer.

## Current Implementation Status

Today’s codebase is a working foundation for the target architecture, not the final architecture itself.

At the moment:

- global memory is still browser-session scoped in important places
- the provider-facing HTTP API is still documented direction rather than shipped runtime contract
- the web UI is still one of the main entry surfaces
- the security model is still browser-session based rather than provider-authenticated multi-tenant service auth

So the repo should currently be understood as:

- a functioning conversation prototype
- with strong architectural direction
- that is actively being extracted into a provider-agnostic service model

## Context Strategy

- Full conversation history is persisted for the user interface.
- Only the last 3 exchanges are sent to the model for prompt context.
- Each thread also maintains a generated memory document with a summary, keywords, and extracted facts.
- Browser session state maintains a lightweight global user-memory document for stable profile facts.
- Retrieval is keyword and fact based; there is no embeddings layer or vector database.
- Current date, time, and timezone are included explicitly in model context.
- The intended long-term rule is: normal conversations are captured into memory by default, while private threads are excluded from shared memory capture.
- Providers may then choose how much of that captured memory they actually use.

## Planned Provider Model

Texty is intended to become provider-agnostic.

- Texty should own:
  - conversation history
  - thread management
  - user memory
  - multimodal input normalization
  - command handling
  - conversational clarification
  - tool selection/orchestration
- External providers should own:
  - tool definitions
  - business workflows
  - side effects
  - execution logs
  - domain-specific rules

The expected integration model is:

1. A provider syncs a user-specific allowed toolset into Texty.
2. Texty reasons over those allowed tools during a conversation.
3. Texty invokes the provider when a tool should run.
4. The provider executes deterministically and returns a structured result.
5. Texty turns that result into the user-facing reply and stores the conversation.

Examples of providers:

- an automation backend
- an app-building backend

Identity, storage, and memory-policy details for that provider model are defined in `docs/architecture-foundations.md`.

## What This Project Is Not Yet

- Not yet a production external API service with public auth and tenant boundaries.
- Not yet a full retrieval-augmented chat system with embeddings or a vector store.
- Not yet a multi-user hosted product with durable cross-device identity.
- Not yet a completed provider runtime with tool sync and execution endpoints.

## Working Decisions So Far

- Prioritize core UX before adding major platform features.
- Prefer RedwoodSDK-native patterns when the framework already provides them.
- Track notable changes with task-scoped worklogs in `docs/worklogs/`.
- Keep the product visually restrained and tool-like.
- Add complexity like embeddings, cross-device sync, or heavier retrieval infrastructure only when the lightweight memory layer becomes limiting.

## Near-Term Priorities

- Introduce a real provider API boundary so external systems can sync tools and receive tool execution requests.
- Continue extracting orchestration logic out of the web UI and into the shared conversation core.
- Define stable identity semantics for `provider`, `user`, and `memory scope`.
- Consider streaming assistant responses.
- Revisit prompt-context strategy once lightweight memory quality is understood in longer conversations.
- For commercial use, upgrade memory provenance so stored facts can track multiple source threads and be removed automatically when their backing threads are deleted.

## Source of Truth

This brief is the stable high-level description of the project.

Supporting architecture references:

- `docs/architecture-foundations.md`
- `docs/security-architecture.md`
- `docs/conversation-lifecycle.md`
- `docs/data-model.md`
- `docs/provider-api-direction.md`
- `docs/provider-api-spec.md`

Security and auth requirements are defined in `docs/security-architecture.md`.

Task-level implementation history and decision logs belong in `docs/worklogs/`.
