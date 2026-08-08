import type { ExtractedAccountingDocument } from '@cherryfin/accounting-core';
import type {
  AccountingDraft,
  AccountingDraftDetail,
  Attachment,
  AttachmentCreateInput,
  CfoBrief,
  CfoBriefCreateInput,
  Company,
  CreateCompanyInput,
  CreateOrganizationInput,
  Organization,
  WorkerExtractionResult
} from '@cherryfin/schemas/api';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { ApiConfig } from '../src/config.js';
import type {
  AccountingRepository,
  AttachmentRecord,
  DraftReviewCommand,
  ObjectHead,
  ObjectStorage,
  UploadDescriptor
} from '../src/domain/accounting.js';
import type {
  OrganizationRepository,
  RequestContext
} from '../src/domain/organizations.js';

const userId = '018f0000-0000-7000-8000-000000000001';
const organizationId = '018f0000-0000-7000-8000-000000000010';
const companyId = '018f0000-0000-7000-8000-000000000020';
const attachmentId = '018f0000-0000-7000-8000-000000000030';

const config: ApiConfig = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  APP_VERSION: 'test',
  API_HOST: '127.0.0.1',
  API_PORT: 3000,
  DATABASE_URL: 'postgres://unused',
  REDIS_URL: 'redis://localhost:6379/0',
  OBJECT_STORAGE_ENDPOINT: 'http://localhost:9000',
  OBJECT_STORAGE_PUBLIC_ENDPOINT: 'http://localhost:9000',
  OBJECT_STORAGE_REGION: 'us-east-1',
  OBJECT_STORAGE_BUCKET: 'test-bucket',
  OBJECT_STORAGE_ACCESS_KEY: 'test-key',
  OBJECT_STORAGE_SECRET_KEY: 'test-secret',
  OBJECT_STORAGE_FORCE_PATH_STYLE: true,
  OBJECT_STORAGE_UPLOAD_TTL_SECONDS: 600,
  MODEL_GATEWAY_URL: 'http://localhost:3100',
  INTERNAL_API_KEY: 'test-internal-key',
  READINESS_TIMEOUT_MS: 100,
  AUTH_MODE: 'development',
  DEV_USER_ID: userId,
  DEV_USER_EMAIL: 'developer@cherryfin.local',
  DEV_USER_DISPLAY_NAME: 'Developer',
  JWT_ISSUER: 'cherryfin',
  JWT_AUDIENCE: 'cherryfin-api',
  OPENAPI_ENABLED: false,
  DEMO_APP_ENABLED: false
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
      id: companyId,
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

class InMemoryAccounting implements AccountingRepository {
  attachment: AttachmentRecord | null = null;

  async createAttachment(
    _context: RequestContext,
    orgId: string,
    company: string,
    input: AttachmentCreateInput
  ): Promise<AttachmentRecord> {
    const now = new Date().toISOString();
    this.attachment = {
      id: attachmentId,
      organizationId: orgId,
      companyId: company,
      uploadedBy: userId,
      objectKey: `attachments/${attachmentId}`,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      sha256: input.sha256,
      scanStatus: 'pending',
      extractStatus: 'pending',
      metadata: { uploadStatus: 'pending' },
      createdAt: now,
      updatedAt: now
    };
    return this.attachment;
  }

  private publicAttachment(): Attachment {
    if (!this.attachment) throw new Error('missing attachment');
    return {
      id: this.attachment.id,
      organizationId: this.attachment.organizationId,
      companyId: this.attachment.companyId,
      originalFilename: this.attachment.originalFilename,
      mimeType: this.attachment.mimeType,
      byteSize: this.attachment.byteSize,
      sha256: this.attachment.sha256,
      scanStatus: this.attachment.scanStatus,
      extractStatus: this.attachment.extractStatus,
      metadata: this.attachment.metadata,
      createdAt: this.attachment.createdAt,
      updatedAt: this.attachment.updatedAt
    };
  }

  async listAttachments(): Promise<Attachment[]> {
    return this.attachment ? [this.publicAttachment()] : [];
  }

  async getAttachment(): Promise<AttachmentRecord | null> {
    return this.attachment;
  }

  async completeAttachment(): Promise<Attachment> {
    if (!this.attachment) throw new Error('missing attachment');
    this.attachment = {
      ...this.attachment,
      metadata: { uploadStatus: 'complete' }
    };
    return this.publicAttachment();
  }

  async reprocessAttachment(): Promise<Attachment> {
    if (!this.attachment) throw new Error('missing attachment');
    return this.publicAttachment();
  }

  async applyWorkerResult(
    _attachmentId: string,
    _result: WorkerExtractionResult,
    _traceId: string
  ): Promise<void> {}

  async submitManualExtraction(
    _context: RequestContext,
    _attachmentId: string,
    _extraction: ExtractedAccountingDocument
  ): Promise<AccountingDraftDetail | null> {
    return null;
  }

  async listDrafts(): Promise<AccountingDraft[]> {
    return [];
  }

  async getDraft(): Promise<AccountingDraftDetail | null> {
    return null;
  }

  async reviewDraft(
    _context: RequestContext,
    _draftId: string,
    _command: DraftReviewCommand
  ): Promise<AccountingDraftDetail> {
    throw new Error('not implemented in test double');
  }

  async createCfoBrief(
    _context: RequestContext,
    _organizationId: string,
    _companyId: string,
    _input: CfoBriefCreateInput
  ): Promise<CfoBrief> {
    throw new Error('not implemented in test double');
  }

  async getCfoBrief(): Promise<CfoBrief | null> {
    return null;
  }
}

class InMemoryStorage implements ObjectStorage {
  async createUpload(record: AttachmentRecord): Promise<UploadDescriptor> {
    return {
      method: 'PUT',
      url: `https://storage.test/${record.id}`,
      headers: {
        'content-type': record.mimeType,
        'x-amz-meta-sha256': record.sha256
      },
      expiresAt: new Date(Date.now() + 600_000).toISOString()
    };
  }

  async head(record: AttachmentRecord): Promise<ObjectHead> {
    return {
      byteSize: record.byteSize,
      contentType: record.mimeType,
      etag: 'test-etag',
      sha256: record.sha256
    };
  }
}

async function testApp(
  organizations = new InMemoryOrganizations(),
  accounting = new InMemoryAccounting()
) {
  return buildApp(config, {
    organizations,
    accounting,
    objectStorage: new InMemoryStorage(),
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

describe('CherryFin API', () => {
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

  it('creates a presigned attachment upload and verifies completion', async () => {
    const accounting = new InMemoryAccounting();
    const app = await testApp(new InMemoryOrganizations(), accounting);
    const payload = {
      originalFilename: 'synthetic-invoice.json',
      mimeType: 'application/json',
      byteSize: 128,
      sha256: 'a'.repeat(64)
    };
    const created = await app.inject({
      method: 'POST',
      url: `/v1/organizations/${organizationId}/companies/${companyId}/attachments`,
      payload
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      attachment: { id: attachmentId },
      upload: { method: 'PUT' }
    });
    const completed = await app.inject({
      method: 'POST',
      url: `/v1/attachments/${attachmentId}/complete`,
      payload: { etag: 'test-etag' }
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json()).toMatchObject({
      id: attachmentId,
      metadata: { uploadStatus: 'complete' }
    });
    await app.close();
  });
});
