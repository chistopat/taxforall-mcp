import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

test('packaged plugin runs without project dependencies for both host manifests', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'taxforall-plugin-'));
  const plugin = path.join(dir, 'plugin with spaces');
  try {
    await cp('plugins/taxforall-mcp', plugin, { recursive: true });
    for (const manifestName of ['mcp.json', '.mcp.json', 'codex.mcp.json']) {
      const manifest = JSON.parse(await readFile(path.join(plugin, manifestName), 'utf8'));
      const config = manifest.mcpServers['taxforall-mcp'];
      const args = config.args.map((arg: string) => arg.replace(/\$\{(?:CLAUDE_)?PLUGIN_ROOT\}/g, plugin));
      const client = new Client({ name: 'plugin-package-test', version: '1.0.0' });
      try {
        await client.connect(new StdioClientTransport({
          command: process.execPath, args, cwd: dir,
          env: { TAXISNET_DATA_DIR: path.join(dir, 'private') }, stderr: 'pipe',
        }));
        const { tools } = await client.listTools();
        assert.equal(tools.length, 7);
        assert.ok(tools.every(tool => tool.annotations?.readOnlyHint));
        const result = await client.callTool({ name: 'get_connection_status', arguments: {} });
        assert.equal(result.isError, undefined);
        assert.match(JSON.stringify(result), /sessionSaved\\":false/);
      } finally { await client.close(); }
    }
    const login = spawnSync(process.execPath, [path.join(plugin, 'run.mjs'), 'login', '--interactive'], {
      cwd: dir, env: { TAXISNET_DATA_DIR: path.join(dir, 'private') }, encoding: 'utf8',
    });
    assert.equal(login.status, 1);
    assert.match(login.stderr, /CREDENTIALS_REQUIRED/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('installer rejects unsupported flags before changing host configuration', () => {
  for (const args of [['install', 'unknown'], ['install', 'both', '--remember'], ['install', 'codex', '--bogus']]) {
    const result = spawnSync(process.execPath, ['scripts/plugin.mjs', ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage:/);
  }
});
