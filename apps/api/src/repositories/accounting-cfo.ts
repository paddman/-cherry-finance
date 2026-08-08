import { addMoney, subtractMoney } from '@cherryfin/finance-math';
import type { CfoBrief, CfoBriefCreateInput } from '@cherryfin/schemas/api';
import type { Sql } from 'postgres';
import { uuidv7 } from 'uuidv7';
import type { RequestContext } from '../domain/organizations.js';
import { AppError } from '../errors.js';
import {
  appendAudit,
  assertCompany,
  assertPermission,
  mapBrief,
  type BriefRow
} from './accounting-support.js';

interface LineRow {
  draft_id: string;
  document_id: string;
  attachment_id: string;
  account_code: string;
  debit: string;
  credit: string;
  tax_code: string | null;
}

function sum(values: string[]): string {
  return addMoney(values.length > 0 ? values : ['0'], 4);
}

function net(debits: string[], credits: string[]): string {
  return subtractMoney(sum(debits), sum(credits), 4);
}

export async function createCfoBrief(
  sql: Sql,
  context: RequestContext,
  organizationId: string,
  companyId: string,
  input: CfoBriefCreateInput
): Promise<CfoBrief> {
  await assertPermission(sql, context, organizationId, 'cfo.write');
  await assertCompany(sql, organizationId, companyId);
  const currency = input.currency.toUpperCase();

  const lines = await sql<LineRow[]>`
    select draft.id as draft_id, document.id as document_id,
           document.attachment_id, line.account_code,
           line.debit::text, line.credit::text, line.tax_code
    from accounting_drafts draft
    join accounting_documents document on document.id = draft.document_id
    join accounting_draft_lines line on line.draft_id = draft.id
    where draft.organization_id = ${organizationId}
      and draft.company_id = ${companyId}
      and draft.status in ('confirmed', 'corrected')
      and document.issue_date between ${input.periodStart} and ${input.periodEnd}
      and document.currency = ${currency}
    order by document.issue_date, draft.id, line.line_number
  `;
  const pendingRows = await sql<{ count: number }[]>`
    select count(*)::int as count from accounting_drafts
    where organization_id = ${organizationId}
      and company_id = ${companyId}
      and status = 'pending'
  `;
  const excludedRows = await sql<{ count: number }[]>`
    select count(distinct document.id)::int as count
    from accounting_drafts draft
    join accounting_documents document on document.id = draft.document_id
    where draft.organization_id = ${organizationId}
      and draft.company_id = ${companyId}
      and draft.status in ('confirmed', 'corrected')
      and document.issue_date between ${input.periodStart} and ${input.periodEnd}
      and document.currency <> ${currency}
  `;

  const revenueDebits: string[] = [];
  const revenueCredits: string[] = [];
  const expenseDebits: string[] = [];
  const expenseCredits: string[] = [];
  const cashDebits: string[] = [];
  const cashCredits: string[] = [];
  const arDebits: string[] = [];
  const arCredits: string[] = [];
  const apDebits: string[] = [];
  const apCredits: string[] = [];
  const inputVat: string[] = [];
  const outputVat: string[] = [];

  for (const line of lines) {
    const accountClass = line.account_code[0];
    if (accountClass === '4') {
      revenueDebits.push(line.debit);
      revenueCredits.push(line.credit);
    }
    if (accountClass === '5' || accountClass === '6') {
      expenseDebits.push(line.debit);
      expenseCredits.push(line.credit);
    }
    if (line.account_code === '1100') {
      cashDebits.push(line.debit);
      cashCredits.push(line.credit);
    }
    if (line.account_code === '1200') {
      arDebits.push(line.debit);
      arCredits.push(line.credit);
    }
    if (line.account_code === '2100') {
      apDebits.push(line.debit);
      apCredits.push(line.credit);
    }
    if (line.tax_code === 'VAT_IN') inputVat.push(line.debit);
    if (line.tax_code === 'VAT_OUT') outputVat.push(line.credit);
  }

  const revenue = net(revenueCredits, revenueDebits);
  const expenses = net(expenseDebits, expenseCredits);
  const operatingResult = subtractMoney(revenue, expenses, 4);
  const documentIds = [...new Set(lines.map((line) => line.document_id))];
  const draftIds = [...new Set(lines.map((line) => line.draft_id))];
  const attachmentIds = [...new Set(lines.map((line) => line.attachment_id))];
  const pendingDrafts = pendingRows[0]?.count ?? 0;
  const excludedCurrencyDocuments = excludedRows[0]?.count ?? 0;

  const inputs: Record<string, unknown> = {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    currency,
    reviewedDraftIds: draftIds,
    pendingDrafts,
    excludedCurrencyDocuments
  };
  const sections: Record<string, unknown> = {
    executiveSummary: {
      revenue,
      expenses,
      operatingResult,
      reviewedDocumentCount: documentIds.length,
      pendingDrafts
    },
    cash: {
      netMovement: net(cashDebits, cashCredits),
      closingBalance: null,
      status: 'unknown_without_opening_balance'
    },
    workingCapital: {
      receivableMovement: net(arDebits, arCredits),
      payableMovement: net(apCredits, apDebits),
      ageing: null,
      status: 'movement_only_without_opening_balances'
    },
    tax: {
      inputVat: sum(inputVat),
      outputVat: sum(outputVat),
      netVatMovement: subtractMoney(sum(outputVat), sum(inputVat), 4),
      filingStatus: null
    },
    risks: [
      ...(pendingDrafts > 0
        ? [{ code: 'PENDING_ACCOUNTING_REVIEW', severity: 'warning', count: pendingDrafts }]
        : []),
      ...(excludedCurrencyDocuments > 0
        ? [{
            code: 'CURRENCY_MISMATCH_EXCLUDED',
            severity: 'warning',
            count: excludedCurrencyDocuments,
            currency
          }]
        : []),
      { code: 'CASH_BALANCE_UNKNOWN', severity: 'info' },
      { code: 'NO_BANK_RECONCILIATION', severity: 'info' }
    ],
    unknowns: [
      'Opening and closing bank balances',
      'Receivable and payable ageing',
      'Budget and forecast inputs',
      'Tax filing and payment confirmation'
    ],
    recommendedActions: [
      ...(pendingDrafts > 0
        ? ['Review all pending accounting drafts before finalizing the period.']
        : []),
      'Import bank opening balances and complete bank reconciliation.',
      'Provide budget data to enable variance analysis.'
    ]
  };
  const calculationVersions: Record<string, unknown> = {
    cfoBrief: '1.0.0',
    moneyScale: 4,
    revenue: 'credit-minus-debit for account class 4',
    expenses: 'debit-minus-credit for account classes 5 and 6',
    generatedAt: new Date().toISOString()
  };
  const briefId = uuidv7();

  const rows = await sql.begin(async (transaction) => {
    const inserted = await transaction<BriefRow[]>`
      insert into cfo_briefs (
        id, organization_id, company_id, period_start, period_end,
        currency, status, inputs, sections, calculation_versions, generated_by
      ) values (
        ${briefId}, ${organizationId}, ${companyId}, ${input.periodStart},
        ${input.periodEnd}, ${currency}, 'draft',
        ${transaction.json(JSON.parse(JSON.stringify(inputs)))},
        ${transaction.json(JSON.parse(JSON.stringify(sections)))},
        ${transaction.json(JSON.parse(JSON.stringify(calculationVersions)))},
        ${context.userId}
      ) returning *
    `;
    for (const sourceId of documentIds) {
      await transaction`
        insert into cfo_brief_sources (brief_id, source_type, source_id, role)
        values (${briefId}, 'accounting_document', ${sourceId}, 'actuals')
        on conflict do nothing
      `;
    }
    for (const sourceId of draftIds) {
      await transaction`
        insert into cfo_brief_sources (brief_id, source_type, source_id, role)
        values (${briefId}, 'accounting_draft', ${sourceId}, 'reviewed_entry')
        on conflict do nothing
      `;
    }
    for (const sourceId of attachmentIds) {
      await transaction`
        insert into cfo_brief_sources (brief_id, source_type, source_id, role)
        values (${briefId}, 'attachment', ${sourceId}, 'evidence')
        on conflict do nothing
      `;
    }
    await appendAudit(
      transaction as unknown as Sql,
      context,
      organizationId,
      'cfo_brief.generated',
      {
        briefId,
        companyId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd
      }
    );
    return inserted;
  });

  const brief = rows[0];
  if (!brief) {
    throw new AppError(500, 'CFO_BRIEF_CREATE_FAILED', 'CFO brief could not be generated');
  }
  return mapBrief(brief);
}

export async function getCfoBrief(
  sql: Sql,
  context: RequestContext,
  briefId: string
): Promise<CfoBrief | null> {
  const rows = await sql<BriefRow[]>`
    select brief.*
    from cfo_briefs brief
    join organization_memberships membership
      on membership.organization_id = brief.organization_id
     and membership.user_id = ${context.userId}
     and membership.status = 'active'
    join roles role on role.id = membership.role_id
    join role_permissions rp on rp.role_id = role.id
    join permissions permission on permission.id = rp.permission_id
     and permission.code = 'cfo.read'
    where brief.id = ${briefId}
    limit 1
  `;
  return rows[0] ? mapBrief(rows[0]) : null;
}
