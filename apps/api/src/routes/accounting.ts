import { ExtractedAccountingDocumentSchema } from '@cherryfin/accounting-core';
import {
  AccountingDraftDetailSchema,
  AccountingDraftListQuerySchema,
  AccountingDraftListSchema,
  AttachmentCompleteInputSchema,
  AttachmentCreateInputSchema,
  AttachmentListQuerySchema,
  AttachmentListSchema,
  AttachmentParamsSchema,
  AttachmentSchema,
  AttachmentUploadSchema,
  CfoBriefCreateInputSchema,
  CfoBriefParamsSchema,
  CfoBriefSchema,
  CompanyParamsSchema,
  ConfirmDraftInputSchema,
  CorrectDraftInputSchema,
  DraftParamsSchema,
  ErrorResponseSchema,
  RejectDraftInputSchema
} from '@cherryfin/schemas/api';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type {
  AccountingRepository,
  ObjectStorage
} from '../domain/accounting.js';
import { AppError } from '../errors.js';

export interface AccountingRoutesOptions {
  repository: AccountingRepository;
  storage: ObjectStorage;
}

function requestContext(request: FastifyRequest) {
  const userAgent = request.headers['user-agent'];
  return {
    userId: request.principal.userId,
    traceId: request.id,
    ipAddress: request.ip,
    ...(typeof userAgent === 'string' ? { userAgent } : {})
  };
}

