import {
  auditEvents,
  companies,
  organizationMemberships,
  organizations,
  permissions,
  rolePermissions,
  roles,
  users,
  outboxEvents
} from '@cherryfin/schemas/db';
import {
  OrganizationRoleSchema,
  type Company,
  type CreateCompanyInput,
  type CreateOrganizationInput,
  type Organization
} from '@cherryfin/schemas/api';
import { and, asc, eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import type { ApiConfig } from '../config.js';
import type { Database } from '../database.js';
import type {
  OrganizationRepository,
  RequestContext
} from '../domain/organizations.js';
import { AppError } from '../errors.js';

function slugify(name: string, suffix: string): string {
  const base = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 52);

  const safeBase = base.length >= 3 ? base : 'organization';
  return `${safeBase}-${suffix.replaceAll('-', '').slice(-8)}`;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}

function mapOrganization(row: {
  id: string;
  name: string;
  slug: string;
  status: string;
  role: string;
  createdAt: Date;
}): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status as Organization['status'],
    role: OrganizationRoleSchema.parse(row.role),
    createdAt: row.createdAt.toISOString()
  };
}

function mapCompany(row: {
  id: string;
  organizationId: string;
  legalName: string;
  displayName: string | null;
  taxId: string | null;
  currency: string;
  timezone: string;
  status: string;
  createdAt: Date;
}): Company {
  return {
    id: row.id,
    organizationId: row.organizationId,
    legalName: row.legalName,
    displayName: row.displayName,
    taxId: row.taxId,
    currency: row.currency,
    timezone: row.timezone,
    status: row.status as Company['status'],
    createdAt: row.createdAt.toISOString()
  };
}

export async function ensureDevelopmentUser(
  db: Database,
  config: ApiConfig
): Promise<void> {
  if (config.AUTH_MODE !== 'development') {
    return;
  }

  await db
    .insert(users)
    .values({
      id: config.DEV_USER_ID,
      email: config.DEV_USER_EMAIL,
      displayName: config.DEV_USER_DISPLAY_NAME,
      locale: 'th-TH',
      status: 'active'
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: config.DEV_USER_EMAIL,
        displayName: config.DEV_USER_DISPLAY_NAME,
        status: 'active',
        updatedAt: new Date()
      }
    });
}

