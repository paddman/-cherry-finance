# CherryFin Phase 1 Detailed Design

**Document status:** Proposed detailed design
**Parent:** [CherryFin Full System Design](CherryFin_Full_System_Design.md)
**Scope:** Everything needed to start Phase 0/1 implementation — concrete stack, schema, API contracts, error model, job contracts, compliance, and testing. Decisions are recorded individually in [docs/adr](../adr).

---

## 1. Locked technology stack

| Concern | Choice | ADR |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo, Node 22, TS strict | [ADR-001](../adr/ADR-001-monorepo-tooling.md) |
| API | Fastify 5 + Zod type provider, SSE via raw streaming | [ADR-002](../adr/ADR-002-api-framework.md) |
| Database | PostgreSQL 16, Drizzle ORM, SQL migrations, UUIDv7, NUMERIC money | [ADR-003](../adr/ADR-003-database-access.md) |
| Jobs | BullMQ on Redis, idempotent job ids, delivery outbox | [ADR-004](../adr/ADR-004-queue-and-jobs.md) |
| Auth | Google + email OTP, ES256 JWT 15m, rotating refresh, hashed link codes | [ADR-005](../adr/ADR-005-authentication.md) |
| Models | Thin internal OpenAI-compatible gateway, config routing, versioned prompts | [ADR-006](../adr/ADR-006-model-gateway.md) |
| Mobile | Expo React Native (SDK current at Phase 0 start), expo-router, TanStack Query | — |
| Object storage | MinIO (S3 API), presigned uploads, SSE-S3 encryption | — |
| Observability | pino structured logs → Loki; OpenTelemetry traces; Prometheus + Grafana | — |

---

## 2. Phase 1 database schema

Conventions: UUIDv7 `id` PK on every table; `created_at timestamptz not null default now()`; `updated_at` maintained by trigger where rows are mutable; soft state via `status` columns with `CHECK` constraints; no soft-delete except where noted (PDPA erasure is hard delete, §7).

