# familiar Tool Registry Direction

## Purpose

This document defines the next-step direction for tool configuration in _familiar_.

The goal is to reduce confusion around:

- where tools are defined
- what the source of truth is
- how hosted _familiar_ should execute tools
- how developers can still use simple local executors

## One-Sentence Direction

_familiar_ should own the source of truth for tools through a hosted registry attached to the authenticated setup.

## Why This Direction Is Better

The earlier manifest-sync idea was useful for getting an MVP running, but it creates two problems for the long-term product:

1. the source of truth lives outside _familiar_
2. a hosted cloud product starts depending on local files as the canonical definition

That makes the developer story harder to explain:

- does _familiar_ read the config
- does the integration read the config
- is the manifest canonical
- or is the server state canonical

The cleaner answer is:

- the registry inside _familiar_ is canonical
- files, CLIs, and scripts are just ways to populate that registry

## Core Decision

For MVP, the authenticated API token should identify the current setup and its hosted tool registry.

That means the public happy path does not need a separate `integration_id` yet.

If the product later needs several setups under one account, explicit setup ids or integration ids can be introduced then.

That registry is the single source of truth for:

- tool name
- tool description
- argument schema
- execution target
- execution target type
- execution metadata
- confirmation or policy settings

## Setup-Level Registry

The registry should belong to the authenticated setup, not the end user.

Reason:

- the token already identifies one current end-to-end _familiar_ setup
- tools are usually part of that setup
- users may have different access rules, but the base tool definitions should not have to be duplicated per user

That means the model should eventually separate:

- tool registry
  - setup-level canonical tool definitions
- tool access
  - which users can use which tools

The MVP currently combines those ideas too tightly through user-scoped tool sync.

## What A Tool Entry Should Contain

At minimum, one registry entry should contain:

```json
{
  "name": "spreadsheet.update_row",
  "description": "Update a spreadsheet row",
  "arguments": {
    "type": "object",
    "properties": {
      "sheet": { "type": "string" },
      "row_id": { "type": "string" },
      "values": { "type": "object" }
    },
    "required": ["sheet", "row_id", "values"]
  },
  "target": {
    "type": "url",
    "url": "https://tools.example.com/spreadsheet/update"
  }
}
```

The important split is:

- `arguments`
  - tells _familiar_ what to extract from the user's message
- `target`
  - tells _familiar_ how the tool should actually run

## Execution Targets

The most important target type for the hosted product is:

- `url`

That is the cleanest default because hosted _familiar_ can call a reachable endpoint regardless of where the real code lives.

Possible future target types may include:

- `url`
- `queue`
- `workflow`
- `sdk`

The public model should stay simple even if more internal target types appear later.

## Local Scripts Still Fit

A developer may still want to use a single local script as an executor.

That does not conflict with the registry model.

The registry stays the source of truth.
The local script just becomes the execution target behind a reachable URL.

That usually means:

1. the developer runs a tiny local HTTP wrapper
2. the local script is called by that wrapper
3. a tunnel or reachable URL exposes that endpoint to _familiar_
4. the registry points the tool at that URL

Example:

- local script: `./updateSpreadsheet.ts`
- local wrapper: `http://localhost:8787/tools/execute`
- tunnel: `https://abc123.ngrok.app/tools/execute`
- registry target:

```json
{
  "type": "url",
  "url": "https://abc123.ngrok.app/tools/execute"
}
```

So the execution can be local even when the source of truth is cloud-hosted.

## Programmatic Updates

The registry should support programmatic updates.

That means developers and AI agents should be able to:

- create tools
- update tools
- remove tools
- list tools

without manually editing internal storage.

## File-Based Config Still Has A Place

Files can still be useful, but they should not be the canonical truth for the hosted product.

A file such as `familiar.json` or a future CLI config can still be used for:

- import
- export
- templating
- bootstrapping
- local development

But once the tool is registered, the source of truth should be the tool registry in _familiar_.

## API Direction

The current `tools/sync` endpoint is close to a bulk upsert operation, but the naming still reflects the older manifest-first mental model.

The better long-term shape is probably one of:

- `PUT /api/v1/tools`
- `GET /api/v1/tools`
- `PUT /api/v1/tools/:tool_name`
- `DELETE /api/v1/tools/:tool_name`

or a similarly small registry-oriented surface.

For MVP, those routes can resolve the active setup from the bearer token.

The key point is that the API should describe hosted registry ownership, not “sync from file”.

## CLI Implication

If _familiar_ gets a CLI later, the CLI should feel like a way to manage the registry, not the registry itself.

Good CLI behavior would be:

- scaffold tool definitions
- validate them
- register them with _familiar_
- update them programmatically
- support local executor development flows

That keeps the CLI useful without making local files the canonical state.

## CLI-First Onboarding Direction

The CLI should be the main developer control surface for hosted _familiar_.

The important mental model is:

- _familiar_ is a hosted conversation layer
- the local CLI exists to make changes to hosted integrations
- local files exist to help author or publish those changes

That means a developer does not install _familiar_ because they want a local runtime.
They install the CLI when they want _familiar_ to become part of their system.

The first step should be explicit:

```bash
curl -fsSL https://familiar.sh/install | sh
familiar init
```

The install step should only install the CLI.
It should not try to own account creation or project setup itself.

`familiar init` should be the first-run onboarding command.

Its job should be to:

- register or sign in the developer
- issue or retrieve an API token
- store auth locally
- write minimal local project config
- point the developer toward the next useful action

For MVP, `familiar init` should optimize for first success rather than force an explicit integration-creation concept into the first run.
The token can represent the current familiar setup by itself.

If multi-setup support is added later, more explicit setup-selection commands can be introduced then.

## Role Of Local Config

Local config should exist, but it should stay small.

Its job is to describe:

- which hosted integration this repo manages
- where local tool authoring files live
- local development settings such as a dev bridge port

Its job is not to define the canonical live tool state.

The clean split is:

- global auth state
  - who the developer is
  - what API token the CLI should use
- project config
  - which hosted setup this repo is linked to, if local linking is needed
  - where local authoring inputs live
- hosted registry
  - the actual canonical tool definitions for the authenticated setup

This keeps the product understandable:

- auth answers "who am I and which setup is active"
- project config answers "what local authoring state belongs to this setup"
- the hosted registry answers "what tools are live"

## Command Model Direction

The CLI command model should reinforce hosted ownership.

Recommended shape:

- `familiar init`
  - connect this machine and repo to hosted _familiar_
- `familiar login`
  - authenticate or refresh credentials without changing project state
- `familiar tools push`
  - publish local authoring definitions into the hosted registry
- `familiar tools list`
  - list tools from the hosted registry by default
- `familiar dev`
  - expose local executors to hosted _familiar_ during development

The important rule is:

- read and inspect commands should default to hosted truth
- local files should be treated as authoring input

So `familiar tools list` should read from the hosted registry unless the user explicitly asks for a local view.

## Migration From `tools/sync`

The current `tools/sync` endpoint is still a valid MVP bulk upsert mechanism.

But product language should move away from "sync" as the primary mental model.

The better framing is:

- local definitions are authored or generated
- `familiar tools push` publishes them
- the hosted integration registry becomes the source of truth

This avoids implying that local files and hosted state are peers.
They are not peers.
Hosted state should win.

## Recommended Mental Model

The clean mental model is:

1. _familiar_ owns the registry.
2. The registry defines what tools exist.
3. The registry tells _familiar_ what arguments to extract.
4. The registry tells _familiar_ where to send execution.
5. Developers can update the registry through an API or CLI.
6. Local executors are still possible, but they are exposed through reachable URLs.
