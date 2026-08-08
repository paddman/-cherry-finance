import { z } from 'zod';
import { UuidSchema } from './common.js';

export const CompanyParamsSchema = z.object({
  organizationId: UuidSchema,
  companyId: UuidSchema
});

export const AttachmentParamsSchema = z.object({
  attachmentId: UuidSchema
});

export const DraftParamsSchema = z.object({
  draftId: UuidSchema
});

export const CfoBriefParamsSchema = z.object({
  briefId: UuidSchema
});

export const AttachmentCreateInputSchema = z.object({
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: z.enum([
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/json'
  ]),
  byteSize: z.number().int().min(1).max(26_214_400),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i)
});
export type AttachmentCreateInput = z.infer<typeof AttachmentCreateInputSchema>;

export const AttachmentSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  companyId: UuidSchema,
  originalFilename: z.string(),
  mimeType: z.string(),
  byteSize: z.number().int(),
  sha256: z.string(),
  scanStatus: z.enum(['pending', 'clean', 'infected', 'failed']),
  extractStatus: z.enum(['pending', 'processing', 'done', 'failed']),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type Attachment = z.infer<typeof AttachmentSchema>;

export const AttachmentUploadSchema = z.object({
  attachment: AttachmentSchema,
  upload: z.object({
    method: z.literal('PUT'),
    url: z.string().url(),
    headers: z.record(z.string(), z.string()),
    expiresAt: z.string().datetime()
  })
});
export type AttachmentUpload = z.infer<typeof AttachmentUploadSchema>;

export const AttachmentCompleteInputSchema = z.object({
  etag: z.string().trim().min(1).max(200).optional()
});

export const AttachmentListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const AttachmentListSchema = z.object({
  items: z.array(AttachmentSchema)
});

