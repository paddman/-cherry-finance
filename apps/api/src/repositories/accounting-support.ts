import type {
  AccountingDraft,
  AccountingDraftDetail,
  AccountingDraftLine,
  AccountingDocument,
  Attachment,
  CfoBrief
} from '@cherryfin/schemas/api';
import type { Sql } from 'postgres';
import { uuidv7 } from 'uuidv7';
import type { AttachmentRecord } from '../domain/accounting.js';
import type { RequestContext } from '../domain/organizations.js';
import { AppError } from '../errors.js';

export interface AttachmentRow {
  id: string;
  organization_id: string;
  company_id: string;
  uploaded_by: string;
  object_key: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  sha256: string;
  scan_status: Attachment['scanStatus'];
  extract_status: Attachment['extractStatus'];
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface DocumentRow {
  id: string;
  attachment_id: string;
  document_type: AccountingDocument['documentType'];
  document_number: string | null;
  issue_date: string | null;
  counterparty_name: string | null;
  counterparty_tax_id: string | null;
  currency: string;
  subtotal: string | null;
  vat_amount: string | null;
  withholding_tax_amount: string | null;
  total_amount: string | null;
  extracted_fields: Record<string, unknown>;
  validation_results: Record<string, unknown>;
  status: AccountingDocument['status'];
  created_at: Date;
  updated_at: Date;
}

export interface DraftRow {
  id: string;
  organization_id: string;
  company_id: string;
  document_id: string;
  confidence: AccountingDraft['confidence'];
  status: AccountingDraft['status'];
  version: number;
  total_debit: string;
  total_credit: string;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface DraftLineRow {
  id: string;
  line_number: number;
  account_code: string;
  account_name: string;
  description: string | null;
  debit: string;
  credit: string;
  tax_code: string | null;
  dimensions: Record<string, string>;
}

interface EvidenceRow {
  id: string;
  field_name: string;
  page_number: number | null;
  bounding_box: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  extracted_value: string | null;
  confidence: string | null;
}

interface ReviewRow {
  id: string;
  reviewer_user_id: string;
  action: 'confirmed' | 'corrected' | 'rejected';
  note: string | null;
  created_at: Date;
}

export interface BriefRow {
  id: string;
  organization_id: string;
  company_id: string;
  period_start: string;
  period_end: string;
  currency: string;
  status: CfoBrief['status'];
  inputs: Record<string, unknown>;
  sections: Record<string, unknown>;
  calculation_versions: Record<string, unknown>;
  generated_by: string;
  created_at: Date;
  updated_at: Date;
}

export function uniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}

export function safeFilename(filename: string): string {
  const value = filename
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return value || 'document';
}

export function mapAttachment(row: AttachmentRow): AttachmentRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    companyId: row.company_id,
    uploadedBy: row.uploaded_by,
    objectKey: row.object_key,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
    sha256: row.sha256,
    scanStatus: row.scan_status,
    extractStatus: row.extract_status,
    metadata: row.metadata,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

export function publicAttachment(record: AttachmentRecord): Attachment {
  const { objectKey: _objectKey, uploadedBy: _uploadedBy, ...publicRecord } = record;
  return publicRecord;
}

export function mapDocument(row: DocumentRow): AccountingDocument {
  return {
    id: row.id,
    attachmentId: row.attachment_id,
    documentType: row.document_type,
    documentNumber: row.document_number,
    issueDate: row.issue_date,
    counterpartyName: row.counterparty_name,
    counterpartyTaxId: row.counterparty_tax_id,
    currency: row.currency,
    subtotal: row.subtotal,
    vatAmount: row.vat_amount,
    withholdingTaxAmount: row.withholding_tax_amount,
    totalAmount: row.total_amount,
    extractedFields: row.extracted_fields,
    validationResults: row.validation_results,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

export function mapDraft(row: DraftRow): AccountingDraft {
  return {
    id: row.id,
    organizationId: row.organization_id,
    companyId: row.company_id,
    documentId: row.document_id,
    confidence: row.confidence,
    status: row.status,
    version: row.version,
    totalDebit: row.total_debit,
    totalCredit: row.total_credit,
    reviewNote: row.review_note,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

export function mapLine(row: DraftLineRow): AccountingDraftLine {
  return {
    id: row.id,
    lineNumber: row.line_number,
    accountCode: row.account_code,
    accountName: row.account_name,
    description: row.description,
    debit: row.debit,
    credit: row.credit,
    taxCode: row.tax_code,
    dimensions: row.dimensions
  };
}

export function mapBrief(row: BriefRow): CfoBrief {
  return {
    id: row.id,
    organizationId: row.organization_id,
    companyId: row.company_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    currency: row.currency,
    status: row.status,
    inputs: row.inputs,
    sections: row.sections,
    calculationVersions: row.calculation_versions,
    generatedBy: row.generated_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

export async function assertPermission(
  sql: Sql,
  context: RequestContext,
  organizationId: string,
  permissionCode: string
): Promise<void> {
  const rows = await sql<{ allowed: boolean }[]>`
    select true as allowed
    from organization_memberships membership
    join roles role on role.id = membership.role_id
    join role_permissions rp on rp.role_id = role.id
    join permissions permission on permission.id = rp.permission_id
    where membership.organization_id = ${organizationId}
      and membership.user_id = ${context.userId}
      and membership.status = 'active'
      and permission.code = ${permissionCode}
    limit 1
  `;
  if (!rows[0]?.allowed) {
    throw new AppError(404, 'NOT_FOUND', 'The requested resource was not found');
  }
}

export async function assertCompany(
  sql: Sql,
  organizationId: string,
  companyId: string
): Promise<void> {
  const rows = await sql<{ id: string }[]>`
    select id from companies
    where id = ${companyId} and organization_id = ${organizationId}
    limit 1
  `;
  if (!rows[0]) {
    throw new AppError(404, 'NOT_FOUND', 'The requested company was not found');
  }
}

export async function appendAudit(
  sql: Sql,
  context: RequestContext,
  organizationId: string,
  action: string,
  subject: Record<string, unknown>
): Promise<void> {
  await sql`
    insert into audit_events (
      id, organization_id, user_id, actor, action, subject, trace_id,
      ip_address, user_agent
    ) values (
      ${uuidv7()}, ${organizationId}, ${context.userId},
      ${`user:${context.userId}`}, ${action},
      ${sql.json(JSON.parse(JSON.stringify(subject)))},
      ${context.traceId}, ${context.ipAddress ?? null}, ${context.userAgent ?? null}
    )
  `;
}

export async function findAttachment(
  sql: Sql,
  attachmentId: string,
  userId?: string
): Promise<AttachmentRecord | null> {
  const rows = userId
    ? await sql<AttachmentRow[]>`
        select attachment.*
        from attachments attachment
        join organization_memberships membership
          on membership.organization_id = attachment.organization_id
         and membership.user_id = ${userId}
         and membership.status = 'active'
        where attachment.id = ${attachmentId}
        limit 1
      `
    : await sql<AttachmentRow[]>`
        select * from attachments where id = ${attachmentId} limit 1
      `;
  return rows[0] ? mapAttachment(rows[0]) : null;
}

export async function loadDraftDetail(
  sql: Sql,
  draftId: string,
  userId?: string
): Promise<AccountingDraftDetail | null> {
  const draftRows = userId
    ? await sql<DraftRow[]>`
        select draft.*
        from accounting_drafts draft
        join organization_memberships membership
          on membership.organization_id = draft.organization_id
         and membership.user_id = ${userId}
         and membership.status = 'active'
        where draft.id = ${draftId}
        limit 1
      `
    : await sql<DraftRow[]>`
        select * from accounting_drafts where id = ${draftId} limit 1
      `;
  const draft = draftRows[0];
  if (!draft) return null;

  const [documents, attachmentRows, lineRows, evidenceRows, reviewRows] =
    await Promise.all([
      sql<DocumentRow[]>`
        select * from accounting_documents where id = ${draft.document_id} limit 1
      `,
      sql<AttachmentRow[]>`
        select attachment.*
        from attachments attachment
        join accounting_documents document on document.attachment_id = attachment.id
        where document.id = ${draft.document_id}
        limit 1
      `,
      sql<DraftLineRow[]>`
        select id, line_number, account_code, account_name, description,
               debit::text, credit::text, tax_code, dimensions
        from accounting_draft_lines
        where draft_id = ${draftId}
        order by line_number
      `,
      sql<EvidenceRow[]>`
        select id, field_name, page_number, bounding_box,
               extracted_value, confidence::text
        from evidence_links
        where entity_type in ('accounting_document', 'accounting_draft')
          and entity_id in (${draft.document_id}, ${draftId})
        order by field_name, created_at
      `,
      sql<ReviewRow[]>`
        select id, reviewer_user_id, action, note, created_at
        from review_events where draft_id = ${draftId}
        order by created_at
      `
    ]);

  const document = documents[0];
  const attachment = attachmentRows[0];
  if (!document || !attachment) {
    throw new AppError(500, 'ACCOUNTING_GRAPH_INCOMPLETE', 'Draft evidence graph is incomplete');
  }

  return {
    ...mapDraft(draft),
    document: mapDocument(document),
    attachment: publicAttachment(mapAttachment(attachment)),
    lines: lineRows.map(mapLine),
    evidence: evidenceRows.map((row) => ({
      id: row.id,
      fieldName: row.field_name,
      pageNumber: row.page_number,
      boundingBox: row.bounding_box,
      extractedValue: row.extracted_value,
      confidence: row.confidence
    })),
    reviewEvents: reviewRows.map((row) => ({
      id: row.id,
      reviewerUserId: row.reviewer_user_id,
      action: row.action,
      note: row.note,
      createdAt: row.created_at.toISOString()
    }))
  };
}