function publicAttachment(record: Awaited<ReturnType<AccountingRepository['getAttachment']>>) {
  if (!record) {
    throw new AppError(404, 'NOT_FOUND', 'The requested attachment was not found');
  }
  return {
    id: record.id,
    organizationId: record.organizationId,
    companyId: record.companyId,
    originalFilename: record.originalFilename,
    mimeType: record.mimeType,
    byteSize: record.byteSize,
    sha256: record.sha256,
    scanStatus: record.scanStatus,
    extractStatus: record.extractStatus,
    metadata: record.metadata,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

export const accountingRoutes: FastifyPluginAsync<
  AccountingRoutesOptions
> = async (app, options) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/organizations/:organizationId/companies/:companyId/attachments',
    {
      schema: {
        tags: ['Accounting'],
        summary: 'Create a private attachment and presigned upload request',
        params: CompanyParamsSchema,
        body: AttachmentCreateInputSchema,
        response: {
          201: AttachmentUploadSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const attachment = await options.repository.createAttachment(
        requestContext(request),
        request.params.organizationId,
        request.params.companyId,
        request.body
      );
      const upload = await options.storage.createUpload(attachment);
      return reply.code(201).send({
        attachment: {
          id: attachment.id,
          organizationId: attachment.organizationId,
          companyId: attachment.companyId,
          originalFilename: attachment.originalFilename,
          mimeType: attachment.mimeType,
          byteSize: attachment.byteSize,
          sha256: attachment.sha256,
          scanStatus: attachment.scanStatus,
          extractStatus: attachment.extractStatus,
          metadata: attachment.metadata,
          createdAt: attachment.createdAt,
          updatedAt: attachment.updatedAt
        },
        upload
      });
    }
  );

  typed.get(
    '/organizations/:organizationId/companies/:companyId/attachments',
    {
      schema: {
        tags: ['Accounting'],
        summary: 'List company accounting attachments',
        params: CompanyParamsSchema,
        querystring: AttachmentListQuerySchema,
        response: {
          200: AttachmentListSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema
        }
      }
    },
    async (request) => ({
      items: await options.repository.listAttachments(
        requestContext(request),
        request.params.organizationId,
        request.params.companyId,
        request.query.limit
      )
    })
  );

  typed.get(
    '/attachments/:attachmentId',
    {
      schema: {
        tags: ['Accounting'],
        summary: 'Get attachment processing state',
        params: AttachmentParamsSchema,
        response: {
          200: AttachmentSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema
        }
      }
    },
    async (request) => {
      const record = await options.repository.getAttachment(
        requestContext(request),
        request.params.attachmentId
      );
      return publicAttachment(record);
    }
  );

  typed.post(
    '/attachments/:attachmentId/complete',
    {
      schema: {
        tags: ['Accounting'],
        summary: 'Verify an uploaded object and enqueue document processing',
        params: AttachmentParamsSchema,
        body: AttachmentCompleteInputSchema,
        response: {
          200: AttachmentSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
          422: ErrorResponseSchema
        }
      }
    },
    async (request) => {
      const record = await options.repository.getAttachment(
        requestContext(request),
        request.params.attachmentId
      );
      if (!record) {
        throw new AppError(404, 'NOT_FOUND', 'The requested attachment was not found');
      }
      const head = await options.storage.head(record);
      if (head.byteSize !== record.byteSize) {
        throw new AppError(
          422,
          'ATTACHMENT_SIZE_MISMATCH',
          'Uploaded object size does not match the declared size',
          { expected: record.byteSize, actual: head.byteSize }
        );
      }
      if (head.sha256?.toLowerCase() !== record.sha256.toLowerCase()) {
        throw new AppError(
          422,
          'ATTACHMENT_HASH_METADATA_MISMATCH',
          'Uploaded object SHA-256 metadata does not match the declared hash'
        );
      }
      if (head.contentType && head.contentType !== record.mimeType) {
        throw new AppError(
          422,
          'ATTACHMENT_CONTENT_TYPE_MISMATCH',
          'Uploaded object content type does not match the declared content type',
          { expected: record.mimeType, actual: head.contentType }
        );
      }
      if (request.body.etag && head.etag && request.body.etag.replaceAll('"', '') !== head.etag) {
        throw new AppError(
          422,
          'ATTACHMENT_ETAG_MISMATCH',
          'Uploaded object ETag does not match the completion request'
        );
      }

      return options.repository.completeAttachment(
        requestContext(request),
        request.params.attachmentId,
        {
          byteSize: head.byteSize,
          contentType: head.contentType,
          etag: head.etag,
          sha256Metadata: head.sha256
        }
      );
    }
  );

  typed.post(
    '/attachments/:attachmentId/reprocess',
    {
      schema: {
        tags: ['Accounting'],
        summary: 'Re-enqueue a failed or pending attachment for safe processing',
        params: AttachmentParamsSchema,
        response: {
          200: AttachmentSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema
        }
      }
    },
    async (request) =>
      options.repository.reprocessAttachment(
        requestContext(request),
        request.params.attachmentId
      )
  );

  typed.post(
    '/attachments/:attachmentId/manual-extraction',
    {
      schema: {
        tags: ['Accounting'],
        summary: 'Submit reviewed structured extraction for a clean attachment',
        params: AttachmentParamsSchema,
        body: ExtractedAccountingDocumentSchema,
        response: {
          200: AccountingDraftDetailSchema.nullable(),
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema
        }
      }
    },
    async (request) =>
      options.repository.submitManualExtraction(
        requestContext(request),
        request.params.attachmentId,
        request.body
      )
  );

  typed.get(
    '/organizations/:organizationId/companies/:companyId/accounting/drafts',
    {
      schema: {
        tags: ['Accounting'],
        summary: 'List reviewable accounting drafts',
        params: CompanyParamsSchema,
        querystring: AccountingDraftListQuerySchema,
        response: {
          200: AccountingDraftListSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema
        }
      }
    },
    async (request) => ({
      items: await options.repository.listDrafts(
        requestContext(request),
        request.params.organizationId,
        request.params.companyId,
        request.query.status,
        request.query.limit
      )
    })
  );

  typed.get(
    '/accounting/drafts/:draftId',
    {
      schema: {
        tags: ['Accounting'],
        summary: 'Get a draft with document, lines, evidence, and review history',
        params: DraftParamsSchema,
        response: {
          200: AccountingDraftDetailSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema
        }
      }
    },
    async (request) => {
      const draft = await options.repository.getDraft(
        requestContext(request),
        request.params.draftId
      );
      if (!draft) {
        throw new AppError(404, 'NOT_FOUND', 'The requested draft was not found');
      }
      return draft;
    }
  );

  typed.post(
    '/accounting/drafts/:draftId/confirm',
    {
      schema: {
        tags: ['Accounting'],
        summary: 'Confirm a pending accounting draft',
        params: DraftParamsSchema,
        body: ConfirmDraftInputSchema,
        response: {
          200: AccountingDraftDetailSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema
        }
      }
    },
    async (request) =>
      options.repository.reviewDraft(
        requestContext(request),
        request.params.draftId,
        {
          action: 'confirmed',
          ...(request.body.note ? { note: request.body.note } : {})
        }
      )
  );

  typed.post(
    '/accounting/drafts/:draftId/reject',
    {
      schema: {
        tags: ['Accounting'],
        summary: 'Reject a pending accounting draft',
        params: DraftParamsSchema,
        body: RejectDraftInputSchema,
        response: {
          200: AccountingDraftDetailSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema
        }
      }
    },
    async (request) =>
      options.repository.reviewDraft(
        requestContext(request),
        request.params.draftId,
        { action: 'rejected', note: request.body.note }
      )
  );

  typed.post(
    '/accounting/drafts/:draftId/correct',
    {
      schema: {
        tags: ['Accounting'],
        summary: 'Replace draft lines with a balanced reviewed correction',
        params: DraftParamsSchema,
        body: CorrectDraftInputSchema,
        response: {
          200: AccountingDraftDetailSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
          422: ErrorResponseSchema
        }
      }
    },
    async (request) =>
      options.repository.reviewDraft(
        requestContext(request),
        request.params.draftId,
        { action: 'corrected', input: request.body }
      )
  );

  typed.post(
    '/organizations/:organizationId/companies/:companyId/cfo/briefs',
    {
      schema: {
        tags: ['CFO'],
        summary: 'Generate a deterministic evidence-linked CFO brief',
        params: CompanyParamsSchema,
        body: CfoBriefCreateInputSchema,
        response: {
          201: CfoBriefSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const brief = await options.repository.createCfoBrief(
        requestContext(request),
        request.params.organizationId,
        request.params.companyId,
        request.body
      );
      return reply.code(201).send(brief);
    }
  );

  typed.get(
    '/cfo/briefs/:briefId',
    {
      schema: {
        tags: ['CFO'],
        summary: 'Get one evidence-linked CFO brief',
        params: CfoBriefParamsSchema,
        response: {
          200: CfoBriefSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema
        }
      }
    },
    async (request) => {
      const brief = await options.repository.getCfoBrief(
        requestContext(request),
        request.params.briefId
      );
      if (!brief) {
        throw new AppError(404, 'NOT_FOUND', 'The requested CFO brief was not found');
      }
      return brief;
    }
  );
};
