# CherryFin

**AI Accounting, Startup CFO & Company Launch Assistant**

CherryFin is a Thailand-first, accounting-first AI assistant for founders and small businesses. Its daily job is to turn invoices, receipts, statements, withholding-tax certificates, spreadsheets, and accounting exports into traceable accounting drafts for human review. Tax readiness, Startup CFO metrics, company launch, and multi-asset investment research extend that core. Android comes first; the same system is iOS-ready and connects to LINE, Telegram, and Google Drive.

## Phase 1

- Accounting inbox for invoices, receipts, statements, withholding-tax certificates, spreadsheets, and accounting exports
- OCR/structured extraction with field-level evidence, confidence, duplicate detection, missing-field checks, and arithmetic validation
- Proposed categories and balanced debit/credit draft lines with explicit confirm/correct/reject review
- Thai/English accounting, tax, Startup CFO, company-launch, financial, and investment Q&A
- Official-source research from DBD and the Revenue Department
- Market research for SET/mai, NYSE/Nasdaq, ETFs, funds, crypto, FX, and commodities
- Analysis of financial statements, budgets, cap tables, chart screenshots, PDFs, CSVs, and spreadsheets
- LINE and Telegram inbound/outbound messaging
- Google Drive selected-file search, read, and report save
- Conversation history, source lineage, timestamps, reviewer decisions, and audit trails

Phase 1 does not silently post entries to a statutory ledger, file tax returns, register a company, move money, or place trades. AI prepares a traceable draft; the user or an accounting professional reviews the material judgment.

## Architecture

See the full design:

- [CherryFin Full System Design](docs/architecture/CherryFin_Full_System_Design.md) — product scope, logical architecture, and delivery phases
- [CherryFin Phase 1 Detailed Design](docs/architecture/CherryFin_Phase1_Detailed_Design.md) — locked stack, accounting-review schema/API, compliance, and testing
- [Architecture Decision Records](docs/adr) — individual technology decisions

## Product evolution

```text
Phase 1: Accounting Q&A + Document Intake + Draft Review + Send
Phase 2: Bookkeeping + Monthly Close
Phase 3: Tax + Compliance
Phase 4: Company Launch + Startup CFO
Phase 5: Personal Finance + Investment Intelligence
Phase 6: LYRA-9 + Strategy Lab
Phase 7: Guarded Execution
```

## Initial platform

- Expo React Native
- Android-first, iOS-ready
- PostgreSQL, Redis, and S3-compatible object storage
- OpenAI-compatible model gateway for local Qwen and vision models
- Accounting document pipeline and human-review inbox with evidence-linked draft entries
- Thailand-first accounting, tax, Startup CFO, and company-launch tools with source/effective-date lineage
- Multi-asset market layer with venue, currency, session, timestamp, and corporate-action awareness
- LINE, Telegram, and Google Drive connectors
