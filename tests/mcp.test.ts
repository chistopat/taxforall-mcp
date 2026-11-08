import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

test('MCP stdio exposes read-only tools and handles missing login without leaking session data', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'taxforall-mcp-'));
  const client = new Client({ name: 'integration-test', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve('dist/server.js')],
    env: { TAXISNET_DATA_DIR: dir },
    stderr: 'pipe',
  });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 7);
    assert.ok(tools.every(tool => tool.annotations?.readOnlyHint === true));
    const before = await client.callTool({ name: 'get_connection_status', arguments: {} });
    assert.match(JSON.stringify(before), /sessionSaved\\":false/);
    const missing = await client.callTool({ name: 'read_account_snapshot', arguments: {} });
    assert.equal(missing.isError, true);
    assert.match(JSON.stringify(missing), /LOGIN_REQUIRED/);
    await writeFile(path.join(dir, 'session.json'), '{"cookies":[{"value":"NEVER_EXPOSE_THIS"}]}');
    const after = await client.callTool({ name: 'get_connection_status', arguments: {} });
    assert.match(JSON.stringify(after), /sessionSaved\\":true/);
    assert.ok(!JSON.stringify(after).includes('NEVER_EXPOSE_THIS'));
  } finally {
    await client.close();
    await rm(dir, { recursive: true, force: true });
  }
});
