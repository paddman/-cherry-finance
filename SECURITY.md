# Security Policy

CherryFin is pre-alpha financial software. Do not use it to post statutory accounting entries, file tax returns, release payments, store production secrets, or execute trades.

## Reporting a vulnerability

Do not open a public issue containing exploit details, credentials, personal data, financial documents, or customer information. Contact the repository owner privately through the GitHub account associated with this repository and include:

- affected commit or version
- reproduction steps using synthetic data
- impact and likely attack path
- suggested mitigation, when known

## Current security assumptions

- `AUTH_MODE=development` is local-only and unsafe for public exposure.
- Production deployment requires `AUTH_MODE=jwt`, ES256 key management, TLS termination, secret management, restricted network access, and reviewed CORS/ingress policy.
- MinIO, PostgreSQL, and Redis credentials in examples are placeholders and must be replaced.
- Hosted model fallback is permitted only for requests explicitly classified as `public`.
- No real customer data belongs in tests, screenshots, issues, or pull requests.
