#!/usr/bin/env node
import path from 'node:path';
import { homedir } from 'node:os';

if (Number(process.versions.node.split('.')[0]) < 22) {
  console.error('TaxForAll requires Node.js 22 or later.');
  process.exit(1);
}

// Keep account state outside disposable plugin caches. Both hosts share this
// path; the existing session lock serializes their access to the portal.
process.env.TAXISNET_DATA_DIR ??= path.join(homedir(), '.local', 'share', 'taxforall-mcp');
const action = process.argv[2] ?? 'serve';
const flags = process.argv.slice(3);
if (['--help', '-h', 'help'].includes(action)) {
  console.log('Usage: node run.mjs [serve | login [--remember] [--interactive]]');
} else if (action === 'serve' && flags.length === 0) {
  await import('./runtime/server.mjs');
} else if (action === 'login' && flags.every(flag => ['--remember', '--interactive'].includes(flag))) {
  await import('./runtime/login.mjs');
} else {
  console.error('Unknown command or option. Use --help.');
  process.exitCode = 1;
}
