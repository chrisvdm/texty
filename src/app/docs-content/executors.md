# Executors

An executor is the runtime that performs the requested work.

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
