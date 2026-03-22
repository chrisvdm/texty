# 2026-03-22 AI Integration Direction

## Summary

Documented a clearer framing for Texty as a conversation layer for executable systems, including systems built by AI.

## Why

The project direction has shifted in an important way:

- Texty is not just for human developers
- Texty should be easy for AI-built systems to connect to as well

That means the integration surface should optimize for simplicity, consistency, and low setup burden.

## Changes

- Added `docs/ai-integration-direction.md`
- Documented:
  - the new framing
  - AI-friendly DX principles
  - API simplification goals
  - future simplification questions
- Linked that document from:
  - `README.md`
  - `docs/project-brief.md`

## Outcome

Texty now has an explicit written direction for future API and DX decisions:

- simpler is better
- one obvious happy path is better than many optional paths
- consistent naming matters
- AI integrations should be able to succeed without needing to understand the whole architecture first