```sql
-- Identity ------------------------------------------------------------

CREATE TABLE users (
  id            uuid PRIMARY KEY,
  display_name  text NOT NULL,
  locale        text NOT NULL DEFAULT 'th-TH',      -- th-TH | en-US
  status        text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','suspended','deleted')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_identities (
  id                uuid PRIMARY KEY,
  user_id           uuid NOT NULL REFERENCES users(id),
  provider          text NOT NULL
                    CHECK (provider IN ('google','email_otp','line','telegram')),
  provider_user_id  text NOT NULL,                  -- sub / email / LINE userId / TG id
  linked_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_user_id)
);
CREATE INDEX ON auth_identities (user_id);

CREATE TABLE auth_sessions (
  id                  uuid PRIMARY KEY,
  user_id             uuid NOT NULL REFERENCES users(id),
  refresh_token_hash  bytea NOT NULL,               -- sha256; rotated each use
  family_id           uuid NOT NULL,                -- reuse detection revokes family
  expires_at          timestamptz NOT NULL,
  revoked_at          timestamptz,
  user_agent          text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON auth_sessions (user_id) WHERE revoked_at IS NULL;

CREATE TABLE link_codes (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id),
  code_hash   bytea NOT NULL,
  provider    text NOT NULL CHECK (provider IN ('line','telegram')),
  expires_at  timestamptz NOT NULL,                 -- 5 minutes
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE connections (                           -- OAuth'd resources (Drive)
  id                    uuid PRIMARY KEY,
  user_id               uuid NOT NULL REFERENCES users(id),
  provider              text NOT NULL CHECK (provider IN ('google_drive')),
  scopes                text[] NOT NULL,
  refresh_token_cipher  bytea NOT NULL,             -- AES-256-GCM
  key_id                text NOT NULL,              -- which data key encrypted it
  status                text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','expired','revoked')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

-- Conversation --------------------------------------------------------

CREATE TABLE conversations (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id),
  title       text,                                 -- model-generated, editable
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON conversations (user_id, updated_at DESC);

CREATE TABLE messages (
  id               uuid PRIMARY KEY,
  conversation_id  uuid NOT NULL REFERENCES conversations(id),
  user_id          uuid NOT NULL REFERENCES users(id),
  direction        text NOT NULL CHECK (direction IN ('inbound','outbound')),
  channel          text NOT NULL
                   CHECK (channel IN ('mobile','line','telegram','drive','system')),
  type             text NOT NULL
                   CHECK (type IN ('text','image','document','command','delivery_request')),
  text             text,
  answer_json      jsonb,                           -- answer contract (§5.3 parent doc)
  source_event_id  text,                            -- provider message id (dedupe)
  agent_run_id     uuid,                            -- set on outbound answers
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON messages (conversation_id, created_at);
CREATE UNIQUE INDEX messages_dedupe
  ON messages (channel, source_event_id)
  WHERE source_event_id IS NOT NULL;                -- webhook redelivery guard

CREATE TABLE attachments (
  id            uuid PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id),
  message_id    uuid REFERENCES messages(id),
  object_key    text NOT NULL,                      -- s3 key, per-user prefix
  mime_type     text NOT NULL,
  byte_size     bigint NOT NULL CHECK (byte_size <= 26214400),  -- 25 MB cap
  sha256        bytea NOT NULL,
  scan_status   text NOT NULL DEFAULT 'pending'
                CHECK (scan_status IN ('pending','clean','infected','failed')),
  extract_status text NOT NULL DEFAULT 'pending'
                CHECK (extract_status IN ('pending','processing','done','failed')),
  extraction    jsonb,                              -- structured fields + confidence
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON attachments (user_id, created_at DESC);

-- Orchestration -------------------------------------------------------

CREATE TABLE agent_runs (
  id               uuid PRIMARY KEY,
  user_id          uuid NOT NULL REFERENCES users(id),
  conversation_id  uuid NOT NULL REFERENCES conversations(id),
  trigger_message_id uuid NOT NULL REFERENCES messages(id),
  intent           text,                            -- finance.question, chart.analyze, ...
  status           text NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued','planning','running_tools',
                                     'composing','done','failed','degraded')),
  answer_json      jsonb,
  error_code       text,
  trace_id         text NOT NULL,
  prompt_version   text,
  model_id         text,
  input_tokens     integer,
  output_tokens    integer,
  latency_ms       integer,
  created_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz
);
CREATE INDEX ON agent_runs (conversation_id, created_at DESC);
CREATE INDEX ON agent_runs (trace_id);

CREATE TABLE tool_calls (
  id            uuid PRIMARY KEY,
  agent_run_id  uuid NOT NULL REFERENCES agent_runs(id),
  tool_name     text NOT NULL,
  tool_version  text NOT NULL,
  input_json    jsonb NOT NULL,                     -- redacted per tool policy
  output_digest jsonb,                              -- summary + object_key of full output
  status        text NOT NULL
                CHECK (status IN ('running','ok','failed','timeout','denied')),
  latency_ms    integer,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON tool_calls (agent_run_id);

CREATE TABLE sources (
  id             uuid PRIMARY KEY,
  agent_run_id   uuid NOT NULL REFERENCES agent_runs(id),
  kind           text NOT NULL
                 CHECK (kind IN ('web','market_data','news','drive_file','upload')),
  url            text,
  file_ref       text,                              -- drive file id / attachment id
  title          text,
  retrieved_at   timestamptz NOT NULL,
  published_at   timestamptz,
  content_sha256 bytea,
  trust_class    text NOT NULL
                 CHECK (trust_class IN ('authoritative','market','news','user_private','web'))
);
CREATE INDEX ON sources (agent_run_id);

-- Delivery ------------------------------------------------------------

CREATE TABLE deliveries (
  id             uuid PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES users(id),
  agent_run_id   uuid NOT NULL REFERENCES agent_runs(id),
  channel        text NOT NULL CHECK (channel IN ('line','telegram','drive')),
  destination    jsonb NOT NULL,                    -- resolved chat id / folder id + display name
  preview_text   text NOT NULL,
  status         text NOT NULL DEFAULT 'previewed'
                 CHECK (status IN ('previewed','confirmed','sending','sent','failed','expired')),
  attempts       integer NOT NULL DEFAULT 0,
  last_error     text,
  confirmed_at   timestamptz,
  sent_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON deliveries (user_id, created_at DESC);
CREATE INDEX deliveries_outbox
  ON deliveries (confirmed_at)
  WHERE status = 'confirmed';                       -- sweeper scan

-- Preferences & audit -------------------------------------------------

CREATE TABLE user_preferences (
  user_id            uuid PRIMARY KEY REFERENCES users(id),
  language           text NOT NULL DEFAULT 'th',
  currency           text NOT NULL DEFAULT 'THB',
  markets            text[] NOT NULL DEFAULT '{}',  -- e.g. {SET,NASDAQ,CRYPTO}
  explanation_level  text NOT NULL DEFAULT 'standard'
                     CHECK (explanation_level IN ('simple','standard','expert')),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id          uuid PRIMARY KEY,
  user_id     uuid,
  actor       text NOT NULL,                        -- user | system | worker:<name>
  action      text NOT NULL,                        -- auth.login, channel.link, delivery.confirm, ...
  subject     jsonb,                                -- ids only, never content
  trace_id    text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- Append-only: enforced by revoking UPDATE/DELETE from the app role.
CREATE INDEX ON audit_events (user_id, created_at DESC);
```

