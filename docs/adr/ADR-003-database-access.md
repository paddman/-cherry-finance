# ADR-003: Database Access and Migrations

**Status:** Accepted
**Date:** 2026-07-18

## Context

PostgreSQL is the source of truth (§16). The schema is finance-adjacent: it needs explicit constraints, enum-like states, immutable audit rows, and predictable SQL. Several tables (`audit_events`, `tool_calls`) will be queried by ops tooling as much as by the app.

## Decision

- **Query layer:** Drizzle ORM.
- **Migrations:** drizzle-kit generated SQL migrations, committed to `infra/migrations`, applied by a dedicated migration step in deploy (never at app boot).
- **IDs:** UUIDv7 primary keys generated in the application (`uuidv7` package), giving time-ordered ids without a central sequence.
- **Money and quantities:** `NUMERIC` columns; never `FLOAT`. In TypeScript, decimal values pass through as strings and are computed with `decimal.js` inside `packages/finance-math` only.
- **Timestamps:** `timestamptz` everywhere; the application layer works in UTC and formats per user locale at render time.

## Alternatives considered

- **Prisma:** heavier runtime, less transparent SQL, and its migration DSL hides Postgres features (partial indexes, `CHECK` constraints) that this schema uses.
- **Raw SQL + kysely:** viable, but Drizzle's schema-as-code doubles as documentation and stays close to SQL.

## Consequences

- Schema definitions live in `packages/schemas/db` and are imported by API and worker; there is exactly one description of every table.
- Deterministic finance math (§3.5) is enforced structurally: only `finance-math` may do arithmetic on money strings.
