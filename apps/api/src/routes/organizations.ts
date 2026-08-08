import {
  CompanyListSchema,
  CompanySchema,
  CreateCompanyInputSchema,
  CreateOrganizationInputSchema,
  ErrorResponseSchema,
  OrganizationListSchema,
  OrganizationParamsSchema,
  OrganizationSchema,
  UuidSchema
} from '@cherryfin/schemas/api';
import { z } from 'zod';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { OrganizationRepository } from '../domain/organizations.js';
import { AppError } from '../errors.js';

export interface OrganizationRoutesOptions {
  repository: OrganizationRepository;
}

function requestContext(request: FastifyRequest) {
  const userAgent = request.headers['user-agent'];
  return {
    userId: request.principal.userId,
    traceId: request.id,
    ipAddress: request.ip,
    ...(typeof userAgent === 'string' ? { userAgent } : {})
  };
}

export const organizationRoutes: FastifyPluginAsync<
  OrganizationRoutesOptions
> = async (app, options) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/me',
    {
      schema: {
        tags: ['Identity'],
        summary: 'Current authenticated principal',
        response: {
          200: z.object({
            userId: UuidSchema,
            authMode: z.enum(['development', 'jwt']),
            sessionId: z.string().optional()
          }),
          401: ErrorResponseSchema
        }
      }
    },
    async (request) => request.principal
  );

  typed.get(
    '/organizations',
    {
      schema: {
        tags: ['Organizations'],
        summary: 'List organizations visible to the current user',
        response: {
          200: OrganizationListSchema,
          401: ErrorResponseSchema
        }
      }
    },
    async (request) => ({
      items: await options.repository.listOrganizations(requestContext(request))
    })
  );

  typed.post(
    '/organizations',
    {
      schema: {
        tags: ['Organizations'],
        summary: 'Create an organization and owner membership',
        body: CreateOrganizationInputSchema,
        response: {
          201: OrganizationSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          409: ErrorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const organization = await options.repository.createOrganization(
        requestContext(request),
        request.body
      );
      return reply.code(201).send(organization);
    }
  );

  typed.get(
    '/organizations/:organizationId',
    {
      schema: {
        tags: ['Organizations'],
        summary: 'Get one organization visible to the current user',
        params: OrganizationParamsSchema,
        response: {
          200: OrganizationSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema
        }
      }
    },
    async (request) => {
      const organization = await options.repository.getOrganization(
        requestContext(request),
        request.params.organizationId
      );
      if (!organization) {
        throw new AppError(
          404,
          'NOT_FOUND',
          'The requested organization was not found'
        );
      }
      return organization;
    }
  );

  typed.get(
    '/organizations/:organizationId/companies',
    {
      schema: {
        tags: ['Companies'],
        summary: 'List companies in an organization',
        params: OrganizationParamsSchema,
        response: {
          200: CompanyListSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema
        }
      }
    },
    async (request) => ({
      items: await options.repository.listCompanies(
        requestContext(request),
        request.params.organizationId
      )
    })
  );

  typed.post(
    '/organizations/:organizationId/companies',
    {
      schema: {
        tags: ['Companies'],
        summary: 'Create a company in an organization',
        params: OrganizationParamsSchema,
        body: CreateCompanyInputSchema,
        response: {
          201: CompanySchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const company = await options.repository.createCompany(
        requestContext(request),
        request.params.organizationId,
        request.body
      );
      return reply.code(201).send(company);
    }
  );
};
