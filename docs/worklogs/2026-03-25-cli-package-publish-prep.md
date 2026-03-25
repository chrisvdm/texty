# 2026-03-25 CLI Package Publish Prep

## Goal

Prepare the `familiar` CLI for real npm publication so CLI-first onboarding can become true rather than aspirational.

## What Changed

- updated `package.json` to be publishable
- removed the `private` publish block
- added package metadata for:
  - homepage
  - repository
  - bugs
  - keywords
  - Node engine
- added a `files` whitelist so npm publication only ships:
  - `src/cli/familiar.mjs`
  - `README.md`
  - `LICENSE`
- added an MIT `LICENSE`
- updated `README.md` to show the intended npm CLI install commands

## Why

The product direction is CLI-first for both humans and AI agents.

The repo already had a working CLI entrypoint, but it did not yet have a real package publication shape.

Without publish-ready package metadata, docs could not honestly tell users to install the CLI through normal npm tooling.

## Expected Install Paths

- `npx @familiar/cli@latest init`
- `npm install -g @familiar/cli`
- `familiar init`

## Remaining Work

- create or control the `@familiar` npm scope
- publish the package
- switch public docs from "planned CLI command" to "live CLI command" after publish

## Follow-up

Hosted docs and the setup page were updated afterward so the public first-run path now points at:

- `npx @familiar/cli@latest init`
