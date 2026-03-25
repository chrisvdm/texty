# familiar Auth Onboarding Direction

## Purpose

This document defines the recommended authentication roadmap for _familiar_.

The immediate product priority is:

- let a user create an account easily
- issue an API token quickly
- make that token usable from the CLI, curl, and AI-driven setup flows

## Core Decision

Passkeys should not be the MVP foundation for hosted onboarding.

They are useful for a future web dashboard, but they are not a good primary primitive for:

- CLI-first onboarding
- AI-assisted setup
- non-interactive or low-interaction automation

So the first auth slice should optimize for token issuance, not browser-native identity ceremony.

## Recommended Roadmap

### MVP

The first hosted onboarding slice should be:

1. create account
2. issue first API token immediately
3. show that token once
4. let the user call _familiar_ with it

This can be one simple operation.

For now:

- no email verification is required
- no passkey is required
- no separate setup id is required in the happy path
- the token identifies the current familiar setup

That makes the product much easier for:

- curl users
- CLI users
- AI agents

### Next Step

Once account creation and token usage work, add:

- authenticated `GET /api/v1/account`
- optional additional token issuance if the product later needs it
- token revocation
- last-used timestamps
- a CLI flow that can create an account and store the token locally

This is the right time to harden the control plane for repeated use.

### Later Web Dashboard

Once the account and token workflow is stable, add a hosted dashboard.

That dashboard can support:

- account details
- token management
- tool registry management
- executor configuration

This is the stage where passkeys become more attractive.

Passkeys fit well for:

- web login
- returning human users
- phishing-resistant dashboard access

They do not replace the need for API tokens.

### Later Passkey Support

Passkeys should be treated as a human web-auth layer, not the machine-auth layer.

That means:

- humans can sign in to the dashboard with a passkey
- the dashboard can then create, list, or revoke API tokens
- CLI and AI still use API tokens for actual setup and API calls

## RedwoodSDK Passkey Addon

RedwoodSDK has an experimental passkey addon.

That is worth revisiting later for the hosted dashboard path.

But it should not block the MVP account-and-token flow.

## Practical Product Rule

The first question _familiar_ should answer is not:

- how do I log into a dashboard

It is:

- how do I get a working API token quickly

That is the correct first onboarding bar for both humans and AI.
