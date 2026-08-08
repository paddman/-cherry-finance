# CherryFin Accounting MVP

## Scope

This implementation supplies one runnable vertical slice:

```text
private upload → verification → scan → extraction → validation → draft → review → CFO brief
```

It is a management and review workflow. It does not post a statutory journal, file tax, approve payments, or replace a licensed professional.

## Trust boundaries

1. The browser declares filename, MIME type, byte size, and SHA-256.
2. The API creates an attachment row and returns a short-lived presigned PUT URL.
3. The API verifies object length, content type, ETag when supplied, and signed SHA-256 metadata before enqueueing.
4. The worker downloads the object and independently recomputes SHA-256 before scanning or parsing it.
5. Production worker configuration requires ClamAV. Development mode contains only an EICAR guard and is labeled accordingly.
6. Uploaded accounting content goes through the model gateway with `privacy=private`; hosted fallback is unavailable.
7. Numeric validation and draft arithmetic are deterministic code, not LLM arithmetic.
8. A human must confirm, correct, or reject every draft. Review events and audit events are append-only.
9. A reviewed draft cannot be silently replaced by a worker retry or reprocessing request.
10. CFO briefs consume confirmed/corrected drafts only and preserve source identifiers and formula versions.

## Extraction contract

The normalized extraction schema records:

- document type and purchase/sale direction
- document number and issue date
- counterparty name and tax ID
- currency, subtotal, VAT, withholding tax, and total
- document description and confidence
- extraction method
- per-field evidence, page, bounding box, and confidence where available
- parser/model metadata

Unreadable values remain `null`. Missing totals or arithmetic conflicts prevent automatic draft creation. The extraction remains available for manual correction.

## Deterministic draft rules

The MVP proposes a deliberately small default chart:

| Code | Account |
|---|---|
| 1100 | Cash at bank |
| 1150 | Input VAT |
| 1200 | Accounts receivable |
| 1250 | Withholding tax receivable |
| 2100 | Accounts payable |
| 2150 | Withholding tax payable |
| 2151 | Output VAT |
| 4100 | Revenue |
| 5100 | Operating expense |

These defaults are not a claim that every transaction has the same accounting treatment. Reviewers can replace lines, and a later module must support a company-specific chart of accounts, tax codes, dimensions, materiality, and policy.

## CFO brief

The deterministic brief aggregates reviewed journal lines for a selected period and currency:

- revenue
- operating expenses
- operating result
- net cash movement represented by reviewed entries
- receivable and payable movement
- input/output VAT movement
- reviewed source count
- pending-review risk
- explicit unknowns such as opening bank balance, ageing, budget, filing status, and reconciliation

It does not label movement as a closing balance. This distinction exists because numbers do not become true merely because a dashboard gives them a gradient.

## Local verification

```bash
cp .env.example .env
docker compose up --build
```

Open `http://localhost:3000/app`, create an organization and company, then upload `examples/synthetic-invoice.json`.

For production-like malware scanning:

```bash
SCAN_MODE=clamav docker compose --profile security up --build
```

## Acceptance checks

- Migrations apply twice without failure.
- An attachment duplicate by company and SHA-256 returns conflict.
- A mismatched object size, MIME type, or SHA-256 metadata is rejected before enqueueing.
- The worker rejects a downloaded object whose SHA-256 differs from the declared value.
- EICAR is marked infected in development mode.
- JSON fixture extraction creates a balanced pending draft.
- Arithmetic mismatch creates an extracted document but no draft.
- Confirm/correct/reject transitions work only from pending.
- Corrected lines must balance.
- Review and audit history are append-only.
- CFO brief excludes pending/rejected drafts.
- Private model requests have no hosted fallback.
