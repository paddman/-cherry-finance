import {
  ExtractedAccountingDocumentSchema,
  proposeDraft,
  validateExtraction,
  type ExtractedAccountingDocument
} from '@cherryfin/accounting-core';
import type {
  AccountingDraftDetail,
  Attachment,
  AttachmentCreateInput,
  WorkerExtractionResult
} from '@cherryfin/schemas/api';
import type { Sql } from 'postgres';
import { uuidv7 } from 'uuidv7';
import type { AttachmentRecord } from '../domain/accounting.js';
import type { RequestContext } from '../domain/organizations.js';
import { AppError } from '../errors.js';
import {
  appendAudit,
  assertCompany,
  assertPermission,
  findAttachment,
  loadDraftDetail,
  mapAttachment,
  publicAttachment,
  safeFilename,
  uniqueViolation,
  type AttachmentRow,
  type DraftRow
} from './accounting-support.js';

async function reviewedDraftExists(sql: Sql, attachmentId: string): Promise<boolean> {
  const rows = await sql<{ exists: boolean }[]>`
    select exists (
      select 1
      from accounting_drafts draft
      join accounting_documents document on document.id = draft.document_id
      where document.attachment_id = ${attachmentId}
        and draft.status in ('confirmed', 'corrected')
    ) as exists
  `;
  return rows[0]?.exists ?? false;
}

async function insertEvidence(
  transaction: Sql,
  organizationId: string,
  attachmentId: string,
  entityType: 'accounting_document' | 'accounting_draft',
  entityId: string,
  extraction: ExtractedAccountingDocument
): Promise<void> {
  for (const field of extraction.fields) {
    await transaction`
      insert into evidence_links (
        id, organization_id, attachment_id, entity_type, entity_id,
        field_name, page_number, bounding_box, extracted_value, confidence
      ) values (
        ${uuidv7()}, ${organizationId}, ${attachmentId}, ${entityType}, ${entityId},
        ${field.fieldName}, ${field.pageNumber ?? null},
        ${field.boundingBox ? transaction.json(field.boundingBox) : null},
        ${field.value ?? null}, ${field.confidence ?? null}
      )
    `;
  }
}