Notes:

- `messages_dedupe` plus idempotent job ids (ADR-004) together satisfy the no-duplicate-answer acceptance criterion.
- Full tool outputs above ~8 KB go to object storage; `tool_calls.output_digest` stores the pointer. Keeps Postgres lean and lets PDPA erasure delete content by prefix.
- Object storage layout: `users/{userId}/attachments/{attachmentId}` and `users/{userId}/tool-outputs/{toolCallId}` — user-prefix layout makes per-user erasure a prefix delete.

---

## 3. API conventions

### 3.1 Envelope and errors

Success responses return the resource directly (no wrapper). Errors always use:

```json
{
  "error": {
    "code": "DELIVERY_DESTINATION_UNLINKED",
    "message": "Human-readable, safe to show, localized by Accept-Language",
    "traceId": "trace_...",
    "details": { }
  }
}
```

Error codes are a closed enum in `packages/schemas/errors.ts`. Initial set:

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Zod validation error; `details.issues` lists paths |
| 401 | `AUTH_REQUIRED` / `TOKEN_EXPIRED` | Missing/expired access token |
| 401 | `REFRESH_REUSED` | Rotated refresh token replayed; session family revoked |
| 403 | `FORBIDDEN` | Authenticated but not the owner of the resource |
| 404 | `NOT_FOUND` | Resource absent or not visible to this user (indistinguishable) |
| 409 | `IDEMPOTENCY_CONFLICT` | Same `Idempotency-Key`, different payload |
| 413 | `ATTACHMENT_TOO_LARGE` | Over 25 MB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | MIME not in allowlist |
| 422 | `LINK_CODE_INVALID` | Expired/used/unknown channel link code |
| 429 | `RATE_LIMITED` | Includes `details.retryAfterSeconds` |
| 502 | `MODEL_UNAVAILABLE` | Gateway degraded, request queued (`details.runId`) |
| 503 | `PROVIDER_DEGRADED` | Search/market/channel provider down; partial answers labeled |

### 3.2 Idempotency, pagination, versioning

- **Idempotency:** all POSTs that create side effects accept an `Idempotency-Key` header; keys are stored in Redis for 24h with the response snapshot.
- **Pagination:** cursor-based everywhere: `?cursor=<opaque>&limit=50`; responses include `nextCursor`. No offset pagination.
- **Versioning:** URL prefix `/v1` only; additive changes don't bump it. Mobile sends `x-app-version`; the API can respond `426 UPGRADE_REQUIRED` for retired builds.

### 3.3 Attachment upload flow

Direct-to-storage, so the API never proxies file bytes:

1. `POST /v1/attachments` with `{mimeType, byteSize, sha256}` → validates type/size, returns `{attachmentId, uploadUrl, headers}` (presigned PUT, 10-minute expiry).
2. Client PUTs the file to `uploadUrl`.
3. `POST /v1/attachments/{id}/complete` → verifies object exists and sha256 matches, then enqueues `attachment.process` (scan → OCR → extraction pipeline).
4. Client polls `GET /v1/attachments/{id}` or observes status via the run SSE stream.

MIME allowlist (Phase 1): `image/png`, `image/jpeg`, `image/webp`, `application/pdf`, `text/csv`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

### 3.4 Run streaming (SSE)

`GET /v1/runs/{id}/events` (also works mid-run; replays from `Last-Event-ID`):

```text
event: status        data: {"status":"running_tools"}
event: tool          data: {"tool":"web_search","state":"ok","summary":"5 results"}
event: answer_delta  data: {"text":"ตลาดหุ้นไทยวันนี้..."}
event: answer_final  data: { ...answer contract JSON... }
event: error         data: {"code":"MODEL_UNAVAILABLE","traceId":"..."}
```

Events are also persisted (Redis stream, 24h TTL) so LINE/Telegram flows — which can't hold an SSE connection — deliver the final answer via the worker instead.

### 3.5 Rate limits (initial)

| Scope | Limit |
|---|---|
| Auth endpoints per IP | 10/min |
| Email OTP per user | 3/10min |
| Messages (agent runs) per user | 20/min, 300/day |
| Attachment creation per user | 10/min |
| Webhook endpoints per provider | provider-volume + burst, alert on anomaly |

---

## 4. Orchestrator internals

### 4.1 Run state machine

`queued → planning → running_tools → composing → done`
Any state may transition to `failed` (terminal, with `error_code`) or `degraded` (answer produced with labeled gaps, per §10.3 of the parent doc).

### 4.2 Intent classification

Small local model with a fixed label set (`finance.question`, `market.lookup`, `web.research`, `chart.analyze`, `document.summarize`, `drive.search`, `answer.send`, `answer.save`, `smalltalk`, `out_of_scope`). Confidence below threshold → ask a clarifying question instead of guessing. `out_of_scope` (non-finance requests) gets a polite scoped refusal — keeps the product honest and the eval surface small.

### 4.3 Tool loop guardrails

- Max 6 tool calls per run, max 2 retries per tool, hard wall-clock budget 60s.
- Tool schemas are Zod objects in `packages/tool-registry`; the orchestrator rejects any model-proposed call that fails schema validation (never "fixes it up").
- Every tool call is written to `tool_calls` before execution (status `running`) so a crashed worker leaves a diagnosable trail.

### 4.4 Answer composition rules

The composer must fill the answer contract (`summary/facts/analysis/risks/unknowns/sources/dataAsOf/confidence`). Enforcement is structural: facts array entries must each carry a `sourceId` referencing a `sources` row; the API rejects persistence of an answer whose facts lack sources. This mechanically implements "ground answers in evidence".

---

## 5. Channel gateway details

- **LINE:** verify `x-line-signature` (HMAC-SHA256 over raw body) before parsing; reply within the reply-token window when possible, else push message. Message length budget 5,000 chars → long answers are truncated with a "ดูฉบับเต็มในแอป" deep link.
- **Telegram:** webhook URL contains a random secret path plus `secret_token` header check. Commands: `/start`, `/link <code>`, `/unlink`, `/help`.
- **Dedupe:** both adapters rely on the `messages_dedupe` unique index — insert-first, treat conflict as already-processed, ack 200.
- **Ack SLO:** webhook handler does signature check + insert + enqueue only; everything else is worker-side. Target well under the 2s p95.

---

## 6. Mobile app structure (Phase 1)

```text
apps/mobile/
  app/                    # expo-router routes
    (auth)/sign-in.tsx
    (main)/index.tsx      # conversation list
    (main)/chat/[id].tsx  # chat + attachments + answer cards
    (main)/connections.tsx# LINE/TG/Drive linking
    (main)/settings.tsx
  src/
    api/                  # generated client from shared Zod schemas
    components/answer/    # AnswerCard: facts/analysis/risks/sources sections
    state/                # TanStack Query + SSE hook
```

