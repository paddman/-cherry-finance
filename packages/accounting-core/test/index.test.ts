import { describe, expect, it } from 'vitest';
import {
  ExtractedAccountingDocumentSchema,
  proposeDraft,
  validateExtraction
} from '../src/index.js';

function purchaseInvoice() {
  return ExtractedAccountingDocumentSchema.parse({
    schemaVersion: '1.0',
    documentType: 'invoice',
    direction: 'purchase',
    documentNumber: 'INV-1001',
    issueDate: '2026-08-08',
    counterpartyName: 'Synthetic Supplier Co., Ltd.',
    counterpartyTaxId: '0105559999999',
    currency: 'THB',
    subtotal: '1000',
    vatAmount: '70',
    withholdingTaxAmount: null,
    totalAmount: '1070',
    description: 'Synthetic cloud service invoice',
    confidence: 'high',
    extractionMethod: 'manual',
    fields: [],
    raw: {}
  });
}

describe('accounting core', () => {
  it('validates invoice arithmetic deterministically', () => {
    const result = validateExtraction(purchaseInvoice());
    expect(result.validForDraft).toBe(true);
    expect(result.normalized.totalAmount).toBe('1070.0000');
  });

  it('proposes a balanced purchase invoice draft', () => {
    const draft = proposeDraft(purchaseInvoice());
    expect(draft).not.toBeNull();
    expect(draft?.totalDebit).toBe('1070.0000');
    expect(draft?.totalCredit).toBe('1070.0000');
    expect(draft?.lines).toHaveLength(3);
    expect(draft?.lines.map((line) => line.accountCode)).toEqual([
      '5100',
      '1150',
      '2100'
    ]);
  });

  it('refuses a draft when extracted arithmetic conflicts', () => {
    const invalid = {
      ...purchaseInvoice(),
      totalAmount: '999.00'
    };
    expect(validateExtraction(invalid).validForDraft).toBe(false);
    expect(proposeDraft(invalid)).toBeNull();
  });

  it('does not guess purchase versus sale when direction is unknown', () => {
    const ambiguous = { ...purchaseInvoice(), direction: 'unknown' as const };
    expect(validateExtraction(ambiguous).validForDraft).toBe(false);
    expect(proposeDraft(ambiguous)).toBeNull();
  });
});