export const AccountingDocumentSchema = z.object({
  id: UuidSchema,
  attachmentId: UuidSchema,
  documentType: z.enum([
    'invoice',
    'receipt',
    'statement',
    'wht_certificate',
    'accounting_export',
    'other'
  ]),
  documentNumber: z.string().nullable(),
  issueDate: z.string().nullable(),
  counterpartyName: z.string().nullable(),
  counterpartyTaxId: z.string().nullable(),
  currency: z.string(),
  subtotal: z.string().nullable(),
  vatAmount: z.string().nullable(),
  withholdingTaxAmount: z.string().nullable(),
  totalAmount: z.string().nullable(),
  extractedFields: z.record(z.string(), z.unknown()),
  validationResults: z.record(z.string(), z.unknown()),
  status: z.enum(['extracted', 'needs_review', 'reviewed', 'rejected']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type AccountingDocument = z.infer<typeof AccountingDocumentSchema>;

export const AccountingDraftLineSchema = z.object({
  id: UuidSchema,
  lineNumber: z.number().int().positive(),
  accountCode: z.string(),
  accountName: z.string(),
  description: z.string().nullable(),
  debit: z.string(),
  credit: z.string(),
  taxCode: z.string().nullable(),
  dimensions: z.record(z.string(), z.string())
});
export type AccountingDraftLine = z.infer<typeof AccountingDraftLineSchema>;

export const EvidenceLinkSchema = z.object({
  id: UuidSchema,
  fieldName: z.string(),
  pageNumber: z.number().int().nullable(),
  boundingBox: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number()
    })
    .nullable(),
  extractedValue: z.string().nullable(),
  confidence: z.string().nullable()
});

export const ReviewEventSchema = z.object({
  id: UuidSchema,
  reviewerUserId: UuidSchema,
  action: z.enum(['confirmed', 'corrected', 'rejected']),
  note: z.string().nullable(),
  createdAt: z.string().datetime()
});

export const AccountingDraftSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  companyId: UuidSchema,
  documentId: UuidSchema,
  confidence: z.enum(['high', 'medium', 'low']),
  status: z.enum(['pending', 'confirmed', 'corrected', 'rejected']),
  version: z.number().int().positive(),
  totalDebit: z.string(),
  totalCredit: z.string(),
  reviewNote: z.string().nullable(),
  reviewedBy: UuidSchema.nullable(),
  reviewedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type AccountingDraft = z.infer<typeof AccountingDraftSchema>;

export const AccountingDraftDetailSchema = AccountingDraftSchema.extend({
  document: AccountingDocumentSchema,
  attachment: AttachmentSchema,
  lines: z.array(AccountingDraftLineSchema),
  evidence: z.array(EvidenceLinkSchema),
  reviewEvents: z.array(ReviewEventSchema)
});
export type AccountingDraftDetail = z.infer<
  typeof AccountingDraftDetailSchema
>;

export const AccountingDraftListQuerySchema = z.object({
  status: z
    .enum(['pending', 'confirmed', 'corrected', 'rejected'])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const AccountingDraftListSchema = z.object({
  items: z.array(AccountingDraftSchema)
});

const CorrectedDraftLineInputSchema = z
  .object({
    lineNumber: z.number().int().positive(),
    accountCode: z.string().trim().min(1).max(50),
    accountName: z.string().trim().min(1).max(200),
    description: z.string().trim().max(500).nullable().optional(),
    debit: z.string().regex(/^\d+(?:\.\d{1,4})?$/),
    credit: z.string().regex(/^\d+(?:\.\d{1,4})?$/),
    taxCode: z.string().trim().max(50).nullable().optional(),
    dimensions: z.record(z.string(), z.string()).default({})
  })
  .refine(
    (line) =>
      (Number(line.debit) > 0 && Number(line.credit) === 0) ||
      (Number(line.credit) > 0 && Number(line.debit) === 0),
    'Each line must contain either a debit or a credit, not both'
  );

export const ConfirmDraftInputSchema = z.object({
  note: z.string().trim().max(2_000).optional()
});

export const RejectDraftInputSchema = z.object({
  note: z.string().trim().min(1).max(2_000)
});

export const CorrectDraftInputSchema = z.object({
  note: z.string().trim().min(1).max(2_000),
  document: z
    .object({
      documentNumber: z.string().trim().max(200).nullable().optional(),
      issueDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .optional(),
      counterpartyName: z.string().trim().max(500).nullable().optional(),
      counterpartyTaxId: z
        .string()
        .regex(/^\d{10,13}$/)
        .nullable()
        .optional()
    })
    .optional(),
  lines: z.array(CorrectedDraftLineInputSchema).min(2).max(100)
});
export type CorrectDraftInput = z.infer<typeof CorrectDraftInputSchema>;

export const CfoBriefCreateInputSchema = z
  .object({
    periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    currency: z
      .string()
      .trim()
      .length(3)
      .default('THB')
      .transform((value) => value.toUpperCase())
  })
  .refine((value) => value.periodEnd >= value.periodStart, {
    path: ['periodEnd'],
    message: 'periodEnd must be on or after periodStart'
  });
export type CfoBriefCreateInput = z.infer<typeof CfoBriefCreateInputSchema>;

export const CfoBriefSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  companyId: UuidSchema,
  periodStart: z.string(),
  periodEnd: z.string(),
  currency: z.string(),
  status: z.enum(['draft', 'final']),
  inputs: z.record(z.string(), z.unknown()),
  sections: z.record(z.string(), z.unknown()),
  calculationVersions: z.record(z.string(), z.unknown()),
  generatedBy: UuidSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type CfoBrief = z.infer<typeof CfoBriefSchema>;

export const WorkerExtractionResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('processing'),
    scanStatus: z.literal('pending'),
    processor: z.object({
      startedAt: z.string().datetime()
    })
  }),
  z.object({
    status: z.literal('completed'),
    scanStatus: z.literal('clean'),
    extraction: z.record(z.string(), z.unknown()),
    processor: z.object({
      scanMethod: z.string(),
      extractionMethod: z.string(),
      durationMs: z.number().nonnegative()
    })
  }),
  z.object({
    status: z.literal('infected'),
    scanStatus: z.literal('infected'),
    signature: z.string().nullable().optional(),
    processor: z.object({
      scanMethod: z.string(),
      durationMs: z.number().nonnegative()
    })
  }),
  z.object({
    status: z.literal('failed'),
    scanStatus: z.enum(['clean', 'failed']),
    errorCode: z.string(),
    message: z.string(),
    processor: z.object({
      scanMethod: z.string(),
      extractionMethod: z.string().optional(),
      durationMs: z.number().nonnegative()
    })
  })
]);
export type WorkerExtractionResult = z.infer<typeof WorkerExtractionResultSchema>;