Key UI contracts:

- **AnswerCard** renders the answer contract: summary first; facts with source chips (tap → source URL/timestamp); risks and unknowns visually distinct (amber/gray); `dataAsOf` always visible on market data; confidence shown as a label, never a percentage.
- **Degraded states** are first-class UI: queued (model down), partial (search down), unverified (chart couldn't be matched to market data).
- Thai is the default locale; every string goes through i18n from the first commit (`th` and `en` catalogs).

---

## 7. Compliance: PDPA and advice boundaries

Thailand's PDPA applies from day one (user financial documents are personal data; slips/portfolios may reveal sensitive information).

- **Lawful basis & consent:** explicit consent screen at signup covering document processing and channel messaging; separate toggle for the hosted-model fallback on private content (default **off**, enforced by the model gateway privacy routing).
- **Data subject rights:** `DELETE /v1/me` performs hard erasure — user row anonymized, conversations/messages/attachments deleted, object-storage prefix `users/{userId}/` deleted, audit rows retained with `user_id` nulled (legal-basis exception, ids only, no content). Export endpoint (`GET /v1/me/export`) returns a JSON+files archive; both complete within 30 days as required, implemented as worker jobs.
- **Retention defaults:** conversations until user deletion; raw webhook payload logs 30 days; object-storage originals until message deletion; OTP/link codes purged at expiry + 24h.
- **Breach readiness:** audit trail + trace ids give the 72-hour notification investigation path; a runbook stub lives in `docs/runbooks/`.
- **Advice boundary (SEC Thailand):** CherryFin provides information and education, not licensed investment advice. Every recommendations section carries a fixed disclaimer (localized), avoids individualized "you should buy X" phrasing, and the composer's output policy check (§4.5 step 7, parent doc) enforces scenario language. Revisit licensing before Phase 3 personalization.

---

## 8. Testing and CI

| Layer | Approach |
|---|---|
| Shared packages | Vitest unit tests; `finance-math` gets property-based tests (fast-check) against known-good values |
| API | Integration tests with Testcontainers (Postgres + Redis + MinIO); every endpoint tested for authz (wrong-user 404) |
| Orchestrator | Golden-file tests: fixed tool outputs → assert answer contract shape, source linkage, and refusal behavior; model calls mocked at the gateway boundary |
| Channel adapters | Recorded webhook fixtures (real LINE/TG payload shapes), signature verification both pass and fail paths |
| Vision pipeline | Fixture corpus of chart screenshots with expected extraction JSON + confidence floors; run nightly, not per-PR |
| Mobile | Component tests for AnswerCard states; Maestro flows for sign-in → ask → answer on an Android emulator, nightly |
| E2E acceptance | Scripted checklist mapping 1:1 to the fourteen §14 acceptance criteria, run before each release |

CI (GitHub Actions): lint + typecheck + unit on every PR (Turborepo-cached); integration suite on PR to `main`; Android build (EAS) + nightly suites on `main`. Dependency audit (`pnpm audit` + Renovate) and container scan (Trivy) as required by §9.1.

---

## 9. Phase 0 exit checklist (definition of "foundation done")

1. `docker compose up` brings up Postgres, Redis, MinIO, API, worker, model gateway; `GET /healthz` green on all.
2. Migration pipeline applies the §2 schema from zero and from any prior state.
3. Sign-in (Google + email OTP) issues tokens; refresh rotation and reuse-revocation proven by tests.
4. A message posted via API creates a conversation, an `agent_run`, streams SSE status, and returns a stub answer through the model gateway hitting a real local model.
5. Attachment presigned-upload round trip works with sha256 verification.
6. `traceId` from the HTTP request is visible in logs of API, queue job, model gateway call, and DB rows for one request.
7. Audit events written for login, message, and run completion; confirmed append-only.
8. CI runs lint/typecheck/unit/integration green.