export class PostgresOrganizationRepository
  implements OrganizationRepository
{
  constructor(private readonly db: Database) {}

  private async assertPermission(
    context: RequestContext,
    organizationId: string,
    permissionCode: string
  ): Promise<void> {
    const rows = await this.db
      .select({ membershipId: organizationMemberships.id })
      .from(organizationMemberships)
      .innerJoin(roles, eq(roles.id, organizationMemberships.roleId))
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .innerJoin(
        permissions,
        eq(permissions.id, rolePermissions.permissionId)
      )
      .where(
        and(
          eq(organizationMemberships.organizationId, organizationId),
          eq(organizationMemberships.userId, context.userId),
          eq(organizationMemberships.status, 'active'),
          eq(permissions.code, permissionCode)
        )
      )
      .limit(1);

    if (rows.length === 0) {
      throw new AppError(
        404,
        'NOT_FOUND',
        'The requested organization was not found'
      );
    }
  }

  async listOrganizations(context: RequestContext): Promise<Organization[]> {
    const rows = await this.db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        status: organizations.status,
        role: roles.code,
        createdAt: organizations.createdAt
      })
      .from(organizationMemberships)
      .innerJoin(
        organizations,
        eq(organizations.id, organizationMemberships.organizationId)
      )
      .innerJoin(roles, eq(roles.id, organizationMemberships.roleId))
      .where(
        and(
          eq(organizationMemberships.userId, context.userId),
          eq(organizationMemberships.status, 'active')
        )
      )
      .orderBy(asc(organizations.name));

    return rows.map(mapOrganization);
  }

  async getOrganization(
    context: RequestContext,
    organizationId: string
  ): Promise<Organization | null> {
    const rows = await this.db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        status: organizations.status,
        role: roles.code,
        createdAt: organizations.createdAt
      })
      .from(organizationMemberships)
      .innerJoin(
        organizations,
        eq(organizations.id, organizationMemberships.organizationId)
      )
      .innerJoin(roles, eq(roles.id, organizationMemberships.roleId))
      .where(
        and(
          eq(organizationMemberships.organizationId, organizationId),
          eq(organizationMemberships.userId, context.userId),
          eq(organizationMemberships.status, 'active')
        )
      )
      .limit(1);

    return rows[0] ? mapOrganization(rows[0]) : null;
  }

  async createOrganization(
    context: RequestContext,
    input: CreateOrganizationInput
  ): Promise<Organization> {
    const organizationId = uuidv7();
    const membershipId = uuidv7();
    const slug = input.slug ?? slugify(input.name, organizationId);

    try {
      return await this.db.transaction(async (transaction) => {
        const ownerRoles = await transaction
          .select({ id: roles.id })
          .from(roles)
          .where(eq(roles.code, 'owner'))
          .limit(1);

        const ownerRole = ownerRoles[0];
        if (!ownerRole) {
          throw new AppError(
            500,
            'FOUNDATION_NOT_SEEDED',
            'Owner role is missing from the database'
          );
        }

        const inserted = await transaction
          .insert(organizations)
          .values({
            id: organizationId,
            name: input.name,
            slug,
            status: 'active',
            createdBy: context.userId
          })
          .returning({
            id: organizations.id,
            name: organizations.name,
            slug: organizations.slug,
            status: organizations.status,
            createdAt: organizations.createdAt
          });

        const organization = inserted[0];
        if (!organization) {
          throw new AppError(
            500,
            'ORGANIZATION_CREATE_FAILED',
            'Organization could not be created'
          );
        }

        await transaction.insert(organizationMemberships).values({
          id: membershipId,
          organizationId,
          userId: context.userId,
          roleId: ownerRole.id,
          status: 'active',
          invitedBy: context.userId,
          joinedAt: new Date()
        });

        await transaction.insert(auditEvents).values({
          id: uuidv7(),
          organizationId,
          userId: context.userId,
          actor: `user:${context.userId}`,
          action: 'organization.created',
          subject: {
            organizationId,
            name: input.name,
            slug
          },
          traceId: context.traceId,
          ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
          ...(context.userAgent ? { userAgent: context.userAgent } : {})
        });

        await transaction.insert(outboxEvents).values({
          id: uuidv7(),
          topic: 'organization.created',
          queueName: 'audit',
          aggregateType: 'organization',
          aggregateId: organizationId,
          traceId: context.traceId,
          payload: {
            organizationId,
            userId: context.userId
          }
        });

        return mapOrganization({
          ...organization,
          role: 'owner'
        });
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      if (isUniqueViolation(error)) {
        throw new AppError(
          409,
          'ORGANIZATION_SLUG_EXISTS',
          'That organization slug is already in use'
        );
      }
      throw error;
    }
  }

  async listCompanies(
    context: RequestContext,
    organizationId: string
  ): Promise<Company[]> {
    await this.assertPermission(context, organizationId, 'company.read');

    const rows = await this.db
      .select({
        id: companies.id,
        organizationId: companies.organizationId,
        legalName: companies.legalName,
        displayName: companies.displayName,
        taxId: companies.taxId,
        currency: companies.currency,
        timezone: companies.timezone,
        status: companies.status,
        createdAt: companies.createdAt
      })
      .from(companies)
      .where(eq(companies.organizationId, organizationId))
      .orderBy(asc(companies.legalName));

    return rows.map(mapCompany);
  }

  async createCompany(
    context: RequestContext,
    organizationId: string,
    input: CreateCompanyInput
  ): Promise<Company> {
    await this.assertPermission(context, organizationId, 'company.manage');
    const companyId = uuidv7();

    try {
      return await this.db.transaction(async (transaction) => {
        const inserted = await transaction
          .insert(companies)
          .values({
            id: companyId,
            organizationId,
            legalName: input.legalName,
            ...(input.displayName ? { displayName: input.displayName } : {}),
            ...(input.taxId ? { taxId: input.taxId } : {}),
            currency: input.currency,
            timezone: input.timezone,
            status: 'active',
            createdBy: context.userId
          })
          .returning({
            id: companies.id,
            organizationId: companies.organizationId,
            legalName: companies.legalName,
            displayName: companies.displayName,
            taxId: companies.taxId,
            currency: companies.currency,
            timezone: companies.timezone,
            status: companies.status,
            createdAt: companies.createdAt
          });

        const company = inserted[0];
        if (!company) {
          throw new AppError(
            500,
            'COMPANY_CREATE_FAILED',
            'Company could not be created'
          );
        }

        await transaction.insert(auditEvents).values({
          id: uuidv7(),
          organizationId,
          userId: context.userId,
          actor: `user:${context.userId}`,
          action: 'company.created',
          subject: {
            companyId,
            legalName: input.legalName
          },
          traceId: context.traceId,
          ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
          ...(context.userAgent ? { userAgent: context.userAgent } : {})
        });

        await transaction.insert(outboxEvents).values({
          id: uuidv7(),
          topic: 'company.created',
          queueName: 'audit',
          aggregateType: 'company',
          aggregateId: companyId,
          traceId: context.traceId,
          payload: {
            companyId,
            organizationId,
            userId: context.userId
          }
        });

        return mapCompany(company);
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      if (isUniqueViolation(error)) {
        throw new AppError(
          409,
          'COMPANY_TAX_ID_EXISTS',
          'A company with that tax ID already exists in this organization'
        );
      }
      throw error;
    }
  }
}
