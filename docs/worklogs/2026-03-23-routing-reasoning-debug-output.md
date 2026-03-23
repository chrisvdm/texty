# 2026-03-23 Routing Reasoning Debug Output

## Goal

Expose the routing model's `reasoning` field in conversation responses so debugging tool-selection and clarification behavior is easier.

## Problem

When Texty chose:

- direct reply
- clarification
- follow-up
- tool call

the internal routing model already produced a `reasoning` field, but the runtime dropped it before returning the final response.

That made it harder to debug:

- why Texty chose a tool
- why it asked for clarification
- why it stayed in chat mode

## Changes

- Threaded routing `reasoning` through the decision result in:
  - `src/app/provider/provider.service.ts`
- Added `response.reasoning` to the provider conversation response payload.
- Updated the hosted demo adapter in:
  - `src/app/provider/provider.demo.routes.ts`
  so task metadata also includes the surfaced reasoning field.
- Updated the minimal executor UI in:
  - `examples/minimal-executor/index.html`
  so the latest-task card now shows reasoning inline during demo testing.

## Result

Debugging the live demo should now be easier because the response includes the model's own explanation for why it selected:

- a follow-up
- a normal reply
- or a tool path

## Verification

- `npm run types`
- `npm run build`
