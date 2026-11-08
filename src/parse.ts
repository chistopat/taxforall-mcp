import { load, type CheerioAPI } from 'cheerio';
import { assertReadUrl } from './routes.js';
import { PortalError } from './store.js';

const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

export type ReturnRecord = {
  id: string; number: string; taxYear: number; submissionYear: number;
  type: string; sender: string; taxpayer: string; submittedAt: string; status: string; url: string;
};

export function assertAuthenticatedHtml(html: string) {
  const $ = load(html);
  if ($('input[type=password], #loginForm').length) {
    throw new PortalError('LOGIN_REQUIRED', 'The saved session is missing or expired. Run npm run login.');
  }
}

export function parseHistory(html: string, url: string): ReturnRecord[] {
  assertAuthenticatedHtml(html);
  const $ = load(html);
  const text = clean($('body').text());
  if (!text.includes('VIEW SUBMITTED INCOME TAX RETURNS') || !text.includes('Doc. Number')) {
    throw new PortalError('LAYOUT_CHANGED', 'Expected the English submitted-return history. Sign in using English or update the adapter.');
  }
  if ($('a').toArray().some(a => /^(next|next page|›|»|\d+)$/i.test(clean($(a).text())) && !($(a).attr('href') ?? '').includes('docKey='))) {
    throw new PortalError('PAGINATION_UNSUPPORTED', 'History has additional navigation. The adapter cannot yet guarantee a complete list.');
  }
  const records = new Map<string, ReturnRecord>();
  $('a[href]').each((_, a) => {
    const target = new URL($(a).attr('href')!, url);
    if (target.pathname !== '/epr1/relayDisplayAllEPR1DocumentList.do' || target.searchParams.get('docTaxYear') === 'det') return;
    assertReadUrl(target.href);
    const cells = $(a).closest('tr').children('td').toArray().map(c => clean($(c).text()));
    const start = $(a).closest('td').index();
    const data = cells.slice(start);
    const taxYear = Number(target.searchParams.get('docTaxYear'));
    if (data.length !== 8 || data[2] !== String(taxYear) || !/^\d{4}$/.test(data[3]) || !data[7]) {
      throw new PortalError('LAYOUT_CHANGED', 'A submitted-return row has an unexpected structure.');
    }
    const id = target.searchParams.get('docKey')!;
    records.set(id, { id, number: data[0], type: data[1], taxYear, submissionYear: Number(data[3]),
      sender: data[4], taxpayer: data[5], submittedAt: data[6], status: data[7], url: target.href });
  });
  return [...records.values()];
}

function controlValue($: CheerioAPI, element: Parameters<CheerioAPI>[0]): string {
  const el = $(element);
  if (el.is('select')) {
    const option = el.find('option[selected]').length ? el.find('option[selected]') : el.find('option').first();
    return clean(option.text());
  }
  if (el.is('textarea')) return el.text();
  if (['checkbox', 'radio'].includes(el.attr('type') ?? '')) return el.attr('checked') !== undefined ? 'checked' : '';
  return el.attr('value') ?? '';
}

export function parseReturn(html: string, record: ReturnRecord, url: string, fetchedAt: string) {
  assertAuthenticatedHtml(html);
  const $ = load(html);
  $('script,style,noscript,input[type=hidden],input[type=password]').remove();
  $('br').replaceWith(' ');
  const pageText = clean($('body').text());
  const heading = new RegExp(`Individual \\(other than self-employed\\)\\s*(?:Tax Year\\s*)?${record.taxYear}\\b`);
  if (!heading.test(pageText) ||
      !pageText.includes('PART 5 - DEDUCTIONS / ALLOWANCES') ||
      !$('#fM7T0R16C1').length) {
    throw new PortalError('UNSUPPORTED_RETURN', 'Expected a complete English individual employee return with self-assessment. No partial result was saved.');
  }
  const fields = $('input,select,textarea').toArray()
    .filter(e => !['button', 'submit', 'reset', 'image'].includes($(e).attr('type') ?? ''))
    .map(e => {
      const el = $(e);
      const id = el.attr('id') ?? '';
      const label = $('label').toArray().filter(l => $(l).attr('for') === id).map(l => clean($(l).text())).join(' ');
      const row = el.closest('tr').clone();
      row.find('input,select,textarea').remove();
      return { id, name: el.attr('name') ?? '', label, context: clean(row.text()).slice(0, 1000), value: controlValue($, e) };
    });
  // Keep only the selected option; all option labels would invent values.
  $('input,select,textarea').each((_, e) => { const val = controlValue($, e); $(e).replaceWith($('<span>').text(val)); });
  $('.labelHid,[hidden],[style*="display:none"],[style*="display: none"]').remove();
  const tables = $('table').toArray().filter(t => !$(t).find('table').length)
    .map(t => $(t).find('tr').toArray().map(r => $(r).children('td,th').toArray().map(c => clean($(c).text()))));
  return { record, source: url, fetchedAt, fields, tables };
}

