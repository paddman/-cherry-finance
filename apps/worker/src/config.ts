import { z } from 'zod';

const WorkerConfigSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgres://cherryfin:cherryfin@localhost:5432/cherryfin'),
  REDIS_URL: z.string().url().default('redis://localhost:6379/0'),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(250).max(60_000).default(2_000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(250).default(25)
});

export type WorkerConfig = z.infer<typeof WorkerConfigSchema>;

export function loadWorkerConfig(
  environment: NodeJS.ProcessEnv = process.env
): WorkerConfig {
  return WorkerConfigSchema.parse(environment);
}
