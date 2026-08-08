# Contributing

## Development flow

1. Create a focused branch from `main`.
2. Keep database changes in a new numbered migration. Existing applied migrations are immutable.
3. Add or update Zod contracts and Drizzle schema in the same change.
4. Add tests for authorization, tenant isolation, calculation rules, and failure behavior.
5. Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose config --quiet
```

6. Open a pull request describing scope, migration impact, security impact, rollback, and evidence of testing.

## Financial-data rules

- Use synthetic or anonymized fixtures only.
- Never commit bank statements, invoices, tax IDs, credentials, tokens, or customer documents.
- LLM output must not be trusted for arithmetic or statutory decisions.
- Every material financial number must retain source and formula lineage.
- Mutating workflows require explicit authorization, audit records, and later approval gates.
