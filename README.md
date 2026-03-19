<img src="public/logo.png" width="325" align="right" />

# texty

Provider-agnostic conversational interface built with RedwoodSDK and the OpenRouter API.

## What Texty Is

Texty is intended to become a reusable conversation layer that sits in front of many different execution systems.

Its end goal is not to be “just a chat app.” Its end goal is to be the system that owns:

- conversation history
- threads
- user-facing interaction
- memory and context
- multimodal input normalization
- command handling
- conversational clarification
- tool orchestration

In the target architecture, Texty talks to external providers. Those providers expose capabilities and perform side effects. Texty decides when to answer directly, when to ask follow-up questions, and when to invoke a provider-owned tool.

In short:

- Texty is the conversation layer
- providers are the execution layer

## What Texty Is Today

Today, Texty is still an in-progress implementation of that idea.

Right now it includes:

- a web chat interface
- a sandbox messenger interface
- multi-thread conversation history
- lightweight memory
- command-based thread controls
- a shared conversation core that is being extracted away from the UI

It does not yet expose the full provider-facing HTTP API described in the architecture docs.

### Project Docs

- `docs/project-brief.md` is the stable project overview.
- `docs/architecture-foundations.md` defines the current identity, storage, and memory-policy model.
- `docs/conversation-lifecycle.md` explains how a turn moves through Texty from input to stored result.
- `docs/data-model.md` defines the core entities Texty is built around.
- `docs/provider-api-spec.md` defines the target provider-facing API contract.
- `docs/security-architecture.md` defines the current security position, target auth model, and required controls for a real service boundary.
- `docs/provider-api-direction.md` captures the planned API boundary between Texty and external tool-execution providers.
- `docs/developer-ai-guidelines.md` captures standing repo conventions and AI/developer workflow rules.
- `docs/worklogs/` stores task-specific implementation logs.

### Setup

1. Install dependencies:

```shell
npm install
```

2. Create a `.dev.vars` file for local development:

```shell
OPENROUTER_API_KEY=your_openrouter_key
OPENROUTER_MODEL=openai/gpt-4o-mini
OPENROUTER_SITE_URL=http://localhost:5173
OPENROUTER_SITE_NAME=Texty
```

3. Start the app:

```shell
npm run dev
```

For deployment, set `OPENROUTER_API_KEY` as a Wrangler secret and keep the other values in Wrangler vars if you want to override the defaults. Chat history is now stored per browser session in a Durable Object and survives page refreshes.

## Scripts

- `npm run dev` starts the RedwoodSDK dev server.
- `npm run check` regenerates Wrangler types and runs TypeScript.
- `npm run build` creates a production build.