export type ParsedReturn = ReturnType<typeof parseReturn>;

export function amount(raw: string) {
  const value = raw.trim();
  if (!value) return { raw: '', decimal: null };
  if (!/^-?\d+(?:[,.]\d{1,2})?$/.test(value)) {
    throw new PortalError('UNSUPPORTED_AMOUNT', 'An amount uses an unrecognised format; it was not converted.');
  }
  return { raw: value, decimal: value.replace(',', '.') };
}

// Mapping verified on the 2025 employee return. Older layouts need separate verification.
const summaryFields = {
  totalIncome: 'fM7T0R1C1', deductionsSubtotal: 'fM7T0R13C2', netIncome: 'fM7T0R14C1',
  insuranceContributionsBeforeCap: 'fM7T0R15DC1', insuranceContributionsAfterCap: 'fM7T0R15DC2',
  taxableIncome: 'fM7T0R16C1', totalTax: 'fM7T0R19C2', taxWithheld: 'fM7T0R22C1',
  selfAssessedTaxDueOrRefund: 'fM7T0R23C1',
};
const deductionFields = {
  employmentReliefDeclared: 'fM4TAR5C1', otherReliefApplied: 'fM7T0R12C1',
  medicalInsuranceApplied: 'fM7T0R15AC1', ghsApplied: 'fM7T0R15A2C1',
  lifeInsuranceApplied: 'fM7T0R15BC1', providentPensionSocialInsuranceApplied: 'fM7T0R15CC1',
  insuranceContributionsBeforeCap: 'fM7T0R15DC1', insuranceContributionsAfterCap: 'fM7T0R15DC2',
};
function mappedFields(data: ParsedReturn, mapping: Record<string, string>) {
  if (data.record.taxYear !== 2025) throw new PortalError('UNSUPPORTED_TAX_YEAR', 'Structured extraction is verified only for tax year 2025. Request the raw return for other years.');
  return Object.fromEntries(Object.entries(mapping).map(([key, id]) => {
    const field = data.fields.find(f => f.id === id);
    if (!field) throw new PortalError('LAYOUT_CHANGED', `Expected return field ${id} is missing.`);
    return [key, { ...amount(field.value), fieldId: id, label: field.label || field.context }];
  }));
}

export function returnSummary(data: ParsedReturn) {
  return { ...mappedFields(data, summaryFields), interpretation: 'Amounts recorded in this declaration, not a current tax-account balance or proof of payment. Blank values remain null.' };
}

export function declaredDeductions(data: ParsedReturn) {
  const miscellaneous = data.tables.find(t => t[0]?.join('|') === '|DESCRIPTION|AMOUNT');
  const contributions = data.tables.find(t => t[0]?.some(c => c.includes('NAME OF FUND/INSURANCE')));
  const investments = data.tables.find(t => t[0]?.includes(`AMOUNT TO BE CLAIMED IN ${data.record.taxYear}`));
  if (!miscellaneous || !contributions || !investments) throw new PortalError('LAYOUT_CHANGED', 'One or more Part 5 deduction tables are missing.');
  return {
    appliedFields: mappedFields(data, deductionFields),
    miscellaneous: miscellaneous.filter(r => r.length === 3 && /^\d+$/.test(r[0])).map(r => ({ row: r[0], description: r[1], amount: amount(r[2]) })),
    contributions: contributions.filter(r => r.length === 8 && /^\d+$/.test(r[0]) && r[7]).map(r => ({ row: r[0], fundName: r[2], code: r[3], amount: amount(r[7]) })),
    investments: investments.filter(r => r.length === 9 && /^\d+$/.test(r[0]) && r[7]).map(r => ({ row: r[0], year: r[2], code: r[4], claimedThisYear: amount(r[7]) })),
    interpretation: 'Declared/applied amounts only; no conclusion about eligibility for additional relief. Part 5 entries and self-assessment fields overlap: do not add them together. Blank is not zero.',
  };
}
