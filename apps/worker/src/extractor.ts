import {
  ExtractedAccountingDocumentSchema,
  ExtractionPrompt,
  type ExtractedAccountingDocument
} from '@cherryfin/accounting-core';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { WorkerConfig } from './config.js';

const execFileAsync = promisify(execFile);

interface ModelResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  error?: {
    code?: string;
    message?: string;
  };
}

function cleanJsonText(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

function contentText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) =>
        typeof item === 'object' && item !== null && 'text' in item
          ? String((item as { text?: unknown }).text ?? '')
          : ''
      )
      .join('');
  }
  throw new Error('Model response did not contain text content');
}

async function callModel(
  config: WorkerConfig,
  task: 'vision' | 'synthesis',
  messages: Array<Record<string, unknown>>,
  traceId: string
): Promise<ExtractedAccountingDocument> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.MODEL_TIMEOUT_MS);
  const headers = new Headers({
    'content-type': 'application/json',
    'x-cherryfin-task': task,
    'x-cherryfin-privacy': 'private',
    'x-trace-id': traceId
  });
  if (config.INTERNAL_API_KEY) {
    headers.set('x-internal-api-key', config.INTERNAL_API_KEY);
  }

  try {
    const response = await fetch(
      new URL('/v1/chat/completions', config.MODEL_GATEWAY_URL),
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages,
          temperature: 0,
          max_tokens: 2_000,
          response_format: { type: 'json_object' }
        }),
        signal: controller.signal
      }
    );
    const payload = (await response.json()) as ModelResponse;
    if (!response.ok) {
      throw new Error(
        payload.error?.message ?? `Model gateway returned HTTP ${response.status}`
      );
    }
    const rawContent = contentText(payload.choices?.[0]?.message?.content);
    const parsed = JSON.parse(cleanJsonText(rawContent)) as unknown;
    return ExtractedAccountingDocumentSchema.parse(parsed);
  } finally {
    clearTimeout(timeout);
  }
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return null;
}

function amount(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      `${escaped}[^0-9]{0,24}([0-9][0-9,]*(?:\\.[0-9]{1,4})?)`,
      'i'
    );
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].replaceAll(',', '');
    }
  }
  return null;
}

function dateValue(text: string): string | null {
  const iso = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso?.[1] && iso[2] && iso[3]) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  }
  const local = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](25\d{2}|20\d{2})\b/);
  if (local?.[1] && local[2] && local[3]) {
    const yearNumber = Number(local[3]);
    const year = yearNumber > 2400 ? yearNumber - 543 : yearNumber;
    return `${year}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}`;
  }
  return null;
}

