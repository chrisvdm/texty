# 2026-03-23 Workers AI Model Split

## Goal

Document a better default Workers AI setup for Texty and add runtime support for using different models for:

- first-pass routing
- schema-shaped argument extraction

## Problem

Texty previously had one decision-model setting for both tasks.

That is workable, but it is not the best fit for the product:

- routing benefits from a fast, cheap model
- extraction benefits from a stronger model that is better at structured argument generation

Using one model for both either:

- spends too much on easy turns
- or underpowers the extraction step

## Recommendation

Recommended Workers AI split:

- routing: `@cf/meta/llama-3.1-8b-instruct-fast`
- extraction: `@cf/qwen/qwen3-30b-a3b-fp8`

Reasoning:

- routing is mostly a lightweight classification problem
- extraction and follow-up argument updates are higher-value structured tasks
- Texty's current routing/extraction quality problems are more likely to improve from a stronger extraction pass than from a more expensive routing pass

## Runtime Changes

Updated `src/app/provider/provider.service.ts` so Texty can now choose models separately for:

- `routing`
- `extraction`

New environment variables:

- `CLOUDFLARE_ROUTING_MODEL`
- `CLOUDFLARE_EXTRACTION_MODEL`
- `OPENROUTER_ROUTING_MODEL`
- `OPENROUTER_EXTRACTION_MODEL`

Legacy fallback variables still work:

- `CLOUDFLARE_DECISION_MODEL`
- `OPENROUTER_DECISION_MODEL`

## Result

Texty can now use a fast model for deciding:

- chat vs tool
- which tool

and a stronger model for:

- extracting arguments to match `input_schema`
- updating partial arguments after a follow-up turn

without changing the main orchestration flow.

## Verification

- `npm run types`
- `npm run build`
