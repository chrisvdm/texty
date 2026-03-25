# 2026-03-25 Current MVP Spec

- added a single reconstruction document for the current working MVP
- captured the live token-scoped public model in one place:
  - account creation
  - one default token per account
  - token-backed default setup
  - optional `integration_id`
  - optional tools on input
  - executor callback flow
  - current CLI behavior
- motivation: the codebase now has a clear long-term architecture and a simpler MVP surface, so the docs need one canonical source that describes the system as it exists today rather than forcing readers to merge blueprint docs and worklogs mentally
