import type {
  AccountingDraft,
  AccountingDraftDetail,
  Attachment,
  AttachmentCreateInput,
  CfoBrief,
  CfoBriefCreateInput,
  WorkerExtractionResult
} from '@cherryfin/schemas/api';
import type { ExtractedAccountingDocument } from '@cherryfin/accounting-core';
import type { Sql } from 'postgres';
import type {
  AccountingRepository,
  AttachmentRecord,
  DraftReviewCommand
} from '../domain/accounting.js';
import type { RequestContext } from '../domain/organizations.js';
import {
  applyWorkerResult,
  completeAttachment,
  createAttachment,
  getAttachment,
  listAttachments,
  reprocessAttachment,
  submitManualExtraction
} from './accounting-intake.js';
import {
  getDraft,
  listDrafts,
  reviewDraft
} from './accounting-review.js';
import { createCfoBrief, getCfoBrief } from './accounting-cfo.js';

export class PostgresAccountingRepository implements AccountingRepository {
  constructor(private readonly sql: Sql) {}

  createAttachment(
    context: RequestContext,
    organizationId: string,
    companyId: string,
    input: AttachmentCreateInput
  ): Promise<AttachmentRecord> {
    return createAttachment(this.sql, context, organizationId, companyId, input);
  }

  listAttachments(
    context: RequestContext,
    organizationId: string,
    companyId: string,
    limit: number
  ): Promise<Attachment[]> {
    return listAttachments(this.sql, context, organizationId, companyId, limit);
  }

  getAttachment(
    context: RequestContext,
    attachmentId: string
  ): Promise<AttachmentRecord | null> {
    return getAttachment(this.sql, context, attachmentId);
  }

  completeAttachment(
    context: RequestContext,
    attachmentId: string,
    storageVerification: Record<string, unknown>
  ): Promise<Attachment> {
    return completeAttachment(
      this.sql,
      context,
      attachmentId,
      storageVerification
    );
  }

  reprocessAttachment(
    context: RequestContext,
    attachmentId: string
  ): Promise<Attachment> {
    return reprocessAttachment(this.sql, context, attachmentId);
  }

  applyWorkerResult(
    attachmentId: string,
    result: WorkerExtractionResult,
    traceId: string
  ): Promise<void> {
    return applyWorkerResult(this.sql, attachmentId, result, traceId);
  }

  submitManualExtraction(
    context: RequestContext,
    attachmentId: string,
    extraction: ExtractedAccountingDocument
  ): Promise<AccountingDraftDetail | null> {
    return submitManualExtraction(
      this.sql,
      context,
      attachmentId,
      extraction
    );
  }

  listDrafts(
    context: RequestContext,
    organizationId: string,
    companyId: string,
    status: AccountingDraft['status'] | undefined,
    limit: number
  ): Promise<AccountingDraft[]> {
    return listDrafts(
      this.sql,
      context,
      organizationId,
      companyId,
      status,
      limit
    );
  }

  getDraft(
    context: RequestContext,
    draftId: string
  ): Promise<AccountingDraftDetail | null> {
    return getDraft(this.sql, context, draftId);
  }

  reviewDraft(
    context: RequestContext,
    draftId: string,
    command: DraftReviewCommand
  ): Promise<AccountingDraftDetail> {
    return reviewDraft(this.sql, context, draftId, command);
  }

  createCfoBrief(
    context: RequestContext,
    organizationId: string,
    companyId: string,
    input: CfoBriefCreateInput
  ): Promise<CfoBrief> {
    return createCfoBrief(
      this.sql,
      context,
      organizationId,
      companyId,
      input
    );
  }

  getCfoBrief(
    context: RequestContext,
    briefId: string
  ): Promise<CfoBrief | null> {
    return getCfoBrief(this.sql, context, briefId);
  }
}
