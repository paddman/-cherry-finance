import { addMoney, normalizeMoney } from '@cherryfin/finance-math';
import type {
  AccountingDraft,
  AccountingDraftDetail,
  CorrectDraftInput
} from '@cherryfin/schemas/api';
import type { Sql } from 'postgres';
import { uuidv7 } from 'uuidv7';
import type { DraftReviewCommand } from '../domain/accounting.js';
import type { RequestContext } from '../domain/organizations.js';
import { AppError } from '../errors.js';
import {
  appendAudit,
  assertCompany,
  assertPermission,
  loadDraftDetail,
  mapDraft,
  type DraftRow
} from './accounting-support.js';

function lineTotals(input: CorrectDraftInput): {
  debit: string;
  credit: string;
} {
  const debit = addMoney(input.lines.map((line) => normalizeMoney(line.debit, 4)), 4);
  const credit = addMoney(input.lines.map((line) => normalizeMoney(line.credit, 4)), 4);
  if (debit !== credit) {
    throw new AppError(
      422,
      'DRAFT_UNBALANCED',
      'Corrected draft lines must have equal debit and credit totals',
      { debit, credit }
    );
  }
  return { debit, credit };
}

async function draftOrganization(sql: Sql, draftId: string): Promise<string> {
  const rows = await sql<{ organization_id: string }[]>`
    select organization_id from accounting_drafts where id = ${draftId} limit 1
  `;
  const organizationId = rows[0]?.organization_id;
  if (!organizationId) {
    throw new AppError(404, 'NOT_FOUND', 'The requested draft was not found');
  }
  return organizationId;
}

export async function listDrafts(
  sql: Sql,
  context: RequestContext,
  organizationId: string,
  companyId: string,
  status: AccountingDraft['status'] | undefined,
  limit: number
): Promise<AccountingDraft[]> {
  await assertPermission(sql, context, organizationId, 'accounting.read');
  await assertCompany(sql, organizationId, companyId);
  const rows = status
    ? await sql<DraftRow[]>`
        select * from accounting_drafts
        where organization_id = ${organizationId}
          and company_id = ${companyId}
          and status = ${status}
        order by created_at desc limit ${limit}
      `
    : await sql<DraftRow[]>`
        select * from accounting_drafts
        where organization_id = ${organizationId}
          and company_id = ${companyId}
        order by created_at desc limit ${limit}
      `;
  return rows.map(mapDraft);
}

export async function getDraft(
  sql: Sql,
  context: RequestContext,
  draftId: string
): Promise<AccountingDraftDetail | null> {
  const organizationId = await draftOrganization(sql, draftId);
  await assertPermission(sql, context, organizationId, 'accounting.read');
  return loadDraftDetail(sql, draftId, context.userId);
}

async function replaceLines(
  transaction: Sql,
  draftId: string,
  input: CorrectDraftInput
): Promise<{ debit: string; credit: string }> {
  const totals = lineTotals(input);
  await transaction`delete from accounting_draft_lines where draft_id = ${draftId}`;
  for (const line of input.lines) {
    await transaction`
      insert into accounting_draft_lines (
        id, draft_id, line_number, account_code, account_name,
        description, debit, credit, tax_code, dimensions
      ) values (
        ${uuidv7()}, ${draftId}, ${line.lineNumber}, ${line.accountCode},
        ${line.accountName}, ${line.description ?? null},
        ${normalizeMoney(line.debit, 4)}, ${normalizeMoney(line.credit, 4)},
        ${line.taxCode ?? null}, ${transaction.json(line.dimensions)}
      )
    `;
  }
  return totals;
}

export async function reviewDraft(
  sql: Sql,
  context: RequestContext,
  draftId: string,
  command: DraftReviewCommand
): Promise<AccountingDraftDetail> {
  const organizationId = await draftOrganization(sql, draftId);
  await assertPermission(sql, context, organizationId, 'accounting.review');

  await sql.begin(async (transaction) => {
    const rows = await transaction<DraftRow[]>`
      select * from accounting_drafts where id = ${draftId} for update
    `;
    const draft = rows[0];
    if (!draft) throw new AppError(404, 'NOT_FOUND', 'The requested draft was not found');
    if (draft.status !== 'pending') {
      throw new AppError(
        409,
        'DRAFT_ALREADY_REVIEWED',
        'Only a pending draft can be reviewed',
        { status: draft.status }
      );
    }

    const beforeState = {
      status: draft.status,
      version: draft.version,
      totalDebit: draft.total_debit,
      totalCredit: draft.total_credit
    };
    let totalDebit = draft.total_debit;
    let totalCredit = draft.total_credit;
    let note: string | undefined;

    if (command.action === 'corrected') {
      const totals = await replaceLines(transaction, draftId, command.input);
      totalDebit = totals.debit;
      totalCredit = totals.credit;
      note = command.input.note;
      if (command.input.document) {
        await transaction`
          update accounting_documents set
            document_number = coalesce(${command.input.document.documentNumber ?? null}, document_number),
            issue_date = coalesce(${command.input.document.issueDate ?? null}, issue_date),
            counterparty_name = coalesce(${command.input.document.counterpartyName ?? null}, counterparty_name),
            counterparty_tax_id = coalesce(${command.input.document.counterpartyTaxId ?? null}, counterparty_tax_id),
            status = 'reviewed', updated_at = now()
          where id = ${draft.document_id}
        `;
      } else {
        await transaction`
          update accounting_documents set status = 'reviewed', updated_at = now()
          where id = ${draft.document_id}
        `;
      }
      await transaction`
        update accounting_drafts set
          status = 'corrected', version = version + 1,
          total_debit = ${totalDebit}, total_credit = ${totalCredit},
          review_note = ${note}, reviewed_by = ${context.userId},
          reviewed_at = now(), updated_at = now()
        where id = ${draftId}
      `;
    } else {
      note = command.note;
      await transaction`
        update accounting_drafts set
          status = ${command.action}, review_note = ${note ?? null},
          reviewed_by = ${context.userId}, reviewed_at = now(), updated_at = now()
        where id = ${draftId}
      `;
      await transaction`
        update accounting_documents set
          status = ${command.action === 'confirmed' ? 'reviewed' : 'rejected'},
          updated_at = now()
        where id = ${draft.document_id}
      `;
    }

    const afterState = {
      status: command.action,
      version: command.action === 'corrected' ? draft.version + 1 : draft.version,
      totalDebit,
      totalCredit
    };
    await transaction`
      insert into review_events (
        id, organization_id, draft_id, reviewer_user_id, action,
        before_state, after_state, note, trace_id
      ) values (
        ${uuidv7()}, ${draft.organization_id}, ${draftId}, ${context.userId},
        ${command.action}, ${transaction.json(beforeState)},
        ${transaction.json(afterState)}, ${note ?? null}, ${context.traceId}
      )
    `;
    await appendAudit(
      transaction,
      context,
      draft.organization_id,
      `accounting_draft.${command.action}`,
      { draftId, documentId: draft.document_id }
    );
  });

  const result = await loadDraftDetail(sql, draftId, context.userId);
  if (!result) {
    throw new AppError(500, 'DRAFT_RELOAD_FAILED', 'Reviewed draft could not be reloaded');
  }
  return result;
}
