# Incident Response

## Trigger conditions

- suspected unauthorized tenant access
- leaked token, secret, or model-provider credential
- malware or sensitive document exposure
- duplicate or unauthorized external delivery
- incorrect financial output used in a material decision
- loss or corruption of audit/evidence records

## Immediate actions

1. Preserve the trace ID, time window, affected user, organization, company, and service.
2. Revoke exposed credentials and sessions. Disable hosted fallback if privacy classification is uncertain.
3. Isolate the affected service or connector without deleting evidence.
4. Snapshot relevant append-only audit events, outbox rows, logs, and deployment metadata.
5. Determine whether personal data was exposed and begin the PDPA assessment clock.
6. Notify the designated security, privacy, product, and business owners.

## Investigation data

- `audit_events`
- `inbox_events` and `outbox_events`
- API and model-gateway trace IDs
- deployment commit SHA and environment configuration version
- connector/provider logs with secrets redacted
- source documents only through authorized evidence handling

## Recovery

Restore service only after the attack path is blocked, credentials are rotated, tenant isolation is verified, and replay/duplicate behavior is tested. Record corrective actions and add regression tests before closing the incident.
