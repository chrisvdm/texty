# 2026-03-24 RedwoodSDK-Centric Landing And Session Alignment

- audited the root route against RedwoodSDK routing and document guidance
- moved `/` onto a dedicated static document with `rscPayload: false`
- moved landing-page styling into an app stylesheet linked from the static document via `?url`
- stopped the global browser-session bootstrap from running for `/`
- kept the interactive app routes on the existing application document and session flow
