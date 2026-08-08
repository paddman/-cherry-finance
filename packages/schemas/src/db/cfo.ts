import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid
} from 'drizzle-orm/pg-core';
import { companies, organizations, users } from './schema.js';

const createdAt = () =>
  timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow();

const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow();

export const cfoBriefs = pgTable(
  'cfo_briefs',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    currency: text('currency').notNull().default('THB'),
    status: text('status').notNull().default('draft'),
    inputs: jsonb('inputs').$type<Record<string, unknown>>().notNull(),
    sections: jsonb('sections').$type<Record<string, unknown>>().notNull(),
    calculationVersions: jsonb('calculation_versions')
      .$type<Record<string, unknown>>()
      .notNull(),
    generatedBy: uuid('generated_by')
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    index('cfo_briefs_company_period_idx').on(
      table.companyId,
      table.periodEnd,
      table.createdAt
    ),
    check('cfo_briefs_period_check', sql`${table.periodEnd} >= ${table.periodStart}`),
    check('cfo_briefs_currency_check', sql`char_length(${table.currency}) = 3`),
    check('cfo_briefs_status_check', sql`${table.status} in ('draft', 'final')`)
  ]
);

export const cfoBriefSources = pgTable(
  'cfo_brief_sources',
  {
    briefId: uuid('brief_id')
      .notNull()
      .references(() => cfoBriefs.id, { onDelete: 'cascade' }),
    sourceType: text('source_type').notNull(),
    sourceId: uuid('source_id').notNull(),
    role: text('role').notNull(),
    createdAt: createdAt()
  },
  (table) => [
    primaryKey({
      name: 'cfo_brief_sources_pk',
      columns: [table.briefId, table.sourceType, table.sourceId]
    }),
    index('cfo_brief_sources_source_idx').on(table.sourceType, table.sourceId),
    check(
      'cfo_brief_sources_type_check',
      sql`${table.sourceType} in ('accounting_document', 'accounting_draft', 'attachment')`
    )
  ]
);
