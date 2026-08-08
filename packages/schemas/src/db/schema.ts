import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core';

const createdAt = () =>
  timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow();

const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow();

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    email: text('email'),
    displayName: text('display_name').notNull(),
    locale: text('locale').notNull().default('th-TH'),
    status: text('status').notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    uniqueIndex('users_email_unique')
      .on(sql`lower(${table.email})`)
      .where(sql`${table.email} is not null`),
    check(
      'users_status_check',
      sql`${table.status} in ('active', 'suspended', 'deleted')`
    )
  ]
);

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: createdAt()
  },
  (table) => [uniqueIndex('roles_code_unique').on(table.code)]
);

export const permissions = pgTable(
  'permissions',
  {
    id: uuid('id').primaryKey(),
    code: text('code').notNull(),
    description: text('description'),
    createdAt: createdAt()
  },
  (table) => [uniqueIndex('permissions_code_unique').on(table.code)]
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    createdAt: createdAt()
  },
  (table) => [
    primaryKey({
      name: 'role_permissions_pk',
      columns: [table.roleId, table.permissionId]
    })
  ]
);

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    status: text('status').notNull().default('active'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    uniqueIndex('organizations_slug_unique').on(table.slug),
    check(
      'organizations_status_check',
      sql`${table.status} in ('active', 'suspended', 'closed')`
    )
  ]
);

export const organizationMemberships = pgTable(
  'organization_memberships',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id),
    status: text('status').notNull().default('active'),
    invitedBy: uuid('invited_by').references(() => users.id),
    joinedAt: timestamp('joined_at', {
      withTimezone: true,
      mode: 'date'
    }).defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    uniqueIndex('organization_memberships_org_user_unique').on(
      table.organizationId,
      table.userId
    ),
    index('organization_memberships_user_idx').on(table.userId),
    check(
      'organization_memberships_status_check',
      sql`${table.status} in ('invited', 'active', 'suspended', 'removed')`
    )
  ]
);

export const companies = pgTable(
  'companies',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    legalName: text('legal_name').notNull(),
    displayName: text('display_name'),
    taxId: text('tax_id'),
    currency: text('currency').notNull().default('THB'),
    timezone: text('timezone').notNull().default('Asia/Bangkok'),
    fiscalYearStartMonth: integer('fiscal_year_start_month').notNull().default(1),
    status: text('status').notNull().default('active'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    index('companies_organization_idx').on(table.organizationId),
    uniqueIndex('companies_org_tax_id_unique')
      .on(table.organizationId, table.taxId)
      .where(sql`${table.taxId} is not null`),
    check(
      'companies_currency_check',
      sql`char_length(${table.currency}) = 3`
    ),
    check(
      'companies_fiscal_month_check',
      sql`${table.fiscalYearStartMonth} between 1 and 12`
    ),
    check(
      'companies_status_check',
      sql`${table.status} in ('active', 'inactive', 'closed')`
    )
  ]
);

export const consentRecords = pgTable(
  'consent_records',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    consentType: text('consent_type').notNull(),
    policyVersion: text('policy_version').notNull(),
    granted: text('granted').notNull(),
    channel: text('channel').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    occurredAt: timestamp('occurred_at', {
      withTimezone: true,
      mode: 'date'
    })
      .notNull()
      .defaultNow(),
    createdAt: createdAt()
  },
  (table) => [
    index('consent_records_user_idx').on(table.userId, table.occurredAt),
    check(
      'consent_records_granted_check',
      sql`${table.granted} in ('granted', 'withdrawn')`
    )
  ]
);

export const idempotencyRecords = pgTable(
  'idempotency_records',
  {
    id: uuid('id').primaryKey(),
    scope: text('scope').notNull(),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    status: text('status').notNull().default('processing'),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body').$type<Record<string, unknown>>(),
    resourceType: text('resource_type'),
    resourceId: uuid('resource_id'),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      mode: 'date'
    }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    uniqueIndex('idempotency_records_scope_key_unique').on(
      table.scope,
      table.key
    ),
    index('idempotency_records_expiry_idx').on(table.expiresAt),
    check(
      'idempotency_records_status_check',
      sql`${table.status} in ('processing', 'completed', 'failed')`
    )
  ]
);

