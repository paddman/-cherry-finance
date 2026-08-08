import {
  addMoney,
  normalizeMoney,
  subtractMoney
} from '@cherryfin/finance-math';
import { z } from 'zod';

const DecimalStringSchema = z
  .string()
  .trim()
  .regex(/^-?\d+(?:\.\d{1,8})?$/, 'Expected a decimal string');

const NullableDecimalStringSchema = DecimalStringSchema.nullable().optional();
const NullableTextSchema = z.string().trim().min(1).max(500).nullable().optional();

export const DocumentTypeSchema = z.enum([
  'invoice',
  'receipt',
  'statement',
  'wht_certificate',
  'accounting_export',
  'other'
]);
export type DocumentType = z.infer<typeof DocumentTypeSchema>;

export const DocumentDirectionSchema = z.enum(['purchase', 'sale', 'unknown']);
export type DocumentDirection = z.infer<typeof DocumentDirectionSchema>;

export const ExtractionConfidenceSchema = z.enum(['high', 'medium', 'low']);
export type ExtractionConfidence = z.infer<typeof ExtractionConfidenceSchema>;

export const EvidenceFieldSchema = z.object({
  fieldName: z.string().trim().min(1).max(100),
  value: z.string().max(2_000).nullable().optional(),
  pageNumber: z.number().int().positive().nullable().optional(),
  boundingBox: z
    .object({
      x: z.number().min(0),
      y: z.number().min(0),
      width: z.number().positive(),
      height: z.number().positive()
    })
    .nullable()
    .optional(),
  confidence: z.number().min(0).max(1).nullable().optional()
});
export type EvidenceField = z.infer<typeof EvidenceFieldSchema>;

export const ExtractedAccountingDocumentSchema = z.object({
  schemaVersion: z.literal('1.0').default('1.0'),
  documentType: DocumentTypeSchema,
  direction: DocumentDirectionSchema.default('unknown'),
  documentNumber: NullableTextSchema,
  issueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  counterpartyName: NullableTextSchema,
  counterpartyTaxId: z
    .string()
    .trim()
    .regex(/^\d{10,13}$/)
    .nullable()
    .optional(),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  subtotal: NullableDecimalStringSchema,
  vatAmount: NullableDecimalStringSchema,
  withholdingTaxAmount: NullableDecimalStringSchema,
  totalAmount: NullableDecimalStringSchema,
  description: NullableTextSchema,
  confidence: ExtractionConfidenceSchema,
  extractionMethod: z.enum(['vision', 'pdf_text', 'text', 'json', 'manual']),
  fields: z.array(EvidenceFieldSchema).default([]),
  raw: z.record(z.string(), z.unknown()).default({})
});
export type ExtractedAccountingDocument = z.infer<
  typeof ExtractedAccountingDocumentSchema
>;

export interface ValidationFinding {
  code: string;
  severity: 'info' | 'warning' | 'error';
  field?: string;
  message: string;
}

export interface ExtractionValidation {
  validForDraft: boolean;
  findings: ValidationFinding[];
  normalized: {
    subtotal: string | null;
    vatAmount: string | null;
    withholdingTaxAmount: string | null;
    totalAmount: string | null;
  };
}

export interface DraftLineProposal {
  lineNumber: number;
  accountCode: string;
  accountName: string;
  description: string;
  debit: string;
  credit: string;
  taxCode: string | null;
  dimensions: Record<string, string>;
  evidenceFields: string[];
}

export interface DraftProposal {
  confidence: ExtractionConfidence;
  totalDebit: string;
  totalCredit: string;
  lines: DraftLineProposal[];
  assumptions: string[];
}

function normalized(value: string | null | undefined): string | null {
  return value === null || value === undefined ? null : normalizeMoney(value, 4);
}

function isZero(value: string): boolean {
  return /^-?0+(?:\.0+)?$/.test(value);
}

function isNegative(value: string): boolean {
  return value.startsWith('-') && !isZero(value);
}

