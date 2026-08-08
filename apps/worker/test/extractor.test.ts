import { describe, expect, it } from 'vitest';
import type { WorkerConfig } from '../src/config.js';
import { extractDocument } from '../src/extractor.js';

const config = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://unused',
  REDIS_URL: 'redis://localhost:6379/0',
  OUTBOX_POLL_INTERVAL_MS: 2_000,
  OUTBOX_BATCH_SIZE: 25,
  ATTACHMENT_CONCURRENCY: 2,
  OBJECT_STORAGE_ENDPOINT: 'http://localhost:9000',
  OBJECT_STORAGE_REGION: 'us-east-1',
  OBJECT_STORAGE_BUCKET: 'test',
  OBJECT_STORAGE_ACCESS_KEY: 'test',
  OBJECT_STORAGE_SECRET_KEY: 'test-secret',
  MODEL_GATEWAY_URL: 'http://localhost:3100',
  API_INTERNAL_URL: 'http://localhost:3000',
  SCAN_MODE: 'development',
  CLAMAV_HOST: 'localhost',
  CLAMAV_PORT: 3310,
  CLAMAV_TIMEOUT_MS: 30_000,
  MODEL_TIMEOUT_MS: 1_000,
  MAX_INLINE_IMAGE_BYTES: 6_000_000
} satisfies WorkerConfig;

describe('accounting document extraction', () => {
  it('accepts a deterministic synthetic JSON fixture without a model call', async () => {
    const buffer = Buffer.from(
      JSON.stringify({
        schemaVersion: '1.0',
        documentType: 'invoice',
        direction: 'purchase',
        documentNumber: 'SYN-001',
        issueDate: '2026-08-08',
        counterpartyName: 'Synthetic Vendor Co., Ltd.',
        counterpartyTaxId: '0105559999999',
        currency: 'THB',
        subtotal: '1000.00',
        vatAmount: '70.00',
        withholdingTaxAmount: null,
        totalAmount: '1070.00',
        description: 'Synthetic service invoice',
        confidence: 'high',
        extractionMethod: 'json',
        fields: [],
        raw: { synthetic: true }
      })
    );

    const result = await extractDocument(
      buffer,
      'application/json',
      config,
      'trace-test'
    );

    expect(result).toMatchObject({
      documentNumber: 'SYN-001',
      totalAmount: '1070.00',
      extractionMethod: 'json'
    });
  });
});
