import { z } from 'zod';
import { IsoDateTimeSchema, UuidSchema } from './common.js';

export const OrganizationRoleSchema = z.enum([
  'owner',
  'admin',
  'accountant',
  'viewer'
]);

export const OrganizationStatusSchema = z.enum(['active', 'suspended', 'closed']);
export const CompanyStatusSchema = z.enum(['active', 'inactive', 'closed']);

export const OrganizationSlugSchema = z
  .string()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const CreateOrganizationInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: OrganizationSlugSchema.optional()
});

export const OrganizationSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  slug: OrganizationSlugSchema,
  status: OrganizationStatusSchema,
  role: OrganizationRoleSchema,
  createdAt: IsoDateTimeSchema
});

export const OrganizationListSchema = z.object({
  items: z.array(OrganizationSchema)
});

export const OrganizationParamsSchema = z.object({
  organizationId: UuidSchema
});

export const CreateCompanyInputSchema = z.object({
  legalName: z.string().trim().min(2).max(200),
  displayName: z.string().trim().min(2).max(160).optional(),
  taxId: z
    .string()
    .trim()
    .regex(/^\d{13}$/)
    .optional(),
  currency: z.string().trim().length(3).toUpperCase().default('THB'),
  timezone: z.string().trim().min(3).max(64).default('Asia/Bangkok')
});

export const CompanySchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  legalName: z.string(),
  displayName: z.string().nullable(),
  taxId: z.string().nullable(),
  currency: z.string().length(3),
  timezone: z.string(),
  status: CompanyStatusSchema,
  createdAt: IsoDateTimeSchema
});

export const CompanyListSchema = z.object({
  items: z.array(CompanySchema)
});

export type CreateOrganizationInput = z.infer<
  typeof CreateOrganizationInputSchema
>;
export type Organization = z.infer<typeof OrganizationSchema>;
export type OrganizationRole = z.infer<typeof OrganizationRoleSchema>;
export type CreateCompanyInput = z.infer<typeof CreateCompanyInputSchema>;
export type Company = z.infer<typeof CompanySchema>;
