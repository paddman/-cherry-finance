# CherryFin

**AI Startup CFO, Company Launch & Financial Intelligence Assistant**

CherryFin is a Thailand-first, Android-first, iOS-ready AI assistant for starting and operating a company. It focuses on startup planning, accounting, tax, business data, and CFO metrics while retaining multi-asset investment research. Answers and documents can move through LINE, Telegram, and Google Drive.

## Phase 1

- Thai/English company-launch, startup, accounting, tax, financial, and investment Q&A
- Official-source research from DBD and the Revenue Department, plus multi-asset market research for SET/mai, NYSE/Nasdaq, ETFs, funds, crypto, FX, and commodities
- Analysis of invoices, receipts, tax documents, statements, cap tables, budgets, chart screenshots, PDF, CSV, and spreadsheets
- LINE and Telegram inbound/outbound messaging
- Google Drive selected-file search, read, and report save
- Conversation history, timestamps, confidence, and audit trails

Phase 1 is deliberately read-only: no autonomous trading, exchange order placement, withdrawals, or guaranteed investment outcomes.

## Architecture

See the full design:

- [CherryFin Full System Design](docs/architecture/CherryFin_Full_System_Design.md) — product scope, logical architecture, phases
- [CherryFin Phase 1 Detailed Design](docs/architecture/CherryFin_Phase1_Detailed_Design.md) — locked stack, database schema, API contracts, compliance, testing
- [Architecture Decision Records](docs/adr) — individual technology decisions

## Product evolution

```text
Phase 1: Ask + Search + Analyze + Send
Phase 2: Launch and organize my company
Phase 3: Run accounting, tax, and business data
Phase 4: Understand my money and investments
Phase 5: Test and learn strategies
Phase 6: Execute only behind hard controls
```

## Initial platform

- Expo React Native
- Android-first, iOS-ready
- PostgreSQL, Redis, and S3-compatible object storage
- OpenAI-compatible model gateway for local Qwen and vision models
- Thailand-first company-launch, accounting, tax, and startup-metric tools with source/effective-date lineage
- Multi-asset market layer with venue, currency, session, timestamp, and corporate-action awareness
- LINE, Telegram, and Google Drive connectors
