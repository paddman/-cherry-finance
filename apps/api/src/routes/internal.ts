import {
  AttachmentParamsSchema,
  ErrorResponseSchema,
  WorkerExtractionResultSchema
} from '@cherryfin/schemas/api';
import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ApiConfig } from '../config.js';
import type { AccountingRepository } from '../domain/accounting.js';
import { AppError } from '../errors.js';

export interface InternalRoutesOptions {
  config: ApiConfig;
  repository: AccountingRepository;
}

export const internalRoutes: FastifyPluginAsync<InternalRoutesOptions> = async (
  app,
  options
) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/attachments/:attachmentId/extraction-result',
    {
      schema: {
        hide: true,
        params: AttachmentParamsSchema,
        body: WorkerExtractionResultSchema,
        response: {
          202: z.object({ accepted: z.literal(true) }),
          401: ErrorResponseSchema,
          404: ErrorResponseSchema
        }
      }
    },
    async (request, reply) => {
      if (
        !options.config.INTERNAL_API_KEY ||
        request.headers['x-internal-api-key'] !== options.config.INTERNAL_API_KEY
      ) {
        throw new AppError(401, 'AUTH_REQUIRED', 'Internal API key is required');
      }
      const suppliedTrace = request.headers['x-trace-id'];
      const traceId =
        typeof suppliedTrace === 'string' && suppliedTrace.length > 0
          ? suppliedTrace
          : request.id;
      await options.repository.applyWorkerResult(
        request.params.attachmentId,
        request.body,
        traceId
      );
      return reply.code(202).send({ accepted: true });
    }
  );
};
