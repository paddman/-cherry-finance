# Security Policy

CherryFin is pre-alpha financial software. Do not use it to post statutory accounting entries, file tax returns, release payments, store production secrets, or execute trades.

## Reporting a vulnerability

Do not open a public issue containing exploit details, credentials, personal data, financial documents, or customer information. Contact the repository owner privately through the GitHub account associated with this repository and include:

- affected commit or version
- reproduction steps using synthetic data
- impact and likely attack path
- suggested mitigation, when known

## Current security assumptions

- `AUTH_MODE=development` is local-only and unsafe for public exposure. Production configuration rejects it.
- Production deployment requires `AUTH_MODE=jwt`, ES256 key management, TLS termination, secret management, restricted network access, and reviewed CORS/ingress policy.
- Presigned attachment uploads are short-lived and private. The API verifies object metadata; the worker independently verifies byte size and SHA-256 before parsing.
- `SCAN_MODE=development` is an EICAR guard, not a production malware scanner. Production worker configuration requires ClamAV.
- Uploaded accounting documents use model-gateway privacy class `private`; hosted fallback is forbidden.
- Reviewed drafts cannot be silently replaced by an extraction retry. Corrections require an authenticated review action and an append-only review event.
- MinIO, PostgreSQL, Redis, model, and internal-service credentials in examples are placeholders and must be replaced.
- No real customer data belongs in tests, screenshots, issues, pull requests, or the public demo environment.
- Object retention, deletion, backup, restore, and encryption-key procedures require deployment-specific implementation and evidence before a pilot.
