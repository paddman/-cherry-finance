# CherryFin

**AI Accounting & Full CFO Operating System**

> **Status: pre-alpha, runnable foundation.** The repository now contains executable services and database migrations. It is not yet a complete bookkeeping, tax-filing, payment, or trading system.

CherryFin is a Thailand-first, accounting-first CFO platform for founders and growing businesses. It turns invoices, receipts, statements, withholding-tax certificates, spreadsheets, and accounting exports into traceable review drafts, then grows toward the complete CFO lifecycle: AP/AR, monthly close, tax, treasury, FP&A, management reporting, internal controls, company/capital operations, and board/investor reporting.

## What is implemented

- pnpm/Turborepo TypeScript monorepo on Node.js 22
- Fastify API with Zod validation, safe error envelopes, trace IDs, rate limiting, OpenAPI docs, liveness, and dependency readiness
- Tenant foundation: users, organizations, companies, memberships, roles, permissions, consent records, and append-only audit events
- Organization and company APIs with membership-based authorization
- Durable inbox, idempotency, and transactional outbox tables
- BullMQ outbox dispatcher with deterministic job IDs and retry state
- Thin OpenAI-compatible model gateway with task/privacy routing
- Hosted model fallback only for `public` synthesis; private requests remain local-only
- Accounting intake schema: attachments, extracted documents, balanced drafts, normalized draft lines, evidence links, and append-only review events
- Deterministic money/runway/gross-margin utilities using decimal arithmetic
- PostgreSQL, Redis AOF, MinIO, API, worker, migrations, and model gateway through Docker Compose
- GitHub Actions for lint, typecheck, tests, build, Compose validation, and repeatable migration smoke tests
- Initial incident, backup/restore, and model-degradation runbooks

## Still not implemented

- Google Sign-In and email OTP issuance flows. The API can verify ES256 JWTs, while Compose uses an explicitly development-only principal header.
- Mobile application
- Presigned attachment upload API and malware/OCR pipeline
- Accounting extraction and review endpoints
- CFO brief builder
- LINE, Telegram, and Google Drive connectors
- Tax filing, statutory ledger posting, payments, or trading
- Production KMS, HA database, full backup automation, penetration testing, and compliance sign-off

Humans retain approval over every accounting review, filing, payment, and corporate decision. AI output remains a reviewable draft and cannot move money or bind the company.

## Repository layout

```text
apps/
  api/                    Fastify public API
  worker/                 durable outbox to BullMQ dispatcher
services/
  model-gateway/          OpenAI-compatible privacy-aware model router
packages/
  schemas/                Zod contracts and Drizzle database schema
  finance-math/           deterministic decimal calculations
  observability/          trace IDs, timeout and log-redaction helpers
infra/
  migrations/             idempotent PostgreSQL migrations
docs/
  architecture/           full product and Phase 1 designs
  adr/                    accepted architecture decisions
  implementation/         current implementation notes
  runbooks/               operations procedures
```

## Quick start with Docker Compose

Requirements: Docker Engine with Compose v2.

```bash
git clone https://github.com/paddman/-cherry-finance.git cherry-finance
cd cherry-finance
cp .env.example .env
# Change passwords and INTERNAL_API_KEY before exposing anything outside localhost.
docker compose up --build
```

Services:

| Service | Address |
|---|---|
| API | `http://localhost:3000` |
| OpenAPI UI | `http://localhost:3000/docs` |
| API liveness | `http://localhost:3000/healthz` |
| API readiness | `http://localhost:3000/readyz` |
| Model gateway | `http://localhost:3100` |
| MinIO API | `http://localhost:9000` |
| MinIO Console | `http://localhost:9001` |
| PostgreSQL | `localhost:5432` |
| Redis | `localhost:6379` |

Compose defaults to `AUTH_MODE=development`. That mode accepts `x-user-id` and falls back to the seeded development user. It must not be used on an internet-facing deployment.

Create an organization:

```bash
curl -sS -X POST http://localhost:3000/v1/organizations \
  -H 'content-type: application/json' \
  -H 'x-user-id: 018f0000-0000-7000-8000-000000000001' \
  -d '{"name":"Cherry Company","slug":"cherry-company"}'
```

Then use the returned organization ID to create a company:

```bash
curl -sS -X POST \
  http://localhost:3000/v1/organizations/ORGANIZATION_ID/companies \
  -H 'content-type: application/json' \
  -H 'x-user-id: 018f0000-0000-7000-8000-000000000001' \
  -d '{
    "legalName":"บริษัท เชอร์รี่ จำกัด",
    "displayName":"Cherry Co.",
    "taxId":"0105559999999",
    "currency":"THB",
    "timezone":"Asia/Bangkok"
  }'
```

## Local development without Docker for application code

Node.js 22.13+ and pnpm 11 are required. PostgreSQL, Redis, and S3-compatible storage still need to be available.

```bash
corepack enable
corepack prepare pnpm@11.20.0 --activate
pnpm install --no-frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

A lockfile should be committed after the first dependency install from a connected development environment. Until then, CI intentionally uses `--no-frozen-lockfile`; dependency review remains mandatory before release.

## Authentication modes

### Development

```env
AUTH_MODE=development
DEV_USER_ID=018f0000-0000-7000-8000-000000000001
```

This mode is only for local scaffolding.

### JWT

```env
AUTH_MODE=jwt
JWT_PUBLIC_KEY_PEM=-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----
JWT_ISSUER=cherryfin
JWT_AUDIENCE=cherryfin-api
```

The API verifies ES256 access tokens. Token issuance, refresh rotation, Google Sign-In, and email OTP are the next identity work package.

## Model gateway headers

`POST /v1/chat/completions` accepts the OpenAI-compatible request body plus:

```text
x-cherryfin-task: chat | classify | synthesis | vision
x-cherryfin-privacy: public | private
x-internal-api-key: configured internal service key
```

Private requests never use the hosted synthesis fallback.

## Delivery phases

```text
Phase 0: Runnable foundation                         ← current
Phase 1A: Accounting upload, extraction, and review
Phase 1B: Evidence-linked CFO brief
Phase 1C: Android, LINE, Telegram, and Drive
Phase 2+: Ledger, close, tax, treasury, FP&A, and guarded later modules
```

See:

- [CherryFin Full System Design](docs/architecture/CherryFin_Full_System_Design.md)
- [CherryFin Phase 1 Detailed Design](docs/architecture/CherryFin_Phase1_Detailed_Design.md)
- [Foundation implementation notes](docs/implementation/FOUNDATION.md)
- [Architecture Decision Records](docs/adr)
- [Operations runbooks](docs/runbooks)
