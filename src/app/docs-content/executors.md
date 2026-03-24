# Executors

An executor is the runtime that performs the requested work.

## What familiar owns

By the time familiar calls an executor, it has already handled:

- thread continuity
- memory lookup
- clarification
- tool selection
- argument extraction

## What familiar sends

By the time the executor receives a request:

- the tool has already been selected
- arguments should already be structured
- missing fields should already have been clarified

That means the executor does not need to repeat routing or conversational extraction.

## Blocking or async

Executors decide whether a request is:

- blocking, where the final result comes back immediately
- async, where the executor accepts the work first and sends the final result later

## Executor endpoints

familiar currently calls two integration-owned endpoints:

```text
POST {integration.baseUrl}/tools/execute
POST {integration.baseUrl}/channels/messages
```

`/tools/execute` is where familiar asks the executor to do real work.

`/channels/messages` is where familiar asks the integration to deliver a user-facing message back to the active channel.

## Channel delivery

Channel delivery should target one concrete channel, not broadcast to all channels.

The normal rule is simple:

- send back to the linked channel for the active thread
- identify that channel by `channel.type` and `channel.id`

## Example executor responses

A blocking response can return the final result immediately.

An async response should return a short acknowledgment such as `Action started.` and then call familiar back later with the final result.
