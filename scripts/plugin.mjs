#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [action, ...args] = process.argv.slice(2);
const runner = fileURLToPath(new URL('../plugins/taxforall-mcp/run.mjs', import.meta.url));
function run(command, argv) {
  const result = spawnSync(command, argv, { stdio: 'inherit', shell: false });
  if (result.error) {
    console.error(`Could not start ${command}. Install it and make sure it is on PATH.`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (Number(process.versions.node.split('.')[0]) < 22) {
  console.error('TaxForAll requires Node.js 22 or later.');
  process.exit(1);
}
if (action === 'install') {
  const [host, ...flags] = args;
  if (!['codex', 'claude', 'both'].includes(host) || flags.some(flag => !['--login', '--remember'].includes(flag)) || (flags.includes('--remember') && !flags.includes('--login'))) {
    console.error('Usage: taxforall-plugin install codex|claude|both [--login [--remember]]');
    process.exit(1);
  }
  if (flags.includes('--remember') && process.platform !== 'darwin') {
    console.error('--remember requires macOS Keychain. Omit it on this platform.');
    process.exit(1);
  }
  for (const client of host === 'both' ? ['codex', 'claude'] : [host]) {
    run(client, ['plugin', '--help']);
  }
  for (const client of host === 'both' ? ['codex', 'claude'] : [host]) {
    run(client, ['plugin', 'marketplace', 'add', 'chistopat/taxforall-mcp']);
    run(client, ['plugin', client === 'codex' ? 'add' : 'install', 'taxforall-mcp@taxforall']);
  }
  if (flags.includes('--login')) run(process.execPath, [runner, 'login', ...(flags.includes('--remember') ? ['--remember'] : [])]);
  console.log('TaxForAll installed. Start a new client session.');
  if (!flags.includes('--login')) console.log('First use: run taxforall-plugin login (add --remember for macOS Keychain).');
} else if (['login', 'serve'].includes(action)) {
  run(process.execPath, [runner, action, ...args]);
} else {
  console.log('Usage: taxforall-plugin install codex|claude|both [--login [--remember]]\n       taxforall-plugin login [--remember] [--interactive]\n       taxforall-plugin serve');
  if (action && !['--help', '-h', 'help'].includes(action)) process.exitCode = 1;
}
