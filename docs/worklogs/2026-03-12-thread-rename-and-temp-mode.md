# 2026-03-12 Thread Rename And Private Mode

## Scope

- Add manual thread renaming.
- Preserve manual thread titles instead of overwriting them from later message content.
- Add private threads that bypass global memory so users can check response bias without personal-memory influence.

## Completed

- Extended thread summaries with `isTemporary` and `isTitleEdited` metadata so rename and private-mode behavior survive refreshes and older sessions can be normalized safely.
- Added a `renameChatThread` server action that updates the thread title in session state and in the global memory tree.
- Updated thread-summary generation so manually renamed threads keep their custom title when new messages arrive.
- Added a private-thread creation path and UI affordance.
- Confirmed private threads continue to use their own local thread memory while reading no global memory and writing nothing back into global memory or the memory tree.
- Updated message send routing so the client posts the explicit active thread id with each message, avoiding accidental sends into a previously active thread when thread state changes rapidly.
- Fixed send responses to always persist and return the thread id that actually received the message, avoiding client drift back to an older active thread after sending.
- Made thread-summary normalization idempotent so browser-session thread metadata is not rewritten on every request after the new `isTemporary` and `isTitleEdited` fields were introduced.

## Notes

- Private threads still keep their own local thread history and thread memory.
- Private mode only bypasses browser-session global memory; it does not change model behavior outside that memory context.
