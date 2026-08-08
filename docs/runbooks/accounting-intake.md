# Accounting Intake Runbook

## Symptoms

- attachment remains `pending` or `processing`
- attachment is `failed`
- draft was not created
- worker reports malware, hash mismatch, model unavailable, or callback failure

## First checks

1. Record attachment ID, organization ID, company ID, and trace ID.
2. Inspect API and worker logs without copying document content into tickets.
3. Check `/readyz`, Redis, MinIO, PostgreSQL, and the model gateway.
4. Check `outbox_events` and the BullMQ `attachments` queue.
5. Confirm the object byte length and SHA-256 against the attachment row.
6. Confirm malware scanner availability. Production must use ClamAV.

## Useful queries

```sql
select id, scan_status, extract_status, metadata, updated_at
from attachments
where id = 'ATTACHMENT_UUID';

select id, topic, status, attempts, locked_at, dispatched_at, last_error
from outbox_events
where aggregate_id = 'ATTACHMENT_UUID'
order by created_at;

select document.id, document.status, draft.id, draft.status, draft.version
from accounting_documents document
left join accounting_drafts draft on draft.document_id = document.id
where document.attachment_id = 'ATTACHMENT_UUID';
```

## Recovery

- A stale outbox row in `processing` becomes claimable again after five minutes.
- A failed unreviewed attachment can be re-enqueued through `POST /v1/attachments/{id}/reprocess`.
- An infected attachment must not be reprocessed. Quarantine/delete it according to the incident process.
- A reviewed draft cannot be silently replaced. Upload a corrected document version or use the audited draft correction endpoint.
- When the local model is unavailable, restore the private route and reprocess. Do not route private documents to a hosted fallback.

## Escalation

Escalate when:

- computed SHA-256 differs from the declared value
- ClamAV reports a signature
- the same attachment repeatedly produces inconsistent extraction
- audit/review history is missing
- a tenant boundary check appears to fail
- object or database data has been modified outside the application workflow
