# Webhooks

When an executor cannot finish fast enough in the first response, it can return an accepted or in-progress state and send the final result later.

## Callback route

Use:

```text
POST /api/v1/webhooks/executor
```

## When to use it

Use this route when:

- the executor started the work successfully
- the user should get immediate feedback such as `Action started.`
- the final result will only be available later

## What the callback does

The callback tells familiar:

- which integration the result belongs to
- which user and thread should receive it
- what final user-facing message should be appended

familiar then adds that result to the thread and delivers it through the normal channel path.

## Minimum payload

The callback payload can stay small:

```json
{
  "integration_id": "integration_a",
  "user_id": "user_123",
  "thread_id": "thread_abc",
  "result": {
    "execution_id": "exec_123",
    "state": "completed",
    "content": "Your import finished successfully."
  }
}
```

## Idempotency

If the executor retries the callback, send `Idempotency-Key`.

If no idempotency header is sent, familiar can fall back to `result.execution_id` when present.

## Sync and async together

The important model is:

- familiar triggers executor work
- the executor decides whether the work is blocking or async
- familiar turns either response into the user-facing conversation

familiar is not pretending to be a background job system. It is a conversation layer that can receive delayed executor results.
