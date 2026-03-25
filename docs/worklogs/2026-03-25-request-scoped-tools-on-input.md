## Decision

`POST /api/v1/input` now accepts optional `tools` definitions.

When tools are present, `_familiar_` stores them onto the current token-backed setup for that user and immediately uses them for the conversation request.

## Motivation

The admin/setup side is still in flux, and requiring a separate tools setup step adds friction during early development.

Allowing tools on input keeps the MVP simpler:

- no explicit integration management in the happy path
- no extra setup call required while developing
- the bearer token still selects the backing setup implicitly

This is a bootstrap convenience, not the long-term registry mental model.
