import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amount, declaredDeductions, parseHistory, parseReturn, returnSummary } from '../src/parse.js';
import { historyHtml, record, returnHtml } from './fixtures.js';
import { routes } from '../src/routes.js';

test('history parser separates record and status links despite nested layout tables', () => {
  assert.deepEqual(parseHistory(historyHtml, routes.historyList), [record]);
});

test('return parser preserves decimal precision, blanks and employment relief outside Part 5', () => {
  const data = parseReturn(returnHtml, record, routes.print, '2026-11-08T12:00:00.000Z');
  const deductions = declaredDeductions(data);
  assert.equal(deductions.appliedFields.employmentReliefDeclared.decimal, '30000');
  assert.equal(deductions.appliedFields.ghsApplied.decimal, '1500');
  assert.equal(deductions.miscellaneous[0].amount.decimal, null);
  assert.equal(deductions.miscellaneous[1].amount.decimal, '120');
  assert.deepEqual(deductions.contributions[0].amount, { raw: '4000', decimal: '4000' });
  assert.equal(returnSummary(data).selfAssessedTaxDueOrRefund.decimal, '100.00');
  assert.equal(data.fields.find(f => f.id === 'fundOwner')?.value, '');
  assert.ok(!JSON.stringify(data).includes('DO_NOT_EXPOSE'));
  assert.ok(!JSON.stringify(data.tables).includes('SPOUSE'));
});

test('layout drift and unverified years fail instead of returning incomplete deductions', () => {
  const data = parseReturn(returnHtml, record, routes.print, '2026-11-08T12:00:00.000Z');
  assert.throws(() => declaredDeductions({ ...data, tables: [] }), /tables are missing/);
  assert.throws(() => returnSummary({ ...data, record: { ...record, taxYear: 2024 } }), /2025/);
  assert.throws(() => parseReturn('<html>Maintenance</html>', record, routes.print, new Date().toISOString()), /complete English/);
  assert.throws(() => parseReturn(returnHtml.replace('Tax Year 2025', 'Tax Year 2024'), record, routes.print, new Date().toISOString()), /complete English/);
  assert.throws(() => parseHistory(historyHtml.replace('Doc. Number', 'Changed header'), routes.historyList), /history/);
  assert.throws(() => amount('1,234'), /unrecognised/);
  assert.deepEqual(amount('-99,05'), { raw: '-99,05', decimal: '-99.05' });
});
