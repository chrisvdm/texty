# 2026-03-23 Direct Reply And Confirmation Fixes

## Goal

Fix two Texty-side conversation issues in the hosted demo flow:

- direct replies should be human-facing, not internal routing reasoning
- pending confirmation replies like `yes` should stay on the active thread and execute the pending tool

## Problems

### 1. Internal reasoning leaked into the visible reply

When the routing model decided not to use a tool, Texty was using the model's `reasoning` field as the direct assistant reply.

That produced replies like:

- `The statement about retiring does not clearly indicate a request...`

which is debugging language, not a user-facing response.

### 2. `yes` could miss the pending todo confirmation

Short replies such as `yes` were still going through the channel-thread reuse heuristic.

Because `yes` has almost no token overlap with the prior thread, Texty could start a new thread instead of reusing the one that still had a pending tool confirmation.

That made the confirmation appear to be ignored even though the earlier turn had asked:

- `Do you want to add that to your todo list?`

### 3. Minor typo handling was too brittle for task phrasing

The todo heuristic only matched exact forms such as:

- `I need to ...`

That made small typo variants behave worse than expected in the demo.

## Changes

- Updated `src/app/provider/provider.service.ts`
  - added a direct-reply helper so Texty now generates a normal human-facing response instead of surfacing routing reasoning
  - added a name-introduction heuristic so messages like `my name is sam` can reply with:
    - `Hi Sam, pleased to meet you.`
  - changed channel-thread reuse so any thread with a pending tool confirmation is always reused for the next turn
  - broadened the todo heuristic slightly so typo variants such as `i neef to ...` still map into the expected task-intent path
- Added `src/app/chat/shared.test.ts`
  - regression coverage for pending confirmation state with array-shaped arguments

## Texty Vs Executor

- `Texty`
  - owns these fixes
  - direct replies
  - pending confirmation continuity
  - todo-intent interpretation
- `Executor`
  - unchanged in this work

## Result

The intended behavior is now:

- direct conversation gets a normal assistant reply
- name introductions get a friendly greeting
- `yes` after a pending todo confirmation stays on the same thread and executes the tool instead of falling into a new empty thread

## Verification

- `node --experimental-strip-types --experimental-specifier-resolution=node --test src/app/chat/shared.test.ts src/app/provider/provider.logic.test.ts`
- `npm run types`
- `npm run build`
