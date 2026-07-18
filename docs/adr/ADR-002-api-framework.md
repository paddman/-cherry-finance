# ADR-002: API Framework

**Status:** Accepted
**Date:** 2026-07-18

## Context

The public API (§8) needs REST endpoints, server-sent events for run streaming, strict request validation, and webhook handling with raw-body access for signature verification (LINE requires HMAC over the raw request body).

## Decision

- **Framework:** Fastify 5.
- **Validation:** Zod schemas from the shared `packages/schemas` package, wired through `fastify-type-provider-zod` so request/response types are inferred, validated at runtime, and reused by the mobile client.
- **SSE:** native `Reply.raw` streaming with a small helper in `packages/observability`; no socket.io.
- **Webhooks:** registered with `rawBody` enabled on those routes only, for LINE/Telegram signature verification.

## Alternatives considered

- **NestJS:** more structure than a small team needs; DI ceremony slows iteration.
- **Express:** weaker TypeScript story, slower, and validation must be bolted on.
- **Hono:** attractive, but Fastify's plugin ecosystem (rate limiting, raw body, under-pressure) fits Phase 1 ops requirements better.

## Consequences

- One schema definition serves runtime validation, OpenAPI generation (`fastify-zod-openapi`), and client types.
- Fastify's `under-pressure` plugin gives the queue-depth/backpressure signals required by §11.
