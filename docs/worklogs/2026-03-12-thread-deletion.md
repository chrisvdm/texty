# 2026-03-12 Thread Deletion

## Scope

- Add thread deletion to the chat UI.
- Remove deleted thread transcripts from Durable Object storage.
- Prune global memory facts and memory-tree entries that were sourced from the deleted thread.

## Completed

- Added a `deleteChatThread` server action that removes the thread from browser-session metadata, deletes its chat Durable Object state, and switches the user to another thread or a newly created replacement thread.
- Added `deleteChatSession` storage support so thread removal revokes the persisted chat session instead of only hiding it from the UI.
- Added `pruneGlobalMemoryByThreadId` so structured global memory drops facts and thread-summary nodes whose `sourceThreadId` matches the deleted thread.
- Added a delete control to each thread row in the sidebar with a confirmation prompt that warns memory sourced from that thread will also be removed.

## Notes

- Current pruning follows the app's existing single-source fact model, so any fact attributed to the deleted thread is removed outright.
- For production/commercial use, this should evolve into multi-thread provenance so facts survive deletion when they are still supported by other threads.