function nonZero(value: string | null): value is string {
  return value !== null && !isZero(value);
}

function derivedSubtotal(total: string, vat: string | null): string {
  return vat ? subtractMoney(total, vat, 4) : total;
}

export function validateExtraction(
  input: ExtractedAccountingDocument
): ExtractionValidation {
  const subtotal = normalized(input.subtotal);
  const vatAmount = normalized(input.vatAmount);
  const withholdingTaxAmount = normalized(input.withholdingTaxAmount);
  const totalAmount = normalized(input.totalAmount);
  const findings: ValidationFinding[] = [];

  for (const [field, value] of [
    ['subtotal', subtotal],
    ['vatAmount', vatAmount],
    ['withholdingTaxAmount', withholdingTaxAmount],
    ['totalAmount', totalAmount]
  ] as const) {
    if (value !== null && isNegative(value)) {
      findings.push({
        code: 'NEGATIVE_AMOUNT',
        severity: 'error',
        field,
        message: `${field} must not be negative`
      });
    }
  }

  if (!totalAmount) {
    findings.push({
      code: 'TOTAL_AMOUNT_MISSING',
      severity: 'error',
      field: 'totalAmount',
      message: 'Total amount is required before a journal draft can be proposed'
    });
  }

  if (!input.issueDate) {
    findings.push({
      code: 'ISSUE_DATE_MISSING',
      severity: 'warning',
      field: 'issueDate',
      message: 'Issue date is missing and must be reviewed'
    });
  }

  if (!input.counterpartyName) {
    findings.push({
      code: 'COUNTERPARTY_MISSING',
      severity: 'warning',
      field: 'counterpartyName',
      message: 'Counterparty name is missing and must be reviewed'
    });
  }

  if (input.direction === 'unknown') {
    findings.push({
      code: 'DIRECTION_UNKNOWN',
      severity: 'error',
      field: 'direction',
      message: 'Purchase or sale direction could not be determined and must be reviewed before drafting'
    });
  }

  if (subtotal && totalAmount) {
    const expected = addMoney([subtotal, vatAmount ?? '0'], 4);
    if (expected !== totalAmount) {
      findings.push({
        code: 'ARITHMETIC_MISMATCH',
        severity: 'error',
        field: 'totalAmount',
        message: `Subtotal plus VAT (${expected}) does not equal total (${totalAmount})`
      });
    }
  }

  return {
    validForDraft: !findings.some((finding) => finding.severity === 'error'),
    findings,
    normalized: {
      subtotal,
      vatAmount,
      withholdingTaxAmount,
      totalAmount
    }
  };
}

function line(
  lineNumber: number,
  accountCode: string,
  accountName: string,
  description: string,
  side: 'debit' | 'credit',
  amount: string,
  taxCode: string | null,
  evidenceFields: string[]
): DraftLineProposal {
  return {
    lineNumber,
    accountCode,
    accountName,
    description,
    debit: side === 'debit' ? amount : '0.0000',
    credit: side === 'credit' ? amount : '0.0000',
    taxCode,
    dimensions: {},
    evidenceFields
  };
}

