# 2026-03-12 Optimistic Chat Scroll

## Scope

- Show the user's message in the chat immediately after send.
- Stop jumping to the bottom of the assistant response.
- Scroll to the start of the pending assistant reply instead.

## Completed

- Added optimistic user-message rendering in the client before the server response returns.
- Added an inline pending assistant placeholder message while the AI response is in flight.
- Changed chat scrolling to anchor to the top of the pending assistant bubble instead of the bottom of the log.
- Preserved the existing server-authoritative final state once the response completes.

## Result

- The conversation no longer appears to reorder itself while waiting for the model.
- The user can start reading the AI reply from the beginning as soon as the response area appears.

## Notes

- On failure, the optimistic messages are rolled back to keep the client consistent with persisted server state.