export const inboxEvents = pgTable(
  'inbox_events',
  {
    id: uuid('id').primaryKey(),
    sourceChannel: text('source_channel').notNull(),
    sourceEventId: text('source_event_id').notNull(),
    userId: uuid('user_id').references(() => users.id),
    traceId: text('trace_id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: text('status').notNull().default('received'),
    processedAt: timestamp('processed_at', {
      withTimezone: true,
      mode: 'date'
    }),
    createdAt: createdAt()
  },
  (table) => [
    uniqueIndex('inbox_events_source_unique').on(
      table.sourceChannel,
      table.sourceEventId
    ),
    index('inbox_events_status_idx').on(table.status, table.createdAt),
    check(
      'inbox_events_status_check',
      sql`${table.status} in ('received', 'queued', 'processed', 'failed')`
    )
  ]
);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey(),
    topic: text('topic').notNull(),
    queueName: text('queue_name').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    traceId: text('trace_id'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at', {
      withTimezone: true,
      mode: 'date'
    })
      .notNull()
      .defaultNow(),
    lockedAt: timestamp('locked_at', {
      withTimezone: true,
      mode: 'date'
    }),
    dispatchedAt: timestamp('dispatched_at', {
      withTimezone: true,
      mode: 'date'
    }),
    lastError: text('last_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    index('outbox_events_dispatch_idx').on(
      table.status,
      table.availableAt,
      table.createdAt
    ),
    check(
      'outbox_events_status_check',
      sql`${table.status} in ('pending', 'processing', 'dispatched', 'failed')`
    )
  ]
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').references(() => organizations.id),
    userId: uuid('user_id').references(() => users.id),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    subject: jsonb('subject').$type<Record<string, unknown>>(),
    traceId: text('trace_id'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: createdAt()
  },
  (table) => [
    index('audit_events_org_created_idx').on(
      table.organizationId,
      table.createdAt
    ),
    index('audit_events_user_created_idx').on(table.userId, table.createdAt)
  ]
);

export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id),
    objectKey: text('object_key').notNull(),
    originalFilename: text('original_filename').notNull(),
    mimeType: text('mime_type').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    sha256: text('sha256').notNull(),
    scanStatus: text('scan_status').notNull().default('pending'),
    extractStatus: text('extract_status').notNull().default('pending'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    uniqueIndex('attachments_company_sha_unique').on(table.companyId, table.sha256),
    index('attachments_company_created_idx').on(table.companyId, table.createdAt),
    check('attachments_size_check', sql`${table.byteSize} between 1 and 26214400`),
    check(
      'attachments_scan_status_check',
      sql`${table.scanStatus} in ('pending', 'clean', 'infected', 'failed')`
    ),
    check(
      'attachments_extract_status_check',
      sql`${table.extractStatus} in ('pending', 'processing', 'done', 'failed')`
    )
  ]
);

export const accountingDocuments = pgTable(
  'accounting_documents',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    attachmentId: uuid('attachment_id')
      .notNull()
      .references(() => attachments.id, { onDelete: 'cascade' }),
    documentType: text('document_type').notNull(),
    documentNumber: text('document_number'),
    issueDate: date('issue_date', { mode: 'string' }),
    counterpartyName: text('counterparty_name'),
    counterpartyTaxId: text('counterparty_tax_id'),
    currency: text('currency').notNull().default('THB'),
    subtotal: numeric('subtotal', { precision: 20, scale: 4 }),
    vatAmount: numeric('vat_amount', { precision: 20, scale: 4 }),
    withholdingTaxAmount: numeric('withholding_tax_amount', {
      precision: 20,
      scale: 4
    }),
    totalAmount: numeric('total_amount', { precision: 20, scale: 4 }),
    extractedFields: jsonb('extracted_fields')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    validationResults: jsonb('validation_results')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: text('status').notNull().default('extracted'),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    uniqueIndex('accounting_documents_attachment_unique').on(table.attachmentId),
    index('accounting_documents_company_date_idx').on(
      table.companyId,
      table.issueDate
    ),
    check(
      'accounting_documents_type_check',
      sql`${table.documentType} in ('invoice', 'receipt', 'statement', 'wht_certificate', 'accounting_export', 'other')`
    ),
    check(
      'accounting_documents_status_check',
      sql`${table.status} in ('extracted', 'needs_review', 'reviewed', 'rejected')`
    )
  ]
);

