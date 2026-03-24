# 2026-03-24 Native Markdown Docs Browser

- replaced the `/docs` placeholder with a native docs browser inside the RedwoodSDK app
- added markdown source files under `src/app/docs-content`
- generated the sidebar from markdown filenames
- added static docs routes for `/docs`, `/docs/`, and `/docs/:slug`
- moved the shared docs shell into a RedwoodSDK layout so the page only renders content
- rendered markdown with a small built-in renderer instead of adding another docs runtime
