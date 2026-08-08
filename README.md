# CherryFin

**AI Accounting & Full CFO Operating System**

> **Status: pre-alpha Accounting MVP.** CherryFin now runs an end-to-end, human-reviewed accounting intake flow. It is not a statutory ledger, tax-filing system, payment system, or trading platform.

CherryFin is a Thailand-first, accounting-first CFO platform for founders and growing businesses. The current slice receives private accounting documents, verifies the uploaded object, scans it, extracts structured facts through local/private model routes or deterministic parsers, proposes balanced debit/credit lines, preserves evidence, requires human review, and builds a deterministic CFO brief from approved drafts.

## Implemented

- Node.js 22, pnpm, Turborepo, strict TypeScript monorepo
- Fastify API with Zod validation, safe errors, trace IDs, rate limiting, OpenAPI, liveness, and readiness
- Users, organizations, companies, memberships, RBAC, consent records, and append-only audit events
- Private presigned uploads to S3-compatible storage with declared size, MIME type, SHA-256 metadata, and completion verification
- Async BullMQ processing through a PostgreSQL transactional outbox
- Object download size and SHA-256 verification before parsing
- Development EICAR guard and production-required ClamAV INSTREAM mode
- PDF text extraction through Poppler with first-page vision fallback
- PNG, JPEG, WEBP, PDF, TXT, CSV, and deterministic JSON extraction paths
- Private-only model routing for financial documents; hosted fallback is forbidden for private requests
- Structured accounting documents, field evidence, validation findings, and deterministic balanced draft proposals
- Human confirm, correct, reject, and append-only review history
- Safe reprocessing for failed/unreviewed attachments; reviewed drafts cannot be silently replaced
- Deterministic CFO brief covering revenue, expenses, operating result, cash movement, working-capital movement, VAT movement, risks, unknowns, and actions
- Browser demo at `/app`
- PostgreSQL 16, Redis AOF, MinIO, API, worker, model gateway, and migrations through Docker Compose
- CI for lint, typecheck, tests, build, Compose validation, and repeatable migrations

## Deliberate boundaries

CherryFin does not silently post to a statutory ledger, file VAT/WHT returns, release payments, sign documents, certify accounting treatment, or move money. Drafts remain proposals until an authorized person confirms or corrects them. CFO briefs use reviewed data only and label unavailable balances, ageing, budgets, filing status, and reconciliation as unknown.

The local `development` malware check detects the EICAR test string only. Production configuration rejects that mode and requires ClamAV. No one gets to rename a toy guard “enterprise antivirus” and hope procurement does not notice.

## Repository layout

```text
apps/
  api/                    Fastify API and browser demo
  worker/                 outbox dispatcher and attachment processor
services/
  model-gateway/          OpenAI-compatible privacy-aware model router
packages/
  accounting-core/        extraction validation and deterministic draft rules
  schemas/                Zod contracts and Drizzle database schema
  finance-math/           deterministic decimal calculations
  observability/          trace, timeout, and log-redaction helpers
infra/
  migrations/             idempotent PostgreSQL migrations
docs/
  architecture/           full product and Phase 1 designs
  implementation/         runnable implementation notes
  runbooks/               operations procedures
examples/
  synthetic-invoice.json  safe deterministic demo document
```

## Quick start

Requirements: Docker Engine with Compose v2. A local OpenAI-compatible text model should listen on port `8000`; a vision model should listen on port `8001`. A synthetic JSON upload works without either model.

```bash
git clone https://github.com/paddman/-cherry-finance.git cherry-finance
cd cherry-finance
cp .env.example .env
# Change passwords and INTERNAL_API_KEY before exposing any port outside localhost.
docker compose up --build
```

Open:

| Surface | Address |
|---|---|
| Accounting demo | `http://localhost:3000/app` |
| OpenAPI | `http://localhost:3000/docs` |
| API liveness | `http://localhost:3000/healthz` |
| API readiness | `http://localhost:3000/readyz` |
| Model gateway | `http://localhost:3100` |
| MinIO API | `http://localhost:9000` |
| MinIO Console | `http://localhost:9001` |

