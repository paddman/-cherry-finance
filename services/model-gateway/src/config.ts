import { z } from 'zod';

const optionalString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional()
);
const optionalUrl = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().url().optional()
);

const GatewayConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  APP_VERSION: z.string().default('0.1.0'),
  MODEL_GATEWAY_HOST: z.string().default('0.0.0.0'),
  MODEL_GATEWAY_PORT: z.coerce.number().int().min(1).max(65535).default(3100),
  INTERNAL_API_KEY: optionalString,
  LOCAL_CHAT_COMPLETIONS_URL: z
    .string()
    .url()
    .default('http://localhost:8000/v1/chat/completions'),
  LOCAL_CHAT_MODEL: z.string().min(1).default('qwen-local-chat'),
  LOCAL_SYNTHESIS_COMPLETIONS_URL: z
    .string()
    .url()
    .default('http://localhost:8000/v1/chat/completions'),
  LOCAL_SYNTHESIS_MODEL: z.string().min(1).default('qwen-local-synthesis'),
  LOCAL_VISION_COMPLETIONS_URL: z
    .string()
    .url()
    .default('http://localhost:8001/v1/chat/completions'),
  LOCAL_VISION_MODEL: z.string().min(1).default('local-vision'),
  LOCAL_MODEL_API_KEY: optionalString,
  HOSTED_SYNTHESIS_COMPLETIONS_URL: optionalUrl,
  HOSTED_SYNTHESIS_MODEL: optionalString,
  HOSTED_MODEL_API_KEY: optionalString,
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(180_000).default(60_000)
});

export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;

export function loadGatewayConfig(
  environment: NodeJS.ProcessEnv = process.env
): GatewayConfig {
  return GatewayConfigSchema.parse(environment);
}
