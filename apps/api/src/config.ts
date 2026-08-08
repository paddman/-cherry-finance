import { z } from 'zod';

const optionalNonEmptyString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional()
);

const ApiConfigSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    APP_VERSION: z.string().default('0.1.0'),
    API_HOST: z.string().default('0.0.0.0'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z
      .string()
      .min(1)
      .default('postgres://cherryfin:cherryfin@localhost:5432/cherryfin'),
    REDIS_URL: z.string().url().default('redis://localhost:6379/0'),
    OBJECT_STORAGE_ENDPOINT: z.string().url().default('http://localhost:9000'),
    MODEL_GATEWAY_URL: z.string().url().default('http://localhost:3100'),
    INTERNAL_API_KEY: optionalNonEmptyString,
    READINESS_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(2_000),
    AUTH_MODE: z.enum(['development', 'jwt']).default('development'),
    DEV_USER_ID: z
      .string()
      .uuid()
      .default('018f0000-0000-7000-8000-000000000001'),
    DEV_USER_EMAIL: z.string().email().default('developer@cherryfin.local'),
    DEV_USER_DISPLAY_NAME: z.string().min(1).default('CherryFin Developer'),
    JWT_PUBLIC_KEY_PEM: optionalNonEmptyString,
    JWT_ISSUER: z.string().min(1).default('cherryfin'),
    JWT_AUDIENCE: z.string().min(1).default('cherryfin-api'),
    OPENAPI_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true')
  })
  .superRefine((value, context) => {
    if (value.AUTH_MODE === 'jwt' && !value.JWT_PUBLIC_KEY_PEM) {
      context.addIssue({
        code: 'custom',
        path: ['JWT_PUBLIC_KEY_PEM'],
        message: 'JWT_PUBLIC_KEY_PEM is required when AUTH_MODE=jwt'
      });
    }
  });

export type ApiConfig = z.infer<typeof ApiConfigSchema>;

export function loadApiConfig(
  environment: NodeJS.ProcessEnv = process.env
): ApiConfig {
  return ApiConfigSchema.parse(environment);
}
