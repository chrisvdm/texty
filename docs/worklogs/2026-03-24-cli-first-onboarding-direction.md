# 2026-03-24 CLI-First Onboarding Direction

- updated the blueprint docs to frame the CLI as the control plane for hosted _familiar_ integrations
- clarified that developers install the CLI when they want _familiar_ to become part of their system, not because _familiar_ should run locally
- documented that `familiar init` should cover first-run signup or sign-in, API token issuance, and first integration creation or linking
- clarified that local config should stay minimal and should identify the hosted integration plus local authoring inputs, not act as canonical runtime state
- updated the AI integration direction away from the old manifest-first `tools/sync` happy path and toward hosted registry publication
