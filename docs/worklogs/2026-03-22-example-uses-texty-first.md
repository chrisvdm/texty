## 2026-03-22

Adjusted the minimal executor example so the public demo path now uses Texty
itself instead of presenting a direct tool call as part of the main experience.

Changes:

- removed the direct tool call button from the example UI
- rewrote the example page copy to describe the flow as:
  - user message
  - Texty sync
  - Texty input
  - Texty deciding whether to reply or call the tool
- updated the example README so it no longer presents the direct tool path as
  part of the marketed example
- switched the example defaults to explicit demo identity values:
  - `demo_executor`
  - `demo_user`
- simplified the exposed demo response so it shows observed sync/input results
  instead of a large nested request wrapper
- aligned the example manifest and README curl/config snippets to the same demo
  identity values
- clarified that Texty creates the provider-user context lazily on first sync
  or input, so the demo identity does not need a separate seed step

Kept:

- the raw `/tools/execute` route in the example server, because Texty still
  needs a real tool target to call
- the local server route structure that already drives the example through
  Texty

Reason:

The example is part of the product story. It should demonstrate Texty using the
actual Texty flow, not bypass the product and make the tool target look like
the main thing.

The only fake part left is identity bootstrap, so people can test the demo
without first creating a real account.

Follow-up change:

- moved the deployable demo path into the main Texty worker instead of creating
  a separate demo worker
- added a built-in `demo_executor` config in the worker auth layer so the demo
  can authenticate and execute like a normal connected executor
- added worker routes for:
  - `/sandbox/demo-executor`
  - `/sandbox/demo-executor/playground/texty`
  - `/sandbox/demo-executor/tools/execute`
- moved built-in demo tool execution onto an internal execution path to avoid
  the worker HTTP-fetching itself during the public demo flow
- hardened the demo note tool so `null` and `undefined` note values now become
  a clarification instead of being saved or surfaced back as literal text
- simplified the public demo endpoint response so it now returns only:
  - `status_code`
  - `response`
  - `task`
  instead of exposing sync and input wrappers
