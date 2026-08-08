import { z } from 'zod';

export const QueueName = {
  inbox: 'inbox',
  attachments: 'attachments',
  agent: 'agent',
  delivery: 'delivery',
  audit: 'audit'
} as const;

export type QueueName = (typeof QueueName)[keyof typeof QueueName];

export const OutboxPayloadSchema = z.object({
  eventId: z.string().uuid(),
  topic: z.string().min(1),
  aggregateType: z.string().min(1),
  aggregateId: z.string().uuid(),
  traceId: z.string().min(1).optional(),
  payload: z.record(z.string(), z.unknown())
});

export const defaultJobOptions = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 2_000
  },
  removeOnComplete: {
    age: 86_400,
    count: 2_000
  },
  removeOnFail: false
} as const;
