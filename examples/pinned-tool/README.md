# Pinned Tool Example

This example is a dedicated demo for the `@tool-name` flow.

It shows:

1. pinning a tool with `@notes.capture`
2. continuing to send raw text to the same pinned tool across later messages
3. explicitly exiting with `that's all for notes.capture`
4. switching directly to another pinned tool with `@ideas.capture`

## Files

- `familiar.json`
  - sync manifest for two simple verbatim capture tools
- `executor.mjs`
  - in-memory capture logic for notes and ideas
- `server.mjs`
  - local transport server and familiar sync/input proxy
- `index.html`
  - browser UI for testing the pinned tool flow

## Run It

From `examples/pinned-tool`:

```sh
TEXTY_EXECUTOR_TOKEN=dev-token \
TEXTY_BASE_URL=http://localhost:5173 \
TEXTY_INTEGRATION_ID=demo_pinned_tool \
PORT=8791 \
node server.mjs
```

Then open:

- `http://localhost:8791`

Live demo:

- [https://familiar.chrsvdmrw.dev/sandbox/pinned-tool](https://familiar.chrsvdmrw.dev/sandbox/pinned-tool)

## Try These Messages

- `@notes.capture Capture these meeting notes verbatim`
- `We need to move the launch to next Tuesday and confirm the staging checklist`
- `that's all for notes.capture`
- `@ideas.capture We should package this as a premium onboarding offer`

## Notes

- the tools accept one verbatim `message` string
- this example is meant to exercise the pinned tool rule, not LLM extraction quality
- familiar should not silently unpin the tool just because a message looks conversational
