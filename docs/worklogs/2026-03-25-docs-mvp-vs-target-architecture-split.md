# 2026-03-25 Docs MVP vs Target Architecture Split

- rewrote the core blueprint docs so they explicitly separate the current MVP public model from the long-term product architecture
- kept the long-term target clear:
  - one account can have many integrations
  - one integration can have many end users
  - `integration_id` is the setup boundary
- clarified the current MVP public model:
  - one account gets one default setup
  - one default token identifies the account and current setup
  - `integration_id` is optional in the happy path for now
  - tools can be pushed separately or supplied on input during development
- updated the API and quickstart docs so a rebuild effort would not mistake future architecture documents for current runtime behavior