export const accountingDrafts = pgTable(
  'accounting_drafts',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => accountingDocuments.id, { onDelete: 'cascade' }),
    proposedBy: text('proposed_by').notNull().default('system'),
    confidence: text('confidence').notNull(),
    status: text('status').notNull().default('pending'),
    version: integer('version').notNull().default(1),
    totalDebit: numeric('total_debit', { precision: 20, scale: 4 })
      .notNull()
      .default('0'),
    totalCredit: numeric('total_credit', { precision: 20, scale: 4 })
      .notNull()
      .default('0'),
    reviewNote: text('review_note'),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', {
      withTimezone: true,
      mode: 'date'
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    uniqueIndex('accounting_drafts_document_active_unique')
      .on(table.documentId)
      .where(sql`${table.status} <> 'rejected'`),
    index('accounting_drafts_company_status_idx').on(
      table.companyId,
      table.status,
      table.createdAt
    ),
    check(
      'accounting_drafts_confidence_check',
      sql`${table.confidence} in ('high', 'medium', 'low')`
    ),
    check(
      'accounting_drafts_status_check',
      sql`${table.status} in ('pending', 'confirmed', 'corrected', 'rejected')`
    ),
    check(
      'accounting_drafts_balance_check',
      sql`${table.totalDebit} = ${table.totalCredit}`
    )
  ]
);

export const accountingDraftLines = pgTable(
  'accounting_draft_lines',
  {
    id: uuid('id').primaryKey(),
    draftId: uuid('draft_id')
      .notNull()
      .references(() => accountingDrafts.id, { onDelete: 'cascade' }),
    lineNumber: integer('line_number').notNull(),
    accountCode: text('account_code').notNull(),
    accountName: text('account_name').notNull(),
    description: text('description'),
    debit: numeric('debit', { precision: 20, scale: 4 }).notNull().default('0'),
    credit: numeric('credit', { precision: 20, scale: 4 }).notNull().default('0'),
    taxCode: text('tax_code'),
    dimensions: jsonb('dimensions')
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    createdAt: createdAt()
  },
  (table) => [
    uniqueIndex('accounting_draft_lines_draft_line_unique').on(
      table.draftId,
      table.lineNumber
    ),
    check(
      'accounting_draft_lines_one_side_check',
      sql`(${table.debit} > 0 and ${table.credit} = 0) or (${table.credit} > 0 and ${table.debit} = 0)`
    )
  ]
);

export const evidenceLinks = pgTable(
  'evidence_links',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    attachmentId: uuid('attachment_id')
      .notNull()
      .references(() => attachments.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    fieldName: text('field_name').notNull(),
    pageNumber: integer('page_number'),
    boundingBox: jsonb('bounding_box').$type<{
      x: number;
      y: number;
      width: number;
      height: number;
    }>(),
    extractedValue: text('extracted_value'),
    confidence: numeric('confidence', { precision: 5, scale: 4 }),
    createdAt: createdAt()
  },
  (table) => [
    index('evidence_links_entity_idx').on(
      table.entityType,
      table.entityId,
      table.fieldName
    ),
    check(
      'evidence_links_confidence_check',
      sql`${table.confidence} is null or (${table.confidence} between 0 and 1)`
    )
  ]
);

export const reviewEvents = pgTable(
  'review_events',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    draftId: uuid('draft_id')
      .notNull()
      .references(() => accountingDrafts.id, { onDelete: 'cascade' }),
    reviewerUserId: uuid('reviewer_user_id')
      .notNull()
      .references(() => users.id),
    action: text('action').notNull(),
    beforeState: jsonb('before_state').$type<Record<string, unknown>>(),
    afterState: jsonb('after_state').$type<Record<string, unknown>>(),
    note: text('note'),
    traceId: text('trace_id'),
    createdAt: createdAt()
  },
  (table) => [
    index('review_events_draft_created_idx').on(table.draftId, table.createdAt),
    check(
      'review_events_action_check',
      sql`${table.action} in ('confirmed', 'corrected', 'rejected')`
    )
  ]
);
