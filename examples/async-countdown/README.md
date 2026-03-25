# Async Countdown Example

This example is a dedicated async webhook demo.

It shows one narrow flow:

1. the user sends a chat message into familiar
2. familiar routes it to `countdown.start`
3. the executor immediately returns `accepted`
4. a 10 second timer runs inside the executor
5. when the timer finishes, the executor calls `POST /api/v1/webhooks/executor`
6. familiar appends the result into the thread and delivers it through `POST /channels/messages`

## Files

- `familiar.json`
  - sync manifest for the countdown tool
- `executor.mjs`
  - countdown state and tool execution logic
- `server.mjs`
  - local transport server, familiar sync/input proxy, webhook callback sender, and channel delivery receiver
- `index.html`
  - local UI for testing the async flow

## Run It

From `examples/async-countdown`:

```sh
TEXTY_EXECUTOR_TOKEN=dev-token \
TEXTY_BASE_URL=http://localhost:5173 \
TEXTY_INTEGRATION_ID=demo_countdown \
PORT=8790 \
node server.mjs
```

Then open:

- `http://localhost:8790`

Live demo:

- [https://familiar.chrsvdmrw.dev/sandbox/async-countdown](https://familiar.chrsvdmrw.dev/sandbox/async-countdown)

This example is about async executor callbacks, not pinned tool behavior.

Use a message like:

- `Start a 10 second countdown for me`
- `Start a countdown and say Deploy window is open when it ends`

## Notes

- the timer duration is fixed at 10 seconds in this example
- the initial executor response is always async: `state = accepted`
- the callback reuses `execution_id` as `Idempotency-Key`
- this example is separate from `examples/minimal-executor`, which still demonstrates the todo flow
