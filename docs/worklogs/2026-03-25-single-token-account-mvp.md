# 2026-03-25 Single Token Account MVP

- simplified the hosted account model to one default API token per account for now
- removed token labels and extra token-management UI from the first-run setup flow
- kept `GET /api/v1/account` as the main token-to-account lookup surface
- motivation: the token is both the machine credential and the account lookup key in the MVP, so extra token-management concepts only add friction before rotation and multi-token support exist
