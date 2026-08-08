import type {
  Company,
  CreateCompanyInput,
  CreateOrganizationInput,
  Organization
} from '@cherryfin/schemas/api';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { ApiConfig } from '../src/config.js';
import type {
  OrganizationRepository,
  RequestContext
} from '../src/domain/organizations.js';

const userId = '018f0000-0000-7000-8000-000000000001';
const organizationId = '018f0000-0000-7000-8000-000000000010';

const config: ApiConfig = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  APP_VERSION: 'test',
  API_HOST: '127.0.0.1',
  API_PORT: 3000,
  DATABASE_URL: 'postgres://unused',
  REDIS_URL: 'redis://localhost:6379/0',
  OBJECT_STORAGE_ENDPOINT: 'http://localhost:9000',
  MODEL_GATEWAY_URL: 'http://localhost:3100',
  READINESS_TIMEOUT_MS: 100,
  AUTH_MODE: 'development',
  DEV_USER_ID: userId,
  DEV_USER_EMAIL: 'developer@cherryfin.local',
  DEV_USER_DISPLAY_NAME: 'Developer',
  JWT_ISSUER: 'cherryfin',
  JWT_AUDIENCE: 'cherryfin-api',
  OPENAPI_ENABLED: false
};

class InMemoryOrganizations implements OrganizationRepository {
  organizations: Organization[] = [];
  companies: Company[] = [];

  async listOrganizations(_context: RequestContext): Promise<Organization[]> {
    return this.organizations;
  }

  async getOrganization(
    _context: RequestContext,
    id: string
  ): Promise<Organization | null> {
    return this.organizations.find((item) => item.id === id) ?? null;
  }

  async createOrganization(
    _context: RequestContext,
    input: CreateOrganizationInput
  ): Promise<Organization> {
    const organization: Organization = {
      id: organizationId,
      name: input.name,
      slug: input.slug ?? 'test-company',
      status: 'active',
      role: 'owner',
      createdAt: new Date().toISOString()
    };
    this.organizations.push(organization);
    return organization;
  }

  async listCompanies(
    _context: RequestContext,
    id: string
  ): Promise<Company[]> {
    return this.companies.filter((item) => item.organizationId === id);
  }

  async createCompany(
    _context: RequestContext,
    id: string,
    input: CreateCompanyInput
  ): Promise<Company> {
    const company: Company = {
      id: '018f0000-0000-7000-8000-000000000020',
      organizationId: id,
      legalName: input.legalName,
      displayName: input.displayName ?? null,
      taxId: input.taxId ?? null,
      currency: input.currency,
      timezone: input.timezone,
      status: 'active',
      createdAt: new Date().toISOString()
    };
    this.companies.push(company);
    return company;
  }
}

async function testApp(repository = new InMemoryOrganizations()) {
  return buildApp(config, {
    organizations: repository,
    readiness: async () => ({
      status: 'ok',
      service: 'api',
      version: 'test',
      timestamp: new Date().toISOString(),
      components: {
        postgres: { status: 'ok' },
        redis: { status: 'ok' }
      }
    })
  });
}

describe('CherryFin API foundation', () => {
  it('reports liveness and readiness', async () => {
    const app = await testApp();

    const live = await app.inject({ method: 'GET', url: '/healthz' });
    const ready = await app.inject({ method: 'GET', url: '/readyz' });

    expect(live.statusCode).toBe(200);
    expect(live.json()).toMatchObject({ status: 'ok', service: 'api' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ status: 'ok' });

    await app.close();
  });

  it('creates an organization under the authenticated development principal', async () => {
    const app = await testApp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/organizations',
      headers: { 'x-user-id': userId },
      payload: { name: 'Cherry Company', slug: 'cherry-company' }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: organizationId,
      slug: 'cherry-company',
      role: 'owner'
    });
    expect(response.headers['x-trace-id']).toBeTruthy();

    await app.close();
  });

  it('returns a safe validation envelope', async () => {
    const app = await testApp();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/organizations',
      payload: { name: '' }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'VALIDATION_FAILED' }
    });

    await app.close();
  });
});
