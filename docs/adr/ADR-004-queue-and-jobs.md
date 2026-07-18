# ADR-004: Queue and Background Jobs

**Status:** Accepted
**Date:** 2026-07-18

## Context

Webhooks must be acknowledged in under 2 seconds (§11) while model/tool work takes up to 30 seconds. The design (§8.3) defines worker contracts: `inbox.normalize`, `attachment.process`, `agent.run`, `tool.execute`, `delivery.send`, `delivery.retry`, `audit.append`.

## Decision

- **Queue:** BullMQ on Redis, one named queue per workload class: `inbox`, `attachments`, `agent`, `delivery`, `audit`.
- **Job ids are idempotency keys.** Each job id is derived from its natural key (e.g. `inbox:{channel}:{sourceEventId}`, `delivery:{deliveryId}`), so provider redeliveries and retries can never enqueue duplicates — this directly implements acceptance criterion §14.9.
- **Retry policy defaults:** 5 attempts, exponential backoff starting at 2s, capped at 5 minutes. `delivery` jobs cap at 3 attempts then park in a failed state surfaced to the user (§10.3).
- **Every job payload carries `traceId` and `userId`**; workers bind them to the logger before any other work.
- **Outbox pattern for deliveries:** a `deliveries` row is written in the same transaction as the confirming API call; the enqueue happens after commit, and a sweeper re-enqueues any confirmed-but-unqueued rows older than 1 minute.

## Alternatives considered

- **pg-boss:** keeps everything in Postgres, but Redis is already required for caching/rate limits, and BullMQ's per-queue concurrency and rate limiting map directly onto per-model backpressure needs (§10.2).
- **Temporal:** right shape for Phase 4+ strategy workflows, far too much operational surface for Phase 1.

## Consequences

- Redis must run with AOF persistence; losing Redis loses in-flight jobs, and the outbox sweeper is the recovery mechanism for the one queue where loss is user-visible (delivery).
- Queue depth and oldest-job age per queue are exported to metrics as required by §11.
