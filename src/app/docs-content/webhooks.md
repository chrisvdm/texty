# Webhooks

When an executor cannot finish fast enough in the first response, it can return an accepted or in-progress state and send the final result later.

## Callback route

Use:

```text
POST /api/v1/webhooks/executor
```

## What the callback does

The callback tells familiar:

- which integration the result belongs to
- which user and thread should receive it
- what final user-facing message should be appended

familiar then adds that result to the thread and delivers it through the normal channel path.
