import { z } from 'zod';

const optionalString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional()
);

const WorkerConfigSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z
      .string()
      .min(1)
      .default('postgres://cherryfin:cherryfin@localhost:5432/cherryfin'),
    REDIS_URL: z.string().url().default('redis://localhost:6379/0'),
    OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(250).max(60_000).default(2_000),
    OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(250).default(25),
    ATTACHMENT_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
    OBJECT_STORAGE_ENDPOINT: z.string().url().default('http://localhost:9000'),
    OBJECT_STORAGE_REGION: z.string().min(1).default('us-east-1'),
    OBJECT_STORAGE_BUCKET: z.string().min(3).default('cherryfin-private'),
    OBJECT_STORAGE_ACCESS_KEY: z.string().min(1).default('cherryfin'),
    OBJECT_STORAGE_SECRET_KEY: z.string().min(8).default('cherryfin-minio-change-me'),
    MODEL_GATEWAY_URL: z.string().url().default('http://localhost:3100'),
    API_INTERNAL_URL: z.string().url().default('http://localhost:3000'),
    INTERNAL_API_KEY: optionalString,
    SCAN_MODE: z.enum(['development', 'clamav']).default('development'),
    CLAMAV_HOST: z.string().min(1).default('localhost'),
    CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
    CLAMAV_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
    MODEL_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(180_000).default(90_000),
    MAX_INLINE_IMAGE_BYTES: z.coerce.number().int().min(100_000).max(8_000_000).default(6_000_000)
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'production' && !value.INTERNAL_API_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['INTERNAL_API_KEY'],
        message: 'INTERNAL_API_KEY is required in production'
      });
    }
    if (value.NODE_ENV === 'production' && value.SCAN_MODE !== 'clamav') {
      context.addIssue({
        code: 'custom',
        path: ['SCAN_MODE'],
        message: 'SCAN_MODE=clamav is required in production'
      });
    }
  });

export type WorkerConfig = z.infer<typeof WorkerConfigSchema>;

export function loadWorkerConfig(
  environment: NodeJS.ProcessEnv = process.env
): WorkerConfig {
  return WorkerConfigSchema.parse(environment);
}
