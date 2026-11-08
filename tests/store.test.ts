import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findEvidence, PortalError, readSnapshot, snapshotSchema } from '../src/store.js';

const sample = {
  source: 'taxisnet', url: 'https://taxisnet.mof.gov.cy/example-view',
  fetchedAt: '2026-11-08T12:00:00.000Z', title: 'Synthetic test fixture',
  text: '2025\nLife insurance\n125.00\nEnd', links: [], tables: [],
  fields: [{ name: 'exampleInsurance', label: 'Life insurance', value: '125.00' }],
};

test('evidence preserves exact values, context and capture date', () => {
  const result = findEvidence(snapshotSchema.parse(sample), 'LIFE INSURANCE');
  assert.equal(result.matches[0].text, '2025\nLife insurance\n125.00');
  assert.equal(result.fields[0].value, '125.00');
  assert.equal(result.fetchedAt, sample.fetchedAt);
  assert.equal(result.cached, true);
  assert.equal(findEvidence(snapshotSchema.parse(sample), 'pension').matches.length, 0);
});

test('rejects an external source URL', () => {
  assert.equal(snapshotSchema.safeParse({ ...sample, url: 'https://taxisnet.mof.gov.cy.evil.test/' }).success, false);
});

test('missing and malformed snapshots give actionable errors without leaking file contents', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'taxisnet-test-'));
  const file = path.join(dir, 'snapshot.json');
  try {
    await assert.rejects(readSnapshot(file), (e: unknown) => e instanceof PortalError && e.code === 'LOGIN_REQUIRED');
    await writeFile(file, '{"sensitive-token":"never-return-me"}');
    await assert.rejects(readSnapshot(file), (e: unknown) => e instanceof PortalError && e.code === 'INVALID_SNAPSHOT' && !e.message.includes('never-return-me'));
    await writeFile(file, JSON.stringify(sample));
    assert.equal((await readSnapshot(file)).text, sample.text);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
