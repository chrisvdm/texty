# Concepts

The core model is intentionally small.

## Account

An account is the owner of the familiar setup. It is the customer, workspace, or team boundary.

## Integration

An integration is one configured connection inside an account.

An integration:

- has credentials
- syncs tools
- identifies end users
- defines where executor calls are sent

## User

`user_id` is the end-user identity inside one integration.

## Channel

A channel is where the user is speaking from, such as web chat, email, or WhatsApp.

Channels should have:

- `channel.type`
- `channel.id`

## Executor

An executor is the code or service that familiar triggers after a tool has been selected.