async function persistExtraction(
  sql: Sql,
  attachment: AttachmentRecord,
  extractionInput: unknown,
  traceId: string,
  actor: string
): Promise<string | null> {
  const extraction = ExtractedAccountingDocumentSchema.parse(extractionInput);
  const validation = validateExtraction(extraction);
  const proposal = proposeDraft(extraction);
  const documentId = uuidv7();
  const draftId = uuidv7();

  return sql.begin(async (transaction) => {
    const reviewed = await transaction<{ exists: boolean }[]>`
      select exists (
        select 1
        from accounting_drafts draft
        join accounting_documents document on document.id = draft.document_id
        where document.attachment_id = ${attachment.id}
          and draft.status in ('confirmed', 'corrected')
      ) as exists
    `;
    if (reviewed[0]?.exists) {
      throw new AppError(
        409,
        'REVIEWED_DRAFT_IMMUTABLE',
        'A reviewed draft cannot be replaced by extraction processing'
      );
    }

    const documents = await transaction<{ id: string }[]>`
      insert into accounting_documents (
        id, organization_id, company_id, attachment_id, document_type,
        document_number, issue_date, counterparty_name, counterparty_tax_id,
        currency, subtotal, vat_amount, withholding_tax_amount, total_amount,
        extracted_fields, validation_results, status
      ) values (
        ${documentId}, ${attachment.organizationId}, ${attachment.companyId},
        ${attachment.id}, ${extraction.documentType},
        ${extraction.documentNumber ?? null}, ${extraction.issueDate ?? null},
        ${extraction.counterpartyName ?? null}, ${extraction.counterpartyTaxId ?? null},
        ${extraction.currency}, ${validation.normalized.subtotal},
        ${validation.normalized.vatAmount}, ${validation.normalized.withholdingTaxAmount},
        ${validation.normalized.totalAmount}, ${transaction.json(extraction)},
        ${transaction.json(validation)}, ${proposal ? 'extracted' : 'needs_review'}
      )
      on conflict (attachment_id) do update set
        document_type = excluded.document_type,
        document_number = excluded.document_number,
        issue_date = excluded.issue_date,
        counterparty_name = excluded.counterparty_name,
        counterparty_tax_id = excluded.counterparty_tax_id,
        currency = excluded.currency,
        subtotal = excluded.subtotal,
        vat_amount = excluded.vat_amount,
        withholding_tax_amount = excluded.withholding_tax_amount,
        total_amount = excluded.total_amount,
        extracted_fields = excluded.extracted_fields,
        validation_results = excluded.validation_results,
        status = excluded.status,
        updated_at = now()
      returning id
    `;
    const effectiveDocumentId = documents[0]?.id;
    if (!effectiveDocumentId) {
      throw new AppError(500, 'DOCUMENT_SAVE_FAILED', 'Extracted document could not be saved');
    }

    const existingDrafts = await transaction<DraftRow[]>`
      select * from accounting_drafts
      where document_id = ${effectiveDocumentId} and status = 'pending'
      limit 1 for update
    `;
    const existingDraft = existingDrafts[0];

    await transaction`
      delete from evidence_links
      where attachment_id = ${attachment.id}
        and entity_type in ('accounting_document', 'accounting_draft')
    `;
    await insertEvidence(
      transaction,
      attachment.organizationId,
      attachment.id,
      'accounting_document',
      effectiveDocumentId,
      extraction
    );

    let effectiveDraftId: string | null = null;
    if (!proposal) {
      if (existingDraft) {
        await transaction`delete from accounting_drafts where id = ${existingDraft.id}`;
      }
    } else if (existingDraft) {
      effectiveDraftId = existingDraft.id;
      await transaction`delete from accounting_draft_lines where draft_id = ${existingDraft.id}`;
      await transaction`
        update accounting_drafts set
          confidence = ${proposal.confidence},
          version = version + 1,
          total_debit = ${proposal.totalDebit},
          total_credit = ${proposal.totalCredit},
          review_note = null,
          updated_at = now()
        where id = ${existingDraft.id}
      `;
    } else {
      effectiveDraftId = draftId;
      await transaction`
        insert into accounting_drafts (
          id, organization_id, company_id, document_id, proposed_by,
          confidence, status, total_debit, total_credit
        ) values (
          ${draftId}, ${attachment.organizationId}, ${attachment.companyId},
          ${effectiveDocumentId}, ${actor}, ${proposal.confidence}, 'pending',
          ${proposal.totalDebit}, ${proposal.totalCredit}
        )
      `;
    }

    if (proposal && effectiveDraftId) {
      for (const line of proposal.lines) {
        await transaction`
          insert into accounting_draft_lines (
            id, draft_id, line_number, account_code, account_name,
            description, debit, credit, tax_code, dimensions
          ) values (
            ${uuidv7()}, ${effectiveDraftId}, ${line.lineNumber},
            ${line.accountCode}, ${line.accountName}, ${line.description},
            ${line.debit}, ${line.credit}, ${line.taxCode},
            ${transaction.json(line.dimensions)}
          )
        `;
      }
      await insertEvidence(
        transaction,
        attachment.organizationId,
        attachment.id,
        'accounting_draft',
        effectiveDraftId,
        extraction
      );
    }

    await transaction`
      update attachments set
        scan_status = 'clean', extract_status = 'done',
        metadata = metadata || ${transaction.json({
          processor: { completedAt: new Date().toISOString(), traceId },
          draftCreated: Boolean(effectiveDraftId),
          validation
        })},
        updated_at = now()
      where id = ${attachment.id}
    `;
    await transaction`
      insert into audit_events (
        id, organization_id, user_id, actor, action, subject, trace_id
      ) values (
        ${uuidv7()}, ${attachment.organizationId}, null, ${actor},
        'attachment.extracted',
        ${transaction.json({
          attachmentId: attachment.id,
          documentId: effectiveDocumentId,
          draftId: effectiveDraftId,
          validForDraft: validation.validForDraft
        })},
        ${traceId}
      )
    `;
    return effectiveDraftId;
  });
}

