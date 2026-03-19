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
- a provider API sandbox
- multi-thread conversation history
- lightweight memory
- command-based thread controls
- a provider-aware conversation API
- a shared conversation core that is being extracted away from the UI

It is still an MVP slice of the larger service direction, but it now includes the first provider-facing HTTP API.

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

### Provider Setup

Texty expects provider requests to use bearer-token authentication.

For local development, configure provider tokens in `.dev.vars`:

```shell
TEXTY_PROVIDER_CONFIG='{"provider_a":{"token":"dev-token"}}'
```

This lets a provider authenticate requests with:

```shell
Authorization: Bearer dev-token
```

If a provider also needs Texty to call back into it for tool execution, include a base URL:

```shell
TEXTY_PROVIDER_CONFIG='{"provider_a":{"token":"dev-token","baseUrl":"https://provider.example"}}'
```

### Channel Use

Channels are the surfaces people talk through, such as web chat, messaging, email, or a voice-note transcript pipeline.

Every conversation request should include:

- `provider_id`
- `user_id`
- `channel.type`
- `channel.id`

The channel is used to keep recent thread continuity. If a request does not include `thread_id`, Texty first checks the most recent thread for that channel. If the new message fits that thread, it continues it. Otherwise, Texty infers a better thread or starts a new one.

Normal conversations are captured into memory by default. Private threads are the exception and are excluded from shared-memory capture.

### Provider Use

Providers are the systems that connect users and capabilities to Texty.

In the current MVP, a provider can:

- sync allowed tools for a provider/user pair
- send normalized conversation input into Texty
- create, list, rename, and delete threads
- read shared memory for a provider/user pair
- read thread memory for a specific thread

The main routes are:

- `POST /api/v1/providers/:providerId/users/:userId/tools/sync`
- `POST /api/v1/conversation/input`
- `POST /api/v1/threads`
- `GET /api/v1/providers/:providerId/users/:userId/threads`
- `PATCH /api/v1/threads/:threadId`
- `DELETE /api/v1/threads/:threadId`
- `GET /api/v1/providers/:providerId/users/:userId/memory`
- `GET /api/v1/threads/:threadId/memory?provider_id=...&user_id=...`

See `docs/provider-api-spec.md` for the request and response shapes.

### API Usage

The provider API is the main way to use Texty outside the built-in web channels.

At minimum, a provider should:

1. authenticate with a bearer token
2. optionally sync allowed tools for a provider/user pair
3. send normalized conversation input
4. manage threads if it wants explicit thread control

Example tool sync:

```shell
curl -X POST http://localhost:5173/api/v1/providers/provider_a/users/user_123/tools/sync \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": "provider_a",
    "user_id": "user_123",
    "tools": [
      {
        "tool_name": "spreadsheet.update_row",
        "description": "Update a spreadsheet row",
        "input_schema": {
          "type": "object",
          "properties": {
            "sheet": { "type": "string" },
            "row_id": { "type": "string" },
            "values": { "type": "object" }
          },
          "required": ["sheet", "row_id", "values"]
        },
        "policy": {
          "confirmation": "required"
        },
        "status": "active"
      }
    ]
  }'
```

Example conversation input:

```shell
curl -X POST http://localhost:5173/api/v1/conversation/input \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": "provider_a",
    "user_id": "user_123",
    "input": {
      "kind": "text",
      "text": "Update the client spreadsheet and mark Acme as contacted"
    },
    "channel": {
      "type": "email",
      "id": "chris@example.com"
    },
    "context": {
      "external_memories": []
    }
  }'
```

Example create thread:

```shell
curl -X POST http://localhost:5173/api/v1/threads \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": "provider_a",
    "user_id": "user_123",
    "title": "Project planning",
    "is_private": false,
    "channel": {
      "type": "web",
      "id": "browser_abc"
    }
  }'
```

Example list threads:

```shell
curl http://localhost:5173/api/v1/providers/provider_a/users/user_123/threads \
  -H "Authorization: Bearer dev-token"
```

Example read shared memory:

```shell
curl http://localhost:5173/api/v1/providers/provider_a/users/user_123/memory \
  -H "Authorization: Bearer dev-token"
```

If you want a browser UI for exercising the same routes, use `/sandbox/provider`.

### Sandbox Routes

For local testing:

- `/` is the main web channel client
- `/sandbox/messenger` is the phone-style message simulator
- `/sandbox/provider` is the provider API harness
- `/debug` shows stored memory state

## Scripts

- `npm run dev` starts the RedwoodSDK dev server.
- `npm run check` regenerates Wrangler types and runs TypeScript.
- `npm run build` creates a production build.
