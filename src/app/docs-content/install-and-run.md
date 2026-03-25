# Install And Run

This page explains two different ways to use _familiar_ today.

The important distinction is:

- if you want to use _familiar_, the hosted deployment is the simpler path
- if you want to work on this repo itself, run the local development environment

This page is intentionally about the code and product as they exist today, not the future hosted CLI flow.

## Option 1: Use The Hosted Deployment

If you want to integrate with _familiar_, this is probably the simplest path.

You do not need to clone this repo just to understand the product shape.

Today, the hosted path is the product path:

1. create an account
2. get an API token
3. point your app, bot, or webhook at the deployed _familiar_ service
4. optionally sync tools or send tools on input while developing
5. send normalized text into _familiar_
6. let _familiar_ call your executor or receive async callbacks

The best current references for that path are:

- [Quickstart](/docs/quickstart)
- [API Reference](/docs/api-reference)
- [Integrations](/docs/integrations)
- [Executors](/docs/executors)
- [Webhooks](/docs/webhooks)

If your goal is:

- understanding where `_familiar_` fits in your architecture
- wiring a webhook or app into `_familiar_`
- seeing the current request and response shapes

start with those docs instead of running the repo locally.

### Current CLI bootstrap

There is now a minimal local CLI entrypoint in this repo.

From the project root, you can run:

```sh
node src/cli/familiar.mjs --help
```

Or, if the package bin has been linked in your environment:

```sh
familiar --help
```

Current commands:

- `familiar init`
  - creates an account
  - issues the first API token
  - stores that token locally
- `familiar account create`
  - creates an account and prints the token without storing it
- `familiar account show`
  - shows the account for the current token

You can point the CLI at a different host with:

```sh
familiar init --host https://your-familiar-host
```

## Option 2: Run This Repo Locally

Use the local path if you want to:

- contribute to `_familiar_`
- change the product code
- test the built-in sandbox flows
- inspect the current runtime behavior in development

Today, the local developer path is:

1. install dependencies
2. configure local environment variables
3. run the _familiar_ worker
4. optionally run one of the local example executors
5. use the built-in docs, sandbox pages, or API routes

## What the current repo is

Right now this repo is a RedwoodSDK app running a local _familiar_ worker.

That worker includes:

- the web UI
- the `/docs` pages
- the current integration API routes
- the conversation and tool orchestration runtime

It is not yet the future hosted product with CLI onboarding, account signup, and hosted integration management.
It is the contributor and implementation environment for the current product.

## Prerequisites

You need:

- Node.js
- npm
- an OpenRouter API key

You do not need a separate Cloudflare deployment just to run the local dev server.

If you only want to use the deployed product, you can stop here and go back to the hosted docs path above.

## Step 1: Install dependencies

From the project root:

```sh
npm install
```

## Step 2: Create `.dev.vars`

Copy the example file:

```sh
cp .dev.vars.example .dev.vars
```

Then edit `.dev.vars` and set at least:

```text
OPENROUTER_API_KEY=your_openrouter_key
OPENROUTER_MODEL=openai/gpt-4o-mini
OPENROUTER_MEMORY_MODEL=openai/gpt-4o-mini
OPENROUTER_SITE_URL=http://localhost:5173
OPENROUTER_SITE_NAME=familiar
```

Notes:

- `OPENROUTER_API_KEY` is required for the current local conversation flow
- the example file still uses localhost defaults for the local worker
- the current checked-in example file says `Texty` for `OPENROUTER_SITE_NAME`; for local use, `familiar` is the clearer value

## Step 3: Run the app

Start the local worker:

```sh
npm run dev
```

The main local app runs at:

```text
http://localhost:5173
```

Useful pages:

- `/`
  - landing page with links to the examples
- `/docs/`
  - native docs inside the app
- `/sandbox/demo-executor`
  - smallest visible executor example
- `/sandbox/async-countdown`
  - async executor callback example
- `/sandbox/pinned-tool`
  - explicit pinned tool behavior example

## Step 4: Choose how you want to try it

You have two practical ways to explore the current system.

### Option A: Use the built-in sandbox pages

This is the fastest way to see the product behavior.

Open one of:

- `http://localhost:5173/sandbox/demo-executor`
- `http://localhost:5173/sandbox/async-countdown`
- `http://localhost:5173/sandbox/pinned-tool`

These routes exercise the current integration flows without you needing to wire up your own external service first.

### Option B: Run one of the local example executors

This is the better option if you want to see the external executor boundary.

Examples live in:

- `examples/minimal-executor`
- `examples/async-countdown`
- `examples/pinned-tool`

For the smallest useful executor, run:

```sh
TEXTY_EXECUTOR_TOKEN=dev-token node examples/minimal-executor/server.mjs
```

That example listens on:

```text
http://localhost:8787
```

Then point the local _familiar_ worker at it by adding this to `.dev.vars`:

```text
TEXTY_EXECUTOR_CONFIG='{"demo_executor":{"token":"dev-token","baseUrl":"http://localhost:8787"}}'
```

After that, restart `npm run dev` if it was already running.

## Step 5: Use the current API shape

The current codebase is still oriented around local integration config plus the existing API routes.

The current happy path is:

1. configure a local executor token and base URL
2. create an account and get an API token for the hosted-style API path
3. sync tools for a specific user or send tools on input while developing
4. send normalized text to `/api/v1/input`
5. let _familiar_ decide whether to reply, clarify, or call the executor
6. if needed, let the executor call back through `/api/v1/webhooks/executor`

The quickest current references are:

- [Quickstart](/docs/quickstart)
- [API Reference](/docs/api-reference)
- [Executors](/docs/executors)
- [Webhooks](/docs/webhooks)

Those same docs are also the better starting point if you are integrating with the hosted deployment rather than this local repo.

## Current mental model

If you are trying to understand where `_familiar_` fits today in code, use this model:

- your app or webhook receives channel-specific input
- your app sends normalized text into _familiar_
- _familiar_ owns thread, memory, and tool orchestration
- your executor owns the real side effects

In the current codebase, some setup still happens through local env vars and sync-style API calls.
That is the current implementation path, even though the long-term product direction is toward a hosted integration registry and CLI-first onboarding.

## Recommended first run

If you just want one concrete way to get oriented:

1. run `npm install`
2. create `.dev.vars` with your OpenRouter key
3. run `npm run dev`
4. open `http://localhost:5173/docs/`
5. open `http://localhost:5173/sandbox/demo-executor`
6. if you want the external boundary too, run `TEXTY_EXECUTOR_TOKEN=dev-token node examples/minimal-executor/server.mjs`

That is the shortest path for understanding how the repo works today.

## Which path should you choose

Choose the hosted path if:

- you want to integrate an app, bot, or webhook with _familiar_
- you want the simplest current way to use the product
- you are designing toward the future hosted control-plane model

Choose the local repo path if:

- you are contributing code to `_familiar_`
- you need to debug or change the current implementation
- you want to run the sandbox and example flows yourself
