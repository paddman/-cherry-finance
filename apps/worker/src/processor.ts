import type { WorkerExtractionResult } from '@cherryfin/schemas/api';
import { OutboxPayloadSchema } from '@cherryfin/schemas/jobs';
import type { Job } from 'bullmq';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { WorkerConfig } from './config.js';
import { extractDocument } from './extractor.js';
import { scanBuffer } from './scanner.js';
import type { WorkerObjectStorage } from './storage.js';

const AttachmentPayloadSchema = z.object({
  attachmentId: z.string().uuid(),
  organizationId: z.string().uuid(),
  companyId: z.string().uuid(),
  objectKey: z.string().min(1),
  mimeType: z.string().min(1),
  originalFilename: z.string().min(1),
  byteSize: z.number().int().min(1).max(26_214_400),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i)
});

async function postResult(
  config: WorkerConfig,
  attachmentId: string,
  traceId: string,
  result: WorkerExtractionResult
): Promise<void> {
  const headers = new Headers({
    'content-type': 'application/json',
    'x-trace-id': traceId
  });
  if (config.INTERNAL_API_KEY) {
    headers.set('x-internal-api-key', config.INTERNAL_API_KEY);
  }
  const response = await fetch(
    new URL(
      `/internal/v1/attachments/${attachmentId}/extraction-result`,
      config.API_INTERNAL_URL
    ),
    {
      method: 'POST',
      headers,
      body: JSON.stringify(result)
    }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Internal extraction callback failed HTTP ${response.status}: ${text.slice(0, 500)}`
    );
  }
}

class CallbackDeliveryError extends Error {
  constructor(readonly callbackCause: unknown) {
    super('Internal callback delivery failed');
    this.name = 'CallbackDeliveryError';
  }
}

function errorCode(message: string): { code: string; permanent: boolean } {
  if (message.startsWith('Unsupported extraction media type:')) {
    return { code: 'UNSUPPORTED_MEDIA_TYPE', permanent: true };
  }
  if (message.startsWith('Object SHA-256')) {
    return { code: 'ATTACHMENT_HASH_MISMATCH', permanent: true };
  }
  if (message.startsWith('Downloaded byte size')) {
    return { code: 'ATTACHMENT_SIZE_MISMATCH', permanent: true };
  }
  if (message.includes('Unexpected ClamAV response')) {
    return { code: 'MALWARE_SCANNER_FAILED', permanent: false };
  }
  return { code: 'ATTACHMENT_PROCESSING_FAILED', permanent: false };
}

export function createAttachmentProcessor(
  config: WorkerConfig,
  storage: WorkerObjectStorage
): (job: Job) => Promise<void> {
  return async (job) => {
    const envelope = OutboxPayloadSchema.parse(job.data);
    if (envelope.topic !== 'attachment.process') {
      throw new Error(`Unsupported attachment queue topic: ${envelope.topic}`);
    }
    const payload = AttachmentPayloadSchema.parse(envelope.payload);
    const traceId = envelope.traceId ?? `attachment-${payload.attachmentId}`;
    const startedAt = performance.now();
    let scanMethod = config.SCAN_MODE;
    let scanPassed = false;

    await postResult(config, payload.attachmentId, traceId, {
      status: 'processing',
      scanStatus: 'pending',
      processor: { startedAt: new Date().toISOString() }
    });

    try {
      const buffer = await storage.read(payload.objectKey, payload.byteSize);
      if (buffer.byteLength !== payload.byteSize) {
        throw new Error(
          `Downloaded byte size ${buffer.byteLength} does not match expected ${payload.byteSize}`
        );
      }
      const actualSha256 = createHash('sha256').update(buffer).digest('hex');
      if (actualSha256 !== payload.sha256.toLowerCase()) {
        throw new Error(
          `Object SHA-256 ${actualSha256} does not match expected ${payload.sha256.toLowerCase()}`
        );
      }

      const scan = await scanBuffer(buffer, config);
      scanMethod = scan.method;
      if (!scan.clean) {
        await postResult(config, payload.attachmentId, traceId, {
          status: 'infected',
          scanStatus: 'infected',
          signature: scan.signature ?? null,
          processor: {
            scanMethod: scan.method,
            durationMs: Math.round(performance.now() - startedAt)
          }
        }).catch((callbackError) => {
          throw new CallbackDeliveryError(callbackError);
        });
        return;
      }
      scanPassed = true;

      const extraction = await extractDocument(
        buffer,
        payload.mimeType,
        config,
        traceId
      );
      await postResult(config, payload.attachmentId, traceId, {
        status: 'completed',
        scanStatus: 'clean',
        extraction,
        processor: {
          scanMethod: scan.method,
          extractionMethod: extraction.extractionMethod,
          durationMs: Math.round(performance.now() - startedAt)
        }
      }).catch((callbackError) => {
        throw new CallbackDeliveryError(callbackError);
      });
    } catch (error) {
      if (error instanceof CallbackDeliveryError) {
        throw error.callbackCause;
      }
      const message = error instanceof Error ? error.message : String(error);
      const classification = errorCode(message);
      await postResult(config, payload.attachmentId, traceId, {
        status: 'failed',
        scanStatus: scanPassed ? 'clean' : 'failed',
        errorCode: classification.code,
        message: message.slice(0, 2_000),
        processor: {
          scanMethod,
          durationMs: Math.round(performance.now() - startedAt)
        }
      });
      if (!classification.permanent) {
        throw error;
      }
    }
  };
}
