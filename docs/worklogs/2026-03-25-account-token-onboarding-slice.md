# 2026-03-25 Account Token Onboarding Slice

- documented the auth roadmap with token-first onboarding as the MVP and passkeys deferred to the later dashboard path
- added a hosted account registry Durable Object for accounts and issued API tokens
- added `POST /api/v1/accounts` and `GET /api/v1/account`
- added a minimal `/setup` page that creates an account and shows the first token once
- updated provider auth so issued account tokens can authenticate the current token-scoped setup
