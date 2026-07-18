# ADR-001: Monorepo Tooling

**Status:** Accepted
**Date:** 2026-07-18

## Context

The system design (§12) calls for a TypeScript monorepo covering the Expo mobile app, API, worker, connectors, and shared packages. We need a package manager and task runner that handle workspace dependencies and incremental builds without heavy configuration.

## Decision

- **Package manager:** pnpm with workspaces.
- **Task runner:** Turborepo for build/test/lint pipelines with caching.
- **Language level:** TypeScript strict mode everywhere; a single shared `tsconfig.base.json`.
- **Node version:** Node 22 LTS, pinned via `.nvmrc` and `engines`.

## Consequences

- One `pnpm install` at the root installs everything; internal packages are linked automatically.
- Expo has known quirks with pnpm hoisting; the mobile app uses `node-linker=hoisted` scoped via `.npmrc` if needed.
- CI caches Turborepo outputs, keeping per-PR build times low as the repo grows.
