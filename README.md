# CherryFin

**AI Financial Research & Personal Finance Assistant**

CherryFin is an Android-first, iOS-ready financial assistant for asking questions, searching current information, analyzing charts and documents, and sending the results through LINE, Telegram, or Google Drive.

## Phase 1

- Thai/English financial and investment Q&A
- Source-grounded web and market research
- Chart screenshot, PDF, CSV, and spreadsheet analysis
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
Phase 2: Understand my money
Phase 3: Understand my investments
Phase 4: Test and learn strategies
Phase 5: Execute only behind hard controls
```

## Initial platform

- Expo React Native
- Android-first, iOS-ready
- PostgreSQL, Redis, and S3-compatible object storage
- OpenAI-compatible model gateway for local Qwen and vision models
- LINE, Telegram, and Google Drive connectors
