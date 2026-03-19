# 2026-03-19 Provider Request Tracing

## Summary

Added request-id tracing to the provider API.

## Changes

- Provider routes now accept or generate a request id.
- Responses now include:
  - `request_id` in the JSON body
  - `X-Request-Id` in the response headers
- Provider auth and provider-service audit events now record `requestId`.
- Tool execution requests now pass `context.request_id` through to the provider.
- Updated the README and provider API spec to document request-id behavior.

## Why

This makes provider integrations easier to debug because one request id can now be followed through:

- the incoming Texty API request
- Texty audit logs
- provider tool execution calls
- the final Texty response
