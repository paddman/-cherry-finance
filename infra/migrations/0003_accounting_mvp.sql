BEGIN;

CREATE TABLE IF NOT EXISTS cfo_briefs (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL CHECK (period_end >= period_start),
  currency text NOT NULL DEFAULT 'THB' CHECK (char_length(currency) = 3),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'final')),
  inputs jsonb NOT NULL,
  sections jsonb NOT NULL,
  calculation_versions jsonb NOT NULL,
  generated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cfo_briefs_company_period_idx
  ON cfo_briefs (company_id, period_end, created_at);

CREATE TABLE IF NOT EXISTS cfo_brief_sources (
  brief_id uuid NOT NULL REFERENCES cfo_briefs(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (
    source_type IN ('accounting_document', 'accounting_draft', 'attachment')
  ),
  source_id uuid NOT NULL,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cfo_brief_sources_pk
    PRIMARY KEY (brief_id, source_type, source_id)
);
CREATE INDEX IF NOT EXISTS cfo_brief_sources_source_idx
  ON cfo_brief_sources (source_type, source_id);

INSERT INTO permissions (id, code, description) VALUES
  ('018f0000-0000-7000-8000-000000002009', 'cfo.read', 'Read CFO briefs'),
  ('018f0000-0000-7000-8000-000000002010', 'cfo.write', 'Generate and finalize CFO briefs')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM roles AS role
JOIN permissions AS permission ON permission.code IN ('cfo.read', 'cfo.write')
WHERE role.code IN ('owner', 'admin', 'accountant')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM roles AS role
JOIN permissions AS permission ON permission.code = 'cfo.read'
WHERE role.code = 'viewer'
ON CONFLICT DO NOTHING;

DROP TRIGGER IF EXISTS cfo_briefs_set_updated_at ON cfo_briefs;
CREATE TRIGGER cfo_briefs_set_updated_at
  BEFORE UPDATE ON cfo_briefs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
