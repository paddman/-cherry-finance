import { createTraceId, logRedactPaths } from '@cherryfin/observability';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler
} from 'fastify-type-provider-zod';
import type { ApiConfig } from './config.js';
import type {
  AccountingRepository,
  ObjectStorage
} from './domain/accounting.js';
import type { OrganizationRepository } from './domain/organizations.js';
import { AppError } from './errors.js';
import { registerAuthentication } from './plugins/auth.js';
import type { ReadinessCheck } from './readiness.js';
import { accountingRoutes } from './routes/accounting.js';
import { demoRoutes } from './routes/demo.js';
import { healthRoutes } from './routes/health.js';
import { internalRoutes } from './routes/internal.js';
import { organizationRoutes } from './routes/organizations.js';

export interface AppServices {
  organizations: OrganizationRepository;
  accounting: AccountingRepository;
  objectStorage: ObjectStorage;
  readiness: ReadinessCheck;
}

interface ValidationIssue {
  instancePath?: string;
  keyword?: string;
  message?: string;
}

function validationIssues(error: unknown): ValidationIssue[] {
  if (typeof error !== 'object' || error === null || !('validation' in error)) {
    return [];
  }

  const validation = (error as { validation?: unknown }).validation;
  return Array.isArray(validation) ? (validation as ValidationIssue[]) : [];
}

export async function buildApp(
  config: ApiConfig,
  services: AppServices
): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      config.NODE_ENV === 'test'
        ? false
        : {
            level: config.LOG_LEVEL,
            redact: {
              paths: [...logRedactPaths],
              censor: '[REDACTED]'
            }
          },
    genReqId: () => createTraceId(),
    trustProxy: true,
    requestTimeout: 65_000,
    bodyLimit: 1_048_576
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, {
    origin: config.NODE_ENV === 'development',
    credentials: false
  });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip
  });

  if (config.OPENAPI_ENABLED) {
    await app.register(swagger, {
      openapi: {
        info: {
          title: 'CherryFin API',
          description:
            'Tenant-aware accounting intake, human review, and deterministic CFO brief API',
          version: config.APP_VERSION
        },
        servers: []
      },
      transform: jsonSchemaTransform
    });
    await app.register(swaggerUi, {
      routePrefix: '/docs',
      staticCSP: true
    });
  }

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-trace-id', request.id);
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    return payload;
  });

  app.setNotFoundHandler(async (request, reply) => {
    return reply.code(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'The requested route was not found',
        traceId: request.id
      }
    });
  });

  app.setErrorHandler(async (error, request, reply) => {
    const issues = validationIssues(error);
    const isValidationError = issues.length > 0;
    const appError = error instanceof AppError ? error : undefined;
    const statusCode = appError?.statusCode ?? (isValidationError ? 400 : 500);
    const code =
      appError?.code ??
      (isValidationError ? 'VALIDATION_FAILED' : 'INTERNAL_ERROR');
    const message =
      appError?.message ??
      (isValidationError
        ? 'Request validation failed'
        : 'An unexpected error occurred');

    if (statusCode >= 500) {
      request.log.error({ err: error, traceId: request.id }, message);
    } else {
      request.log.warn({ err: error, traceId: request.id }, message);
    }

    const details =
      appError?.details ??
      (isValidationError
        ? {
            issues: issues.map((issue) => ({
              path: issue.instancePath ?? '',
              keyword: issue.keyword ?? 'validation',
              message: issue.message ?? 'Invalid value'
            }))
          }
        : undefined);

    return reply.code(statusCode).send({
      error: {
        code,
        message,
        traceId: request.id,
        ...(details ? { details } : {})
      }
    });
  });

  await app.register(healthRoutes, {
    config,
    readiness: services.readiness
  });

  if (config.DEMO_APP_ENABLED) {
    await app.register(demoRoutes);
  }

  await app.register(internalRoutes, {
    prefix: '/internal/v1',
    config,
    repository: services.accounting
  });

  const authenticate = await registerAuthentication(app, config);
  await app.register(async (protectedApp) => {
    protectedApp.addHook('preHandler', authenticate);
    await protectedApp.register(organizationRoutes, {
      prefix: '/v1',
      repository: services.organizations
    });
    await protectedApp.register(accountingRoutes, {
      prefix: '/v1',
      repository: services.accounting,
      storage: services.objectStorage
    });
  });

  return app;
}
