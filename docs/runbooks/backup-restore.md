# Backup and Restore

## Required backup sets

- PostgreSQL base backup plus WAL or equivalent point-in-time recovery
- encrypted object-storage versioning/replication
- model routing configuration and prompt versions
- deployment manifests and secret references, never plaintext secrets in the backup log

Redis is configured with AOF for queue durability, but PostgreSQL outbox rows are the recovery source for user-visible dispatch events.

## Restore drill

1. Create an isolated restore environment.
2. Restore PostgreSQL to the selected recovery point.
3. Restore the matching object-storage version set.
4. Apply migrations without modifying historical migration files.
5. Verify counts and foreign-key integrity for organizations, companies, attachments, drafts, evidence links, audit events, and outbox events.
6. Re-enqueue pending outbox rows only after confirming deterministic job IDs prevent duplicates.
7. Validate a synthetic document-to-draft lineage and one tenant-isolation scenario.
8. Record actual recovery time and recovery point against the declared RTO/RPO.

A backup job is not considered successful until a restore drill verifies integrity and recoverability.
