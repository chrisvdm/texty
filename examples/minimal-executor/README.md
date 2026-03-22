# Minimal Executor

This is the smallest useful example of an executor that can connect to Texty.

This file is meant to answer the practical question:

- "What do I actually build if I want Texty to call my code?"

It does one thing:

- exposes `POST /tools/execute`
- accepts one tool, `notes.echo`
- returns either a clarification or a completed result

## What To Do With This Folder

You have two easy options:

1. Read it to understand the shape of a Texty executor.
2. Copy it into your own project and change it to do real work.

If you are just getting started, the easiest path is:

1. copy `server.mjs` into your own project
2. run it locally
3. connect Texty to it
4. replace the fake `notes.echo` tool with your real tool

So yes, the folder is there to be copied, run, and adapted.

## Files

- `server.mjs`
  - tiny local HTTP server using only Node built-ins
- `index.html`
  - the small local browser UI shown at `http://localhost:8787`
- `texty.json`
  - example manifest shape for this executor

## Run It

Start the example server:

From the project root:

```shell
TEXTY_EXECUTOR_TOKEN=dev-token node examples/minimal-executor/server.mjs
```

If you are already inside the `examples/minimal-executor` folder:

```shell
TEXTY_EXECUTOR_TOKEN=dev-token node server.mjs
```

What this does:

- starts a local server
- serves a local test page at `GET /`
- listens for `POST /tools/execute`
- checks the bearer token
- returns a simple JSON result

It listens on:

```text
http://localhost:8787
```

If you open that address in your browser, you will now see a small local test UI.

That page lets you:

- type a note
- see the exact JSON payload sent to the executor
- see the JSON result body that comes back

This is useful if you want to understand the executor shape before wiring it into Texty.

## Local Texty Config

Point local Texty at this executor:

```shell
TEXTY_EXECUTOR_CONFIG='{"provider_a":{"token":"dev-token","baseUrl":"http://localhost:8787"}}'
```

What this means:

- `provider_a`
  - the executor id Texty will use for this connection
- `token`
  - the shared token Texty and your executor both know
- `baseUrl`
  - where Texty should send tool-execution requests

## Sync The Tool

```shell
curl -X POST http://localhost:5173/api/v1/providers/provider_a/users/user_123/tools/sync \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": "provider_a",
    "user_id": "user_123",
    "tools": [
      {
        "tool_name": "notes.echo",
        "description": "Return a note back to the user",
        "input_schema": {
          "type": "object",
          "properties": {
            "note": { "type": "string" }
          },
          "required": ["note"]
        },
        "status": "active"
      }
    ]
  }'
```

## Send Input

```shell
curl -X POST http://localhost:5173/api/v1/input \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": "provider_a",
    "user_id": "user_123",
    "input": {
      "kind": "text",
      "text": "Save this note: buy dog food"
    },
    "channel": {
      "type": "web",
      "id": "local-browser"
    }
  }'
```

Texty should decide to call `notes.echo`, then the executor will reply with a completed result.

## Browser Test Page

Once the server is running, open:

```text
http://localhost:8787
```

That page is only for local testing. It is there to make the example easier to understand.

It does not replace Texty. It simply shows:

- the note you typed
- the request payload sent to `POST /tools/execute`
- the executor response body

## What Happens Next

After you send that request:

1. Texty receives the user message.
2. Texty decides that work should be handed off.
3. Texty sends a `POST /tools/execute` request to your local executor.
4. Your executor returns JSON.
5. Texty turns that result into the assistant reply.

That is the basic integration loop.

## How To Adapt It

Once you understand the example, the normal next step is:

- keep the same route shape
- keep the same token check
- replace `notes.echo` with your own tool
- replace the fake response with real work

Examples:

- update a spreadsheet
- send an email
- create a record
- run a script
