import { elapsedMilliseconds, fetchWithTimeout } from '@cherryfin/observability';
import type { HealthResponse } from '@cherryfin/schemas/api';
import type { Redis } from 'ioredis';
import type { ApiConfig } from './config.js';
import type { DatabaseResources } from './database.js';

export type ReadinessCheck = () => Promise<HealthResponse>;

async function checkComponent(
  operation: () => Promise<void>
): Promise<{ status: 'ok' | 'down'; latencyMs: number; message?: string }> {
  const startedAt = performance.now();
  try {
    await operation();
    return {
      status: 'ok',
      latencyMs: elapsedMilliseconds(startedAt)
    };
  } catch (error) {
    return {
      status: 'down',
      latencyMs: elapsedMilliseconds(startedAt),
      message: error instanceof Error ? error.message : 'Unknown dependency error'
    };
  }
}

export function createReadinessCheck(
  config: ApiConfig,
  database: DatabaseResources,
  redis: Redis
): ReadinessCheck {
  return async () => {
    const [postgres, redisStatus, objectStorage, modelGateway] =
      await Promise.all([
        checkComponent(async () => {
          await database.client`select 1`;
        }),
        checkComponent(async () => {
          const response = await redis.ping();
          if (response !== 'PONG') {
            throw new Error(`Unexpected Redis response: ${response}`);
          }
        }),
        checkComponent(async () => {
          const response = await fetchWithTimeout(
            new URL('/minio/health/live', config.OBJECT_STORAGE_ENDPOINT),
            { method: 'GET' },
            config.READINESS_TIMEOUT_MS
          );
          if (!response.ok) {
            throw new Error(`Object storage returned HTTP ${response.status}`);
          }
        }),
        checkComponent(async () => {
          const headers = new Headers();
          if (config.INTERNAL_API_KEY) {
            headers.set('x-internal-api-key', config.INTERNAL_API_KEY);
          }
          const response = await fetchWithTimeout(
            new URL('/healthz', config.MODEL_GATEWAY_URL),
            { method: 'GET', headers },
            config.READINESS_TIMEOUT_MS
          );
          if (!response.ok) {
            throw new Error(`Model gateway returned HTTP ${response.status}`);
          }
        })
      ]);

    const components = {
      postgres,
      redis: redisStatus,
      objectStorage,
      modelGateway
    };
    const ready = Object.values(components).every(
      (component) => component.status === 'ok'
    );

    return {
      status: ready ? 'ok' : 'degraded',
      service: 'api',
      version: config.APP_VERSION,
      timestamp: new Date().toISOString(),
      components
    };
  };
}
