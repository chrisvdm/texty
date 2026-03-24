# Concepts

The core model is intentionally small so humans and AI systems can understand it quickly.

## Account

An account is the owner of the familiar setup.

It is the billing, workspace, or team boundary.

## Integration

An integration is one configured familiar connection inside an account.

An integration:

- has credentials
- syncs tools
- identifies end users
- defines where executor calls are sent
- defines where channel messages are delivered

## User

`user_id` is the end-user identity inside one integration.

It stays stable across threads and channels for that user.

## Channel

A channel is where the user is speaking from, such as web chat, email, or WhatsApp.

Channels should have:

- `channel.type`
- `channel.id`

`channel.name` can be included as optional descriptive metadata.

## Thread

A thread is one conversation record.

Threads give familiar a place to keep:

- the visible conversation
- thread-local memory
- the current pinned tool, when one exists

## Executor

An executor is the code or service that familiar triggers after a tool has been selected.

familiar owns the conversation. The executor owns the side effects.

## Pinned tool

A user can make an explicit tool call with `@[tool-name]`.

That pins the tool for the current thread so later text is passed verbatim to the same executor path.

The pinned tool ends when:

- the user says `that's all for [tool-name]`
- the user invokes another `@[tool-name]`

familiar does not silently exit the pinned tool state just because a message looks conversational.
