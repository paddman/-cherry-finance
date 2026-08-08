BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email text,
  display_name text NOT NULL,
  locale text NOT NULL DEFAULT 'th-TH',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique
  ON users (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_permissions_pk PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'closed')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_memberships (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('invited', 'active', 'suspended', 'removed')),
  invited_by uuid REFERENCES users(id),
  joined_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_memberships_org_user_unique
    UNIQUE (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS organization_memberships_user_idx
  ON organization_memberships (user_id);

CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  legal_name text NOT NULL,
  display_name text,
  tax_id text,
  currency text NOT NULL DEFAULT 'THB' CHECK (char_length(currency) = 3),
  timezone text NOT NULL DEFAULT 'Asia/Bangkok',
  fiscal_year_start_month integer NOT NULL DEFAULT 1
    CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'closed')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS companies_organization_idx
  ON companies (organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS companies_org_tax_id_unique
  ON companies (organization_id, tax_id) WHERE tax_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS consent_records (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type text NOT NULL,
  policy_version text NOT NULL,
  granted text NOT NULL CHECK (granted IN ('granted', 'withdrawn')),
  channel text NOT NULL,
  ip_address text,
  user_agent text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consent_records_user_idx
  ON consent_records (user_id, occurred_at);

CREATE TABLE IF NOT EXISTS idempotency_records (
  id uuid PRIMARY KEY,
  scope text NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'failed')),
  response_status integer,
  response_body jsonb,
  resource_type text,
  resource_id uuid,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT idempotency_records_scope_key_unique UNIQUE (scope, key)
);
CREATE INDEX IF NOT EXISTS idempotency_records_expiry_idx
  ON idempotency_records (expires_at);

CREATE TABLE IF NOT EXISTS inbox_events (
  id uuid PRIMARY KEY,
  source_channel text NOT NULL,
  source_event_id text NOT NULL,
  user_id uuid REFERENCES users(id),
  trace_id text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'queued', 'processed', 'failed')),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inbox_events_source_unique
    UNIQUE (source_channel, source_event_id)
);
CREATE INDEX IF NOT EXISTS inbox_events_status_idx
  ON inbox_events (status, created_at);

CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY,
  topic text NOT NULL,
  queue_name text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  trace_id text,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'dispatched', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  dispatched_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outbox_events_dispatch_idx
  ON outbox_events (status, available_at, created_at);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY,
  organization_id uuid REFERENCES organizations(id),
  user_id uuid REFERENCES users(id),
  actor text NOT NULL,
  action text NOT NULL,
  subject jsonb,
  trace_id text,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_org_created_idx
  ON audit_events (organization_id, created_at);
CREATE INDEX IF NOT EXISTS audit_events_user_created_idx
  ON audit_events (user_id, created_at);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users',
    'organizations',
    'organization_memberships',
    'companies',
    'idempotency_records',
    'outbox_events'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_updated_at ON %I', table_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      table_name,
      table_name
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION reject_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS audit_events_append_only ON audit_events;
CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

DROP TRIGGER IF EXISTS consent_records_append_only ON consent_records;
CREATE TRIGGER consent_records_append_only
  BEFORE UPDATE OR DELETE ON consent_records
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

INSERT INTO roles (id, code, name, description) VALUES
  ('018f0000-0000-7000-8000-000000001001', 'owner', 'Owner', 'Full organization control'),
  ('018f0000-0000-7000-8000-000000001002', 'admin', 'Administrator', 'Manage organization operations'),
  ('018f0000-0000-7000-8000-000000001003', 'accountant', 'Accountant', 'Prepare and review accounting work'),
  ('018f0000-0000-7000-8000-000000001004', 'viewer', 'Viewer', 'Read-only access')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

INSERT INTO permissions (id, code, description) VALUES
  ('018f0000-0000-7000-8000-000000002001', 'organization.read', 'Read organization profile'),
  ('018f0000-0000-7000-8000-000000002002', 'organization.manage', 'Manage organization profile and members'),
  ('018f0000-0000-7000-8000-000000002003', 'company.read', 'Read company profiles'),
  ('018f0000-0000-7000-8000-000000002004', 'company.manage', 'Create and update company profiles'),
  ('018f0000-0000-7000-8000-000000002005', 'accounting.read', 'Read accounting documents and drafts'),
  ('018f0000-0000-7000-8000-000000002006', 'accounting.write', 'Upload documents and prepare drafts'),
  ('018f0000-0000-7000-8000-000000002007', 'accounting.review', 'Confirm, correct, or reject accounting drafts'),
  ('018f0000-0000-7000-8000-000000002008', 'audit.read', 'Read organization audit events')
ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM roles AS role
CROSS JOIN permissions AS permission
WHERE role.code IN ('owner', 'admin')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM roles AS role
JOIN permissions AS permission
  ON permission.code IN (
    'organization.read',
    'company.read',
    'accounting.read',
    'accounting.write',
    'accounting.review',
    'audit.read'
  )
WHERE role.code = 'accountant'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM roles AS role
JOIN permissions AS permission
  ON permission.code IN ('organization.read', 'company.read', 'accounting.read')
WHERE role.code = 'viewer'
ON CONFLICT DO NOTHING;

COMMIT;
