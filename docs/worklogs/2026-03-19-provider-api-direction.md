# 2026-03-19 Provider API Direction

## Scope

- Document the architectural direction for Texty as a provider-agnostic conversational service.
- Clarify the identity model between Texty, providers, and end users.
- Record the intended API boundary between Texty and external execution systems.

## Completed

- Updated `README.md` to describe Texty as a provider-agnostic conversational interface rather than only a browser chat app.
- Updated `docs/project-brief.md` to reflect the planned split between Texty as the conversation layer and external providers as the execution layer.
- Added `docs/provider-api-direction.md` covering:
  - provider responsibilities
  - Texty responsibilities
  - the meaning of `provider_id`
  - the meaning of `user_id`
  - tool sync direction
  - conversation input direction
  - tool execution direction

## Notes

- Current implementation is still pre-public-API.
- The documented provider model is the intended architecture direction, not the final shipped HTTP surface yet.
