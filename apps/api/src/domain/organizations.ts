import type {
  Company,
  CreateCompanyInput,
  CreateOrganizationInput,
  Organization
} from '@cherryfin/schemas/api';

export interface RequestContext {
  userId: string;
  traceId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface OrganizationRepository {
  listOrganizations(context: RequestContext): Promise<Organization[]>;
  getOrganization(
    context: RequestContext,
    organizationId: string
  ): Promise<Organization | null>;
  createOrganization(
    context: RequestContext,
    input: CreateOrganizationInput
  ): Promise<Organization>;
  listCompanies(
    context: RequestContext,
    organizationId: string
  ): Promise<Company[]>;
  createCompany(
    context: RequestContext,
    organizationId: string,
    input: CreateCompanyInput
  ): Promise<Company>;
}
