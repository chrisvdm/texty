# Concepts

The core model is intentionally small so humans and AI systems can understand it quickly.

## Executor

An executor is the code or service that *familiar* triggers after a tool has been selected.

In practice, that usually means:

- a script
- a small service
- a workflow runner
- a built tool behind an API

Examples:

- a script that updates a spreadsheet row
- a service that starts an import
- a workflow that sends an onboarding email
- a tool that creates or updates a record in another system

*familiar* owns the conversation. The executor owns the side effects.

## Integration

An integration is one configured end-to-end *familiar* setup inside an account.

It is the full configuration for a specific app, bot, instance, or deployment.

An integration:

- has credentials
- defines which channels belong to it
- syncs tools
- identifies end users
- defines where executor calls are sent
- defines where channel messages are delivered

## Thread

A thread is one context-aware conversation record.

You can think of a thread as the place where one topic, task, or theme keeps its continuity.

That matters because *familiar* uses threads to keep the right context together instead of mixing unrelated conversations.

Threads give *familiar* a place to keep:

- the visible conversation
- thread-local memory
- the current pinned tool, when one exists

Examples:

- one thread for planning a trip
- one thread for working on a spreadsheet task
- one thread for debugging an integration issue

*familiar* also supports command-based thread management in the product today.

Examples include:

- `:threads`
- `:thread`
- `:switch`
- `:rename`
- `:delete`

## Pinned tool

A user can make an explicit tool call with `@tool-name`.

That pins the tool for the current thread so later text is passed verbatim to the same executor path.

The pinned tool ends when:

- the user says `that's all for [tool-name]`
- the user invokes another `@tool-name`

*familiar* does not silently exit the pinned tool state just because a message looks conversational.

> [!NOTE]
> **Terminology**
>
> `account` is the owner of the *familiar* setup. It is the billing, workspace, or team boundary.
>
> `user_id` is the end-user identity inside one integration and stays stable across threads and channels for that user.
>
> `channel` is where the user is speaking from, such as web chat, email, or WhatsApp. It should include `channel.type` and `channel.id`, and may also include `channel.name`.
