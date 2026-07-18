# CherryFin

**AI Accounting & Full CFO Operating System**

CherryFin is a Thailand-first, accounting-first CFO platform for founders and growing businesses. It turns invoices, receipts, statements, withholding-tax certificates, spreadsheets, and accounting exports into traceable accounting drafts, then builds toward the complete CFO lifecycle: AP/AR, monthly close, tax, treasury, FP&A, management reporting, internal controls, company/capital operations, and board/investor reporting. Android comes first; the same system is iOS-ready and connects to LINE, Telegram, and Google Drive.

## Phase 1

- Accounting inbox for invoices, receipts, statements, withholding-tax certificates, spreadsheets, and accounting exports
- OCR/structured extraction with field-level evidence, confidence, duplicate detection, missing-field checks, and arithmetic validation
- Proposed categories and balanced debit/credit draft lines with explicit confirm/correct/reject review
- Evidence-linked CFO brief covering cash, runway, revenue, margin, costs, receivables, payables, budget variance, risks, unknowns, and recommended actions
- Thai/English accounting, tax, CFO, company-launch, financial, and investment Q&A
- Official-source research from DBD and the Revenue Department
- Market research for SET/mai, NYSE/Nasdaq, ETFs, funds, crypto, FX, and commodities
- LINE and Telegram inbound/outbound messaging
- Google Drive selected-file search, read, and report save
- Conversation history, source/formula lineage, timestamps, assumptions, reviewer decisions, and audit trails

Phase 1 does not operate a complete ledger, release payments, file tax returns, register a company, bind the company, move money, or place trades. AI prepares traceable drafts, CFO analysis, forecasts, scenarios, and action recommendations; authorized humans retain approval.

## Full CFO scope

- **Record-to-report:** ledger, reconciliation, close, consolidation, financial statements, audit trail
- **Procure-to-pay:** vendors, purchase controls, AP ageing, payment proposals, spend analytics
- **Order-to-cash:** billing, AR ageing, collections, revenue workflow
- **Treasury:** cash position, 13-week forecast, liquidity, debt, FX, payment approval
- **FP&A:** budgets, rolling forecasts, driver models, scenarios, variance analysis
- **Performance:** KPI tree, unit economics, profitability, anomaly and action tracking
- **Tax & controls:** VAT/WHT, compliance calendar, approval matrix, segregation of duties, audit readiness
- **Company & capital:** launch, cap table, fundraising/dilution, board pack, investor update, data room
- **Decision support:** pricing, hiring, capex, financing, and make/buy scenarios with approval gates

## Architecture

- [CherryFin Full System Design](docs/architecture/CherryFin_Full_System_Design.md) — complete CFO scope, architecture, safety model, and delivery phases
- [CherryFin Phase 1 Detailed Design](docs/architecture/CherryFin_Phase1_Detailed_Design.md) — locked stack, accounting/CFO schema and APIs, compliance, and testing
- [Architecture Decision Records](docs/adr) — individual technology decisions

## Product evolution

```text
Phase 1: Accounting Intake + Ask/Search + CFO Brief + Send
Phase 2: Bookkeeping + Monthly Close
Phase 3: Tax + Compliance
Phase 4: FP&A + Treasury + Management Reporting
Phase 5: Company + Capital + Board Operations
Phase 6: Personal Finance + Investment Intelligence
Phase 7: LYRA-9 + Strategy Lab
Phase 8: Guarded Execution
```

## Initial platform

- Expo React Native: Android-first, iOS-ready
- PostgreSQL, Redis, and S3-compatible object storage
- OpenAI-compatible model gateway for local Qwen and vision models
- Accounting document pipeline and human-review inbox with evidence-linked draft entries
- Deterministic CFO brief, finance, tax, forecast, variance, runway, and scenario tools
- Thailand-first official-source/effective-date lineage
- Multi-asset market layer with venue, currency, session, timestamp, and corporate-action awareness
- LINE, Telegram, and Google Drive connectors
