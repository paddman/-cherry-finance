import type { ExtractedAccountingDocument } from '@cherryfin/accounting-core';
import type {
  AccountingDraft,
  AccountingDraftDetail,
  Attachment,
  AttachmentCreateInput,
  CfoBrief,
  CfoBriefCreateInput,
  CorrectDraftInput,
  WorkerExtractionResult
} from '@cherryfin/schemas/api';
import type { RequestContext } from './organizations.js';

export interface AttachmentRecord extends Attachment {
  objectKey: string;
  uploadedBy: string;
}

export type DraftReviewCommand =
  | { action: 'confirmed'; note?: string }
  | { action: 'rejected'; note: string }
  | { action: 'corrected'; input: CorrectDraftInput };

export interface AccountingRepository {
  createAttachment(
    context: RequestContext,
    organizationId: string,
    companyId: string,
    input: AttachmentCreateInput
  ): Promise<AttachmentRecord>;
  listAttachments(
    context: RequestContext,
    organizationId: string,
    companyId: string,
    limit: number
  ): Promise<Attachment[]>;
  getAttachment(
    context: RequestContext,
    attachmentId: string
  ): Promise<AttachmentRecord | null>;
  completeAttachment(
    context: RequestContext,
    attachmentId: string,
    storageVerification: Record<string, unknown>
  ): Promise<Attachment>;
  reprocessAttachment(
    context: RequestContext,
    attachmentId: string
  ): Promise<Attachment>;
  applyWorkerResult(
    attachmentId: string,
    result: WorkerExtractionResult,
    traceId: string
  ): Promise<void>;
  submitManualExtraction(
    context: RequestContext,
    attachmentId: string,
    extraction: ExtractedAccountingDocument
  ): Promise<AccountingDraftDetail | null>;
  listDrafts(
    context: RequestContext,
    organizationId: string,
    companyId: string,
    status: AccountingDraft['status'] | undefined,
    limit: number
  ): Promise<AccountingDraft[]>;
  getDraft(
    context: RequestContext,
    draftId: string
  ): Promise<AccountingDraftDetail | null>;
  reviewDraft(
    context: RequestContext,
    draftId: string,
    command: DraftReviewCommand
  ): Promise<AccountingDraftDetail>;
  createCfoBrief(
    context: RequestContext,
    organizationId: string,
    companyId: string,
    input: CfoBriefCreateInput
  ): Promise<CfoBrief>;
  getCfoBrief(
    context: RequestContext,
    briefId: string
  ): Promise<CfoBrief | null>;
}

export interface UploadDescriptor {
  method: 'PUT';
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
}

export interface ObjectHead {
  byteSize: number;
  contentType: string | null;
  etag: string | null;
  sha256: string | null;
}

export interface ObjectStorage {
  createUpload(record: AttachmentRecord): Promise<UploadDescriptor>;
  head(record: AttachmentRecord): Promise<ObjectHead>;
}
