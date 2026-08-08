import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkerConfig } from '../src/config.js';
import { createAttachmentProcessor } from '../src/processor.js';
import type { WorkerObjectStorage } from '../src/storage.js';

const attachmentId = '018f0000-0000-7000-8000-000000000030';
const organizationId = '018f0000-0000-7000-8000-000000000010';
const companyId = '018f0000-0000-7000-8000-000000000020';

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
  INTERNAL_API_KEY: 'test-key',
  SCAN_MODE: 'development',
  CLAMAV_HOST: 'localhost',
  CLAMAV_PORT: 3310,
  CLAMAV_TIMEOUT_MS: 30_000,
  MODEL_TIMEOUT_MS: 1_000,
  MAX_INLINE_IMAGE_BYTES: 6_000_000
} satisfies WorkerConfig;

afterEach(() => {
  vi.unstubAllGlobals();
});

function jobData(buffer: Buffer, sha256 = createHash('sha256').update(buffer).digest('hex')) {
  return {
    data: {
      eventId: '018f0000-0000-7000-8000-000000000040',
      topic: 'attachment.process',
      aggregateType: 'attachment',
      aggregateId: attachmentId,
      traceId: 'trace-test',
      payload: {
        attachmentId,
        organizationId,
        companyId,
        objectKey: 'synthetic.json',
        mimeType: 'application/json',
        originalFilename: 'synthetic.json',
        byteSize: buffer.byteLength,
        sha256
      }
    }
  };
}

function storage(buffer: Buffer): WorkerObjectStorage {
  return {
    read: vi.fn(async () => buffer)
  } as unknown as WorkerObjectStorage;
}

function mockCallbacks() {
  const calls: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: unknown, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body ?? '{}')) as unknown);
      return new Response(JSON.stringify({ accepted: true }), {
        status: 202,
        headers: { 'content-type': 'application/json' }
      });
    })
  );
  return calls;
}

describe('attachment processor', () => {
  it('rejects an object whose downloaded SHA-256 differs from the declaration', async () => {
    const buffer = Buffer.from('synthetic content');
    const calls = mockCallbacks();
    const processor = createAttachmentProcessor(config, storage(buffer));

    await processor(jobData(buffer, 'a'.repeat(64)) as never);

    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({
      status: 'failed',
      errorCode: 'ATTACHMENT_HASH_MISMATCH'
    });
  });

  it('processes a deterministic JSON document without calling a model', async () => {
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
        description: 'Synthetic invoice',
        confidence: 'high',
        extractionMethod: 'json',
        fields: [],
        raw: { synthetic: true }
      })
    );
    const calls = mockCallbacks();
    const processor = createAttachmentProcessor(config, storage(buffer));

    await processor(jobData(buffer) as never);

    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({
      status: 'completed',
      scanStatus: 'clean',
      extraction: { documentNumber: 'SYN-001', totalAmount: '1070.00' }
    });
  });
});