function heuristicExtraction(text: string): ExtractedAccountingDocument | null {
  const compact = text.replace(/\u0000/g, ' ').replace(/[ \t]+/g, ' ');
  const totalAmount = amount(compact, [
    'ยอดรวมสุทธิ',
    'รวมทั้งสิ้น',
    'จำนวนเงินรวม',
    'grand total',
    'total amount',
    'total'
  ]);
  if (!totalAmount) {
    return null;
  }
  const vatAmount = amount(compact, [
    'ภาษีมูลค่าเพิ่ม',
    'vat 7%',
    'vat'
  ]);
  const subtotal = amount(compact, [
    'มูลค่าก่อนภาษี',
    'มูลค่าสินค้า',
    'subtotal',
    'before vat'
  ]);
  const withholdingTaxAmount = amount(compact, [
    'ภาษีหัก ณ ที่จ่าย',
    'หัก ณ ที่จ่าย',
    'withholding tax',
    'wht'
  ]);
  const lower = compact.toLowerCase();
  const documentType = lower.includes('ใบเสร็จ') || lower.includes('receipt')
    ? 'receipt'
    : lower.includes('ใบกำกับ') || lower.includes('invoice')
      ? 'invoice'
      : 'other';
  const documentNumber = firstMatch(compact, [
    /(?:เลขที่|document\s*no\.?|invoice\s*no\.?)\s*[:#]?\s*([A-Z0-9][A-Z0-9/_-]{2,})/i
  ]);
  const taxIds = compact.match(/\b\d{13}\b/g) ?? [];
  const counterpartyName = firstMatch(compact, [
    /(?:ผู้ขาย|seller|vendor)\s*[:：]?\s*([^\n]{3,100})/i,
    /(?:บริษัท|ห้างหุ้นส่วน)\s+([^\n]{3,100})/i
  ]);
  const evidence = [
    ['totalAmount', totalAmount],
    ['subtotal', subtotal],
    ['vatAmount', vatAmount],
    ['withholdingTaxAmount', withholdingTaxAmount],
    ['documentNumber', documentNumber]
  ]
    .filter((item): item is [string, string] => Boolean(item[1]))
    .map(([fieldName, value]) => ({
      fieldName,
      value,
      confidence: 0.65
    }));

  return ExtractedAccountingDocumentSchema.parse({
    schemaVersion: '1.0',
    documentType,
    direction: 'unknown',
    documentNumber,
    issueDate: dateValue(compact),
    counterpartyName,
    counterpartyTaxId: taxIds[0] ?? null,
    currency: 'THB',
    subtotal,
    vatAmount,
    withholdingTaxAmount,
    totalAmount,
    description: documentNumber ? `Document ${documentNumber}` : null,
    confidence: 'low',
    extractionMethod: 'text',
    fields: evidence,
    raw: {
      parser: 'cherryfin-text-heuristic-1.0',
      detectedTaxIdCount: taxIds.length
    }
  });
}

async function extractText(
  text: string,
  config: WorkerConfig,
  traceId: string,
  method: 'text' | 'pdf_text'
): Promise<ExtractedAccountingDocument> {
  const heuristic = heuristicExtraction(text);
  try {
    const result = await callModel(
      config,
      'synthesis',
      [
        { role: 'system', content: ExtractionPrompt },
        {
          role: 'user',
          content: `Extract this private accounting document text. Never invent missing fields.\n\n${text.slice(0, 60_000)}`
        }
      ],
      traceId
    );
    return { ...result, extractionMethod: method };
  } catch (error) {
    if (heuristic) {
      return { ...heuristic, extractionMethod: method };
    }
    throw error;
  }
}

async function extractImage(
  buffer: Buffer,
  mimeType: string,
  config: WorkerConfig,
  traceId: string
): Promise<ExtractedAccountingDocument> {
  if (buffer.byteLength > config.MAX_INLINE_IMAGE_BYTES) {
    throw new Error(
      `Image exceeds inline vision limit of ${config.MAX_INLINE_IMAGE_BYTES} bytes`
    );
  }
  const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
  const result = await callModel(
    config,
    'vision',
    [
      { role: 'system', content: ExtractionPrompt },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extract this private Thai accounting document. Return JSON only and leave unreadable fields null.'
          },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }
    ],
    traceId
  );
  return { ...result, extractionMethod: 'vision' };
}

async function extractPdf(
  buffer: Buffer,
  config: WorkerConfig,
  traceId: string
): Promise<ExtractedAccountingDocument> {
  const directory = await mkdtemp(join(tmpdir(), 'cherryfin-pdf-'));
  const pdfPath = join(directory, 'document.pdf');
  const textPath = join(directory, 'document.txt');
  const imageBase = join(directory, 'page');
  try {
    await writeFile(pdfPath, buffer);
    await execFileAsync(
      'pdftotext',
      ['-layout', '-f', '1', '-l', '20', pdfPath, textPath],
      { timeout: 30_000, maxBuffer: 1_000_000 }
    ).catch(() => undefined);
    const text = await readFile(textPath, 'utf8').catch(() => '');
    if (text.replace(/\s/g, '').length >= 20) {
      return extractText(text, config, traceId, 'pdf_text');
    }

    await execFileAsync(
      'pdftoppm',
      ['-f', '1', '-singlefile', '-png', '-r', '150', pdfPath, imageBase],
      { timeout: 45_000, maxBuffer: 1_000_000 }
    );
    const image = await readFile(`${imageBase}.png`);
    return extractImage(image, 'image/png', config, traceId);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function extractDocument(
  buffer: Buffer,
  mimeType: string,
  config: WorkerConfig,
  traceId: string
): Promise<ExtractedAccountingDocument> {
  if (mimeType === 'application/json') {
    const parsed = JSON.parse(buffer.toString('utf8')) as unknown;
    return {
      ...ExtractedAccountingDocumentSchema.parse(parsed),
      extractionMethod: 'json'
    };
  }
  if (mimeType === 'text/plain' || mimeType === 'text/csv') {
    return extractText(buffer.toString('utf8'), config, traceId, 'text');
  }
  if (mimeType === 'application/pdf') {
    return extractPdf(buffer, config, traceId);
  }
  if (['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) {
    return extractImage(buffer, mimeType, config, traceId);
  }
  throw new Error(`Unsupported extraction media type: ${mimeType}`);
}
