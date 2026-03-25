# 2026-03-25 Hosted Onboarding Removes Nonexistent CLI Installer

## Goal

Remove the fake hosted CLI install step from the public onboarding docs so new users only see setup paths that exist today.

## What Changed

- updated `src/app/docs-content/install-and-run.md`
- removed the `https://familiar.sh/install` instruction
- made the hosted onboarding start with:
  - the browser setup page
  - the account-creation API
- kept the CLI path separate until a real npm distribution path existed

## Why

The main hosted doc was telling new users to use an installer route that does not exist.

That made the primary MVP onboarding path incorrect even though the actual hosted account bootstrap endpoints already work.

## Result

The public onboarding story now matches reality:

- create an account in the browser or through the API
- use the CLI only if it is already installed
- keep contributor setup separate in the local development docs