Compose uses `AUTH_MODE=development` and a seeded local principal. This mode must never be internet-facing. Production startup requires `AUTH_MODE=jwt`, an ES256 public key, an internal service key, and worker `SCAN_MODE=clamav`.

### Run with ClamAV locally

```bash
SCAN_MODE=clamav docker compose --profile security up --build
```

## Accounting MVP flow

```text
Create organization and company
  → declare file metadata and SHA-256
  → receive private presigned PUT URL
  → upload directly to MinIO/S3
  → API verifies object metadata
  → transactional outbox enqueues processing
  → worker downloads and re-hashes object
  → malware scan
  → deterministic parser / local private model extraction
  → arithmetic and missing-field validation
  → balanced debit/credit draft proposal
  → human confirm, correct, or reject
  → deterministic CFO brief from reviewed drafts
```

Use `examples/synthetic-invoice.json` for the first test. It contains no real customer data.

## Main API surface

```text
POST /v1/organizations
POST /v1/organizations/{organizationId}/companies

POST /v1/organizations/{organizationId}/companies/{companyId}/attachments
GET  /v1/organizations/{organizationId}/companies/{companyId}/attachments
GET  /v1/attachments/{attachmentId}
POST /v1/attachments/{attachmentId}/complete
POST /v1/attachments/{attachmentId}/reprocess
POST /v1/attachments/{attachmentId}/manual-extraction

GET  /v1/organizations/{organizationId}/companies/{companyId}/accounting/drafts
GET  /v1/accounting/drafts/{draftId}
POST /v1/accounting/drafts/{draftId}/confirm
POST /v1/accounting/drafts/{draftId}/correct
POST /v1/accounting/drafts/{draftId}/reject

POST /v1/organizations/{organizationId}/companies/{companyId}/cfo/briefs
GET  /v1/cfo/briefs/{briefId}
```

## Supported inputs

| Input | Processing |
|---|---|
| JSON | Validated directly against the extraction contract; ideal for deterministic tests |
| TXT / CSV | Local text model with deterministic heuristic fallback |
| PDF | `pdftotext`; first page rendered to PNG when the PDF has no useful text |
| PNG / JPEG / WEBP | Local vision model through the private route |

Maximum attachment size is 25 MiB. Inline vision input is capped separately because base64 is not free, despite humanity's long effort to treat memory as an abstract concept.

## Model privacy contract

Every accounting extraction request uses:

```text
x-cherryfin-task: synthesis | vision
x-cherryfin-privacy: private
```

Private requests never use hosted fallback. Current facts and public research can use a separately governed public route, but uploaded financial documents remain local/private.

## Local application development

```bash
corepack enable
corepack prepare pnpm@11.20.0 --activate
pnpm install --no-frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Still missing before a real pilot

- Google Sign-In, email OTP issuance, refresh rotation, session/device management
- Android/iOS application
- Batch uploads, multi-page vision, richer Thai document templates, and extraction evaluation corpus
- Chart of accounts configuration and per-company account mapping
- Bank imports/reconciliation and opening balances
- AR/AP ageing, budgets, forecasts, close workflow, and statutory ledger
- Tax rule engine by effective date and accountant filing integrations
- Production KMS, secret rotation, HA database, backup automation, restore evidence, penetration test, and compliance sign-off
- LINE, Telegram, Google Drive, notifications, and scheduled reporting

## Documentation

- [Accounting MVP implementation](docs/implementation/ACCOUNTING_MVP.md)
- [Foundation implementation](docs/implementation/FOUNDATION.md)
- [Full system design](docs/architecture/CherryFin_Full_System_Design.md)
- [Phase 1 detailed design](docs/architecture/CherryFin_Phase1_Detailed_Design.md)
- [Architecture decisions](docs/adr)
- [Operations runbooks](docs/runbooks)
