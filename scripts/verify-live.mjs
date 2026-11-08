import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const client = new Client({ name: 'taxforall-live-check', version: '0.1.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('../dist/server.js', import.meta.url))],
  stderr: 'pipe',
});
async function call(name, args = {}) {
  const response = await client.callTool({ name, arguments: args });
  const payload = JSON.parse(response.content.find(c => c.type === 'text').text);
  if (response.isError) throw new Error(`${name}: ${payload.code}: ${payload.message}`);
  return payload;
}

try {
  await client.connect(transport);
  const connection = await call('check_connection');
  console.log(JSON.stringify({ step: 'connection', ...connection }));
  const history = await call('list_returns', { mode: 'refresh' });
  console.log(JSON.stringify({ step: 'history', count: history.returns.length, cached: history.cached, years: history.returns.map(r => r.taxYear) }));
  const record = history.returns.find(r => r.taxYear === 2025 && r.type === 'E');
  assert.ok(record, 'No supported 2025 employee return is available to verify.');
  const declaration = await call('get_return', { returnId: record.id, mode: 'refresh', detail: 'full' });
  assert.equal(declaration.cached, false);
  assert.equal(declaration.record.id, record.id);
  const deductions = await call('get_declared_deductions', { returnId: record.id, mode: 'cached' });
  assert.equal(deductions.cached, true);
  assert.ok(Object.keys(deductions.appliedFields).length > 0);
  const cached = await call('get_return', { returnId: record.id, mode: 'cached' });
  assert.deepEqual(cached.summary, declaration.summary);
  console.log(JSON.stringify({
    step: 'return_and_deductions', taxYear: record.taxYear, status: record.status,
    fieldCount: declaration.fields.length, tableCount: declaration.tables.length,
    appliedDeductionFieldCount: Object.keys(deductions.appliedFields).length,
    contributionRowCount: deductions.contributions.length,
    cachedRoundTripMatches: true, fetchedAt: declaration.fetchedAt,
  }));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Live verification failed.');
  process.exitCode = 1;
} finally { await client.close(); }
