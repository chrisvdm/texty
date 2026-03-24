# AI Integration Direction

## Purpose

This document defines how familiar should think about developer experience for connected systems.

The important shift is this:

familiar is not only for human developers.

familiar should also be easy for AI-built systems to connect to.

That means the integration surface should be simple enough that:

- a human can understand it quickly
- an AI can generate against it reliably
- a lightweight script can use it without a large framework

## New Framing

familiar is a conversation layer for executable systems.

A connected system can be:

- a product
- a workflow runner
- a small script
- an AI-generated service

familiar should make those systems usable through conversation without requiring each one to rebuild:

- threads
- memory
- clarification flow
- channel continuity
- user-facing reply logic

## Core DX Principle

Simpler is better.

This matters more for AI integrations than for normal developer tooling.

If the API surface is too large, too flexible, or too inconsistent:

- humans slow down
- AI gets confused
- integrations become brittle

## DX Principles

### 1. One obvious happy path

A new integration should have one clear first success path:

1. configure a connection
2. define tools in `familiar.json`
3. sync that manifest into familiar
4. send conversation input
5. let familiar trigger the correct target with schema-valid arguments

Everything else should be optional or advanced.

### 2. Small, stable JSON contracts

familiar should prefer:

- flat request shapes
- flat response shapes
- explicit field names
- predictable error structures

It should avoid:

- deeply nested optional structures
- multiple ways to express the same thing
- inconsistent naming

### 3. Consistent naming

Use the same naming style everywhere.

For example:

- `integration_id`
- `user_id`
- `thread_id`
- `tool_name`

Do not mix:

- `thread_id` in one place
- `threadId` in another
- plain `id` in a third

### 4. Minimal required concepts

The basic integration should not require understanding the whole familiar architecture.

A connected system should be able to succeed with only:

- connection identity
- user identity
- channel identity
- conversation input
- tool target

### 5. Clear, actionable errors

When something is wrong, familiar should say exactly what the caller needs to fix.

Good:

- missing bearer token
- connection mismatch
- invalid request payload
- thread not found

Bad:

- generic internal errors
- vague validation failures

### 6. Deterministic behavior beats hidden magic

familiar can infer thread continuity and choose tools, but the rules need to be documented clearly.

AI integrations work better when the system has:

- explicit defaults
- explicit fallback behavior
- explicit error states

### 7. Low setup burden

A new integration should not need:

- a large SDK
- complicated registration flows
- multiple auth models
- many setup files

Bearer token auth plus a small JSON contract is a good first step.

### 8. Copy-pasteable examples

Every major integration path should have:

- one working request example
- one working response example
- one minimal mental model

This is important for both humans and AI.

## Current API Simplification Direction

These are the simplification goals that should guide future API changes.

### Keep one primary endpoint

`POST /api/v1/input` should remain the center of the integration story.

That is the main thing a connected system should send repeatedly.

### Keep tool sync simple

Tool sync should stay easy to understand:

- here is the `familiar.json` manifest for this user
- here are the tools this user can use
- here is the schema familiar must satisfy before executing them

It should not become a complicated patch or partial-sync protocol unless there is a strong reason.

### Keep schema ownership in familiar

If a tool declares an input schema, familiar should treat that schema as the execution contract.

That means:

- familiar chooses the tool
- familiar extracts the arguments
- familiar asks follow-up questions for missing required fields
- the executor receives already-structured arguments

The executor should not need to reinterpret the user's natural-language request.

### Treat thread CRUD as advanced

Thread create, rename, and delete should exist, but they should not be the first thing a new integration needs to learn.

The basic path should be:

- send conversation input
- let familiar resolve or infer the thread

Explicit thread management is useful, but it is not the core of the first integration experience.

### Keep execution responses small

Execution state should stay limited and explicit.

Current useful states are:

- `completed`
- `needs_clarification`
- `accepted`
- `in_progress`
- `failed`

That is enough for MVP.

### Avoid requiring memory decisions in the happy path

Memory policy matters, but basic integrations should not need to configure it up front just to send messages and run tools.

The happy path should work with:

- default memory capture for normal conversations
- private threads as an explicit exception

### Prefer one auth model

For now:

- bearer token auth

That is enough.

Adding multiple auth choices too early would make AI integrations harder, not easier.

## Future Simplification Questions

These are good questions to revisit before larger API changes:

### 1. Is `provider` the simplest word?

It may be correct, but it may not be the easiest word for all integrators.

Possible alternatives later:

- executor
- connection
- runtime

For now, keep `provider` unless a better replacement becomes clearly simpler.

### 2. Should there be a single manifest format?

It may help to eventually support one compact registration payload that says:

- who the connection is
- what tools it exposes
- where each tool should be triggered

That is now the preferred direction for examples through `familiar.json`.

### 3. Should a one-tool integration be even simpler?

Some connected systems may only expose one capability.

It may be worth adding a smaller path for that case later.

### 4. Should familiar expose a self-describing schema endpoint?

AI systems often work better when they can inspect one canonical schema source.

This is a possible later improvement, not an MVP requirement.

## Practical Rule

When making API decisions, prefer the option that:

- removes concepts
- reduces optionality
- keeps names consistent
- makes examples shorter
- makes failures easier to recover from

If two designs are equally powerful, the simpler one is better for familiar.