export function proposeDraft(
  input: ExtractedAccountingDocument
): DraftProposal | null {
  if (!['invoice', 'receipt'].includes(input.documentType)) {
    return null;
  }
  if (input.direction === 'unknown') {
    return null;
  }

  const validation = validateExtraction(input);
  if (!validation.validForDraft || !validation.normalized.totalAmount) {
    return null;
  }

  const total = validation.normalized.totalAmount;
  const vat = validation.normalized.vatAmount;
  const wht = validation.normalized.withholdingTaxAmount;
  const subtotal =
    validation.normalized.subtotal ?? derivedSubtotal(total, vat);
  const direction = input.direction;
  const isReceipt = input.documentType === 'receipt';
  const description =
    input.description ??
    `${input.documentType} ${input.documentNumber ?? 'without number'}`;
  const assumptions: string[] = [];
  const lines: DraftLineProposal[] = [];
  let lineNumber = 1;

  if (direction === 'purchase') {
    lines.push(
      line(
        lineNumber++,
        '5100',
        'Operating expense',
        description,
        'debit',
        subtotal,
        null,
        ['subtotal', 'totalAmount']
      )
    );
    if (nonZero(vat)) {
      lines.push(
        line(
          lineNumber++,
          '1150',
          'Input VAT',
          description,
          'debit',
          vat,
          'VAT_IN',
          ['vatAmount']
        )
      );
    }

    if (isReceipt) {
      const paid = nonZero(wht) ? subtractMoney(total, wht, 4) : total;
      lines.push(
        line(
          lineNumber++,
          '1100',
          'Cash at bank',
          description,
          'credit',
          paid,
          null,
          ['totalAmount', 'withholdingTaxAmount']
        )
      );
      if (nonZero(wht)) {
        lines.push(
          line(
            lineNumber++,
            '2150',
            'Withholding tax payable',
            description,
            'credit',
            wht,
            'WHT_PAYABLE',
            ['withholdingTaxAmount']
          )
        );
      }
    } else {
      lines.push(
        line(
          lineNumber++,
          '2100',
          'Accounts payable',
          description,
          'credit',
          total,
          null,
          ['totalAmount']
        )
      );
      if (nonZero(wht)) {
        assumptions.push(
          'Withholding tax was detected but is not posted on a purchase invoice until settlement is reviewed.'
        );
      }
    }
  } else {
    if (isReceipt) {
      const received = nonZero(wht) ? subtractMoney(total, wht, 4) : total;
      lines.push(
        line(
          lineNumber++,
          '1100',
          'Cash at bank',
          description,
          'debit',
          received,
          null,
          ['totalAmount', 'withholdingTaxAmount']
        )
      );
      if (nonZero(wht)) {
        lines.push(
          line(
            lineNumber++,
            '1250',
            'Withholding tax receivable',
            description,
            'debit',
            wht,
            'WHT_RECEIVABLE',
            ['withholdingTaxAmount']
          )
        );
      }
    } else {
      lines.push(
        line(
          lineNumber++,
          '1200',
          'Accounts receivable',
          description,
          'debit',
          total,
          null,
          ['totalAmount']
        )
      );
    }

    lines.push(
      line(
        lineNumber++,
        '4100',
        'Revenue',
        description,
        'credit',
        subtotal,
        null,
        ['subtotal', 'totalAmount']
      )
    );
    if (nonZero(vat)) {
      lines.push(
        line(
          lineNumber++,
          '2151',
          'Output VAT',
          description,
          'credit',
          vat,
          'VAT_OUT',
          ['vatAmount']
        )
      );
    }
  }

  const totalDebit = addMoney(lines.map((item) => item.debit), 4);
  const totalCredit = addMoney(lines.map((item) => item.credit), 4);
  if (totalDebit !== totalCredit) {
    throw new Error(
      `Proposed journal is unbalanced: debit ${totalDebit}, credit ${totalCredit}`
    );
  }

  return {
    confidence: input.confidence,
    totalDebit,
    totalCredit,
    lines,
    assumptions
  };
}

export const ExtractionPrompt = `You extract Thai accounting documents. Return one JSON object only, without markdown. Use schemaVersion "1.0". Required fields: documentType (invoice|receipt|statement|wht_certificate|accounting_export|other), direction (purchase|sale|unknown), documentNumber, issueDate YYYY-MM-DD, counterpartyName, counterpartyTaxId, currency, subtotal, vatAmount, withholdingTaxAmount, totalAmount, description, confidence (high|medium|low), extractionMethod, fields, raw. Money values must be decimal strings without thousands separators. Unknown values must be null. Do not invent unreadable values. fields contains evidence objects with fieldName, value, pageNumber, boundingBox and confidence.`;