export async function createAttachment(
  sql: Sql,
  context: RequestContext,
  organizationId: string,
  companyId: string,
  input: AttachmentCreateInput
): Promise<AttachmentRecord> {
  await assertPermission(sql, context, organizationId, 'accounting.write');
  await assertCompany(sql, organizationId, companyId);
  const attachmentId = uuidv7();
  const objectKey = `organizations/${organizationId}/companies/${companyId}/attachments/${attachmentId}/${safeFilename(input.originalFilename)}`;
  try {
    const rows = await sql<AttachmentRow[]>`
      insert into attachments (
        id, organization_id, company_id, uploaded_by, object_key,
        original_filename, mime_type, byte_size, sha256, metadata
      ) values (
        ${attachmentId}, ${organizationId}, ${companyId}, ${context.userId},
        ${objectKey}, ${input.originalFilename}, ${input.mimeType},
        ${input.byteSize}, ${input.sha256.toLowerCase()},
        ${sql.json({ uploadStatus: 'pending' })}
      ) returning *
    `;
    const row = rows[0];
    if (!row) throw new AppError(500, 'ATTACHMENT_CREATE_FAILED', 'Attachment could not be created');
    await appendAudit(sql, context, organizationId, 'attachment.created', {
      attachmentId,
      companyId,
      sha256: input.sha256.toLowerCase()
    });
    return mapAttachment(row);
  } catch (error) {
    if (uniqueViolation(error)) {
      throw new AppError(409, 'ATTACHMENT_DUPLICATE', 'This document has already been uploaded');
    }
    throw error;
  }
}

export async function listAttachments(
  sql: Sql,
  context: RequestContext,
  organizationId: string,
  companyId: string,
  limit: number
): Promise<Attachment[]> {
  await assertPermission(sql, context, organizationId, 'accounting.read');
  await assertCompany(sql, organizationId, companyId);
  const rows = await sql<AttachmentRow[]>`
    select * from attachments
    where organization_id = ${organizationId} and company_id = ${companyId}
    order by created_at desc limit ${limit}
  `;
  return rows.map((row) => publicAttachment(mapAttachment(row)));
}

export async function getAttachment(
  sql: Sql,
  context: RequestContext,
  attachmentId: string
): Promise<AttachmentRecord | null> {
  return findAttachment(sql, attachmentId, context.userId);
}

export async function completeAttachment(
  sql: Sql,
  context: RequestContext,
  attachmentId: string,
  storageVerification: Record<string, unknown>
): Promise<Attachment> {
  const attachment = await findAttachment(sql, attachmentId, context.userId);
  if (!attachment) throw new AppError(404, 'NOT_FOUND', 'Attachment was not found');
  await assertPermission(sql, context, attachment.organizationId, 'accounting.write');
  if (attachment.scanStatus === 'infected') {
    throw new AppError(409, 'ATTACHMENT_INFECTED', 'An infected attachment cannot be processed');
  }
  const rows = await sql<AttachmentRow[]>`
    update attachments set
      scan_status = 'pending', extract_status = 'pending',
      metadata = metadata || ${sql.json({
        uploadStatus: 'verified',
        storageVerification,
        verifiedAt: new Date().toISOString()
      })}, updated_at = now()
    where id = ${attachmentId}
    returning *
  `;
  await sql`
    insert into outbox_events (
      id, topic, queue_name, aggregate_type, aggregate_id, trace_id, payload
    ) values (
      ${uuidv7()}, 'attachment.process', 'attachments', 'attachment',
      ${attachmentId}, ${context.traceId},
      ${sql.json({
        attachmentId,
        organizationId: attachment.organizationId,
        companyId: attachment.companyId,
        objectKey: attachment.objectKey,
        mimeType: attachment.mimeType,
        byteSize: attachment.byteSize,
        sha256: attachment.sha256
      })}
    )
  `;
  await appendAudit(sql, context, attachment.organizationId, 'attachment.completed', {
    attachmentId
  });
  const row = rows[0];
  if (!row) throw new AppError(500, 'ATTACHMENT_COMPLETE_FAILED', 'Attachment could not be completed');
  return publicAttachment(mapAttachment(row));
}

