import {
  ErrorResponseSchema,
  HealthResponseSchema,
  type HealthResponse
} from '@cherryfin/schemas/api';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ApiConfig } from '../config.js';
import type { ReadinessCheck } from '../readiness.js';

export interface HealthRoutesOptions {
  config: ApiConfig;
  readiness: ReadinessCheck;
}

export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (
  app,
  options
) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/healthz',
    {
      schema: {
        tags: ['Operations'],
        summary: 'Process liveness',
        response: {
          200: HealthResponseSchema
        }
      }
    },
    async (): Promise<HealthResponse> => ({
      status: 'ok',
      service: 'api',
      version: options.config.APP_VERSION,
      timestamp: new Date().toISOString()
    })
  );

  typed.get(
    '/readyz',
    {
      schema: {
        tags: ['Operations'],
        summary: 'Dependency readiness',
        response: {
          200: HealthResponseSchema,
          503: HealthResponseSchema,
          500: ErrorResponseSchema
        }
      }
    },
    async (_request, reply) => {
      const report = await options.readiness();
      return reply.code(report.status === 'ok' ? 200 : 503).send(report);
    }
  );
};
