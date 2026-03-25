# 2026-03-25 CLI Bootstrap

- added the first `familiar` CLI entrypoint as a local package bin
- implemented `familiar init`, `familiar account create`, and `familiar account show`
- kept the CLI intentionally small and token-first so it matches the current hosted onboarding model
- stored the issued token under the user's local Codex home area instead of introducing project-local config too early