export async function reprocessAttachment(
  sql: Sql,
  context: RequestContext,
  attachmentId: string
): Promise<Attachment> {
  const attachment = await findAttachment(sql, attachmentId, context.userId);
  if (!attachment) throw new AppError(404, 'NOT_FOUND', 'Attachment was not found');
  await assertPermission(sql, context, attachment.organizationId, 'accounting.write');
  if (attachment.scanStatus === 'infected') {
    throw new AppError(409, 'ATTACHMENT_INFECTED', 'An infected attachment cannot be reprocessed');
  }
  if (await reviewedDraftExists(sql, attachmentId)) {
    throw new AppError(409, 'REVIEWED_DRAFT_IMMUTABLE', 'Reviewed work cannot be silently reprocessed');
  }
  return completeAttachment(sql, context, attachmentId, {
    reprocessRequestedAt: new Date().toISOString()
  });
}

export async function applyWorkerResult(
  sql: Sql,
  attachmentId: string,
  result: WorkerExtractionResult,
  traceId: string
): Promise<void> {
  const attachment = await findAttachment(sql, attachmentId);
  if (!attachment) throw new AppError(404, 'NOT_FOUND', 'Attachment was not found');

  if (result.status === 'processing') {
    await sql`
      update attachments set extract_status = 'processing',
        metadata = metadata || ${sql.json(result)}, updated_at = now()
      where id = ${attachmentId}
    `;
    return;
  }
  if (result.status === 'infected') {
    await sql`
      update attachments set scan_status = 'infected', extract_status = 'failed',
        metadata = metadata || ${sql.json(result)}, updated_at = now()
      where id = ${attachmentId}
    `;
    return;
  }
  if (result.status === 'failed') {
    await sql`
      update attachments set scan_status = ${result.scanStatus}, extract_status = 'failed',
        metadata = metadata || ${sql.json(result)}, updated_at = now()
      where id = ${attachmentId}
    `;
    return;
  }

  try {
    await persistExtraction(sql, attachment, result.extraction, traceId, 'worker:attachment');
    await sql`
      update attachments set metadata = metadata || ${sql.json({
        workerProcessor: result.processor
      })}, updated_at = now()
      where id = ${attachmentId}
    `;
  } catch (error) {
    if (error instanceof AppError && error.code === 'REVIEWED_DRAFT_IMMUTABLE') {
      await sql`
        update attachments set metadata = metadata || ${sql.json({
          reviewPreserved: true,
          ignoredWorkerResultAt: new Date().toISOString()
        })}, updated_at = now()
        where id = ${attachmentId}
      `;
      return;
    }
    throw error;
  }
}

export async function submitManualExtraction(
  sql: Sql,
  context: RequestContext,
  attachmentId: string,
  extraction: ExtractedAccountingDocument
): Promise<AccountingDraftDetail | null> {
  const attachment = await findAttachment(sql, attachmentId, context.userId);
  if (!attachment) throw new AppError(404, 'NOT_FOUND', 'Attachment was not found');
  await assertPermission(sql, context, attachment.organizationId, 'accounting.write');
  if (attachment.scanStatus !== 'clean') {
    throw new AppError(409, 'ATTACHMENT_NOT_CLEAN', 'Only a clean attachment can be manually extracted');
  }
  const parsed = ExtractedAccountingDocumentSchema.parse({
    ...extraction,
    extractionMethod: 'manual'
  });
  const draftId = await persistExtraction(
    sql,
    attachment,
    parsed,
    context.traceId,
    `user:${context.userId}`
  );
  await appendAudit(sql, context, attachment.organizationId, 'attachment.manual_extraction', {
    attachmentId,
    draftId
  });
  return draftId ? loadDraftDetail(sql, draftId, context.userId) : null;
}
