# Runnable Foundation

**Implementation status:** pre-alpha  
**Scope:** Phase 0 plus tenant/RBAC and accounting-intake data foundations

## Delivered boundaries

The current code establishes the runtime and trust boundaries needed before document extraction or CFO analysis is added:

1. PostgreSQL is the source of truth.
2. Organization membership and role permissions gate company access.
3. Audit and review records are append-only at the database layer.
4. Business transactions can create durable outbox rows in the same database transaction.
5. The worker converts pending outbox rows to BullMQ jobs using deterministic IDs.
6. Model routing separates task type from privacy class and prevents hosted fallback for private requests.
7. Monetary calculations use decimal strings and deterministic code.
8. Accounting evidence, draft headers, and draft lines are normalized rather than hidden only inside JSON blobs.

## Security boundary

`AUTH_MODE=development` is intentionally limited to local scaffolding. It trusts `x-user-id`, creates a configured development user at boot, and must not be deployed publicly.

`AUTH_MODE=jwt` verifies ES256 Bearer tokens with configured issuer and audience. The repository does not yet issue those tokens. A subsequent identity package must implement Google Sign-In, email OTP, refresh-token rotation, session-family theft detection, and channel linking.

## Database boundary

The migrations are designed to be re-runnable. They create:

- identity and tenant tables
- RBAC seed data
- consent and audit history
- durable inbox/outbox/idempotency records
- accounting attachment/document/draft/evidence/review tables

The application has not yet enabled PostgreSQL Row Level Security. Access is currently enforced in repository queries and must receive cross-tenant integration tests before production use.

## Known gaps before Phase 0 can be declared complete

- Commit a generated `pnpm-lock.yaml` after dependency installation.
- Run CI successfully on the pull request.
- Exercise Docker Compose on an actual Docker host.
- Add token issuance and refresh tests.
- Add Testcontainers integration tests for tenant isolation and transaction rollback.
- Connect the model gateway to a real local OpenAI-compatible endpoint.
- Perform and record a backup restore drill.
