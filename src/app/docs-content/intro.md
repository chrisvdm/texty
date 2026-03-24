# familiar

`familiar` is a hosted conversation layer for executable systems.

It sits between a person and the code that does the work. familiar keeps the thread, remembers useful context, asks follow-up questions when something is missing, chooses the right tool, and sends structured input to the executor behind that tool.

## Why it exists

Without familiar, every app or workflow that wants a conversational interface has to rebuild the same pieces:

- thread handling
- context and memory
- clarification questions
- tool selection
- channel continuity
- user-facing replies

familiar is meant to own those parts once so connected systems can focus on useful work.

## What it does

familiar currently handles:

- normalized text input
- thread continuity
- channel-aware routing
- shared and thread-local memory
- clarification when required details are missing
- tool selection
- executor handoff
- async executor callbacks

## How the product works

Every user message follows the same shape:

1. familiar receives normalized text.
2. familiar resolves the correct thread and context.
3. familiar decides whether to reply directly, ask a follow-up, or run a tool.
4. If work is needed, familiar calls the executor for the selected tool.
5. familiar stores the turn and returns the user-facing result.

## Input model

familiar only receives text.

If your product supports voice notes or speech input, normalize that upstream before sending it to familiar. Large transcription blocks are fine as long as they arrive as plain `input.text`.

## Try the examples

The easiest way to understand the product is to open the live examples:

- Minimal Executor: the smallest working integration
- Async Countdown: a delayed executor result delivered later by webhook
- Pinned Tool: explicit tool calls that keep routing later text to the same tool
