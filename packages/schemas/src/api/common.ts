import { z } from 'zod';

export const UuidSchema = z.string().uuid();
export const IsoDateTimeSchema = z.string().datetime({ offset: true });

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    traceId: z.string().min(1),
    details: z.record(z.string(), z.unknown()).optional()
  })
});

export const HealthStatusSchema = z.enum(['ok', 'degraded', 'down']);

export const HealthComponentSchema = z.object({
  status: HealthStatusSchema,
  latencyMs: z.number().int().nonnegative().optional(),
  message: z.string().optional()
});

export const HealthResponseSchema = z.object({
  status: HealthStatusSchema,
  service: z.string().min(1),
  version: z.string().min(1),
  timestamp: IsoDateTimeSchema,
  components: z.record(z.string(), HealthComponentSchema).optional()
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
