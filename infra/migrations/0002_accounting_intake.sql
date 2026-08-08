BEGIN;

CREATE TABLE IF NOT EXISTS attachments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES users(id),
  object_key text NOT NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 26214400),
  sha256 text NOT NULL,
  scan_status text NOT NULL DEFAULT 'pending'
    CHECK (scan_status IN ('pending', 'clean', 'infected', 'failed')),
  extract_status text NOT NULL DEFAULT 'pending'
    CHECK (extract_status IN ('pending', 'processing', 'done', 'failed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attachments_company_sha_unique UNIQUE (company_id, sha256)
);
CREATE INDEX IF NOT EXISTS attachments_company_created_idx
  ON attachments (company_id, created_at);

CREATE TABLE IF NOT EXISTS accounting_documents (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  attachment_id uuid NOT NULL UNIQUE REFERENCES attachments(id) ON DELETE CASCADE,
  document_type text NOT NULL
    CHECK (document_type IN (
      'invoice', 'receipt', 'statement', 'wht_certificate',
      'accounting_export', 'other'
    )),
  document_number text,
  issue_date date,
  counterparty_name text,
  counterparty_tax_id text,
  currency text NOT NULL DEFAULT 'THB' CHECK (char_length(currency) = 3),
  subtotal numeric(20,4),
  vat_amount numeric(20,4),
  withholding_tax_amount numeric(20,4),
  total_amount numeric(20,4),
  extracted_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_results jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'extracted'
    CHECK (status IN ('extracted', 'needs_review', 'reviewed', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS accounting_documents_company_date_idx
  ON accounting_documents (company_id, issue_date);

CREATE TABLE IF NOT EXISTS accounting_drafts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES accounting_documents(id) ON DELETE CASCADE,
  proposed_by text NOT NULL DEFAULT 'system',
  confidence text NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'corrected', 'rejected')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  total_debit numeric(20,4) NOT NULL DEFAULT 0,
  total_credit numeric(20,4) NOT NULL DEFAULT 0,
  review_note text,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounting_drafts_balance_check CHECK (total_debit = total_credit)
);
CREATE UNIQUE INDEX IF NOT EXISTS accounting_drafts_document_active_unique
  ON accounting_drafts (document_id) WHERE status <> 'rejected';
CREATE INDEX IF NOT EXISTS accounting_drafts_company_status_idx
  ON accounting_drafts (company_id, status, created_at);

CREATE TABLE IF NOT EXISTS accounting_draft_lines (
  id uuid PRIMARY KEY,
  draft_id uuid NOT NULL REFERENCES accounting_drafts(id) ON DELETE CASCADE,
  line_number integer NOT NULL CHECK (line_number > 0),
  account_code text NOT NULL,
  account_name text NOT NULL,
  description text,
  debit numeric(20,4) NOT NULL DEFAULT 0,
  credit numeric(20,4) NOT NULL DEFAULT 0,
  tax_code text,
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounting_draft_lines_draft_line_unique
    UNIQUE (draft_id, line_number),
  CONSTRAINT accounting_draft_lines_one_side_check CHECK (
    (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
  )
);

CREATE TABLE IF NOT EXISTS evidence_links (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  attachment_id uuid NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  field_name text NOT NULL,
  page_number integer,
  bounding_box jsonb,
  extracted_value text,
  confidence numeric(5,4)
    CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evidence_links_entity_idx
  ON evidence_links (entity_type, entity_id, field_name);

CREATE TABLE IF NOT EXISTS review_events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  draft_id uuid NOT NULL REFERENCES accounting_drafts(id) ON DELETE CASCADE,
  reviewer_user_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL CHECK (action IN ('confirmed', 'corrected', 'rejected')),
  before_state jsonb,
  after_state jsonb,
  note text,
  trace_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS review_events_draft_created_idx
  ON review_events (draft_id, created_at);

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'attachments',
    'accounting_documents',
    'accounting_drafts'
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

DROP TRIGGER IF EXISTS review_events_append_only ON review_events;
CREATE TRIGGER review_events_append_only
  BEFORE UPDATE OR DELETE ON review_events
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

COMMIT;
