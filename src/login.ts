import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { TaxisnetHttp } from './http.js';
import { readCredentials, rememberCredentials } from './credentials.js';
import { PortalError } from './store.js';
import { writePrivateJson } from './private-files.js';
import { landingPath } from './config.js';
import { htmlSnapshot } from './snapshot.js';
import { withSessionLock } from './lock.js';

try {
  let credentials = process.argv.includes('--interactive') ? null : await readCredentials();
  if (!credentials) {
    if (!process.stdin.isTTY) throw new PortalError('CREDENTIALS_REQUIRED', 'Run npm run login in a terminal, or provide TAXISNET_USERNAME and TAXISNET_PASSWORD in the process environment.');
    let muted = false;
    const output = new Writable({ write(chunk, _encoding, callback) { if (!muted) process.stderr.write(chunk); callback(); } });
    const input = createInterface({ input: process.stdin, output, terminal: true });
    try {
      const username = (await input.question('Taxisnet username: ')).trim();
      process.stderr.write('Taxisnet password (hidden): ');
      muted = true;
      const password = await input.question('');
      process.stderr.write('\n');
      credentials = { username, password };
    } finally { input.close(); }
  }
  if (!credentials.username || !credentials.password) throw new PortalError('CREDENTIALS_REQUIRED', 'Both username and password are required.');
  const client = new TaxisnetHttp();
  const response = await withSessionLock(() => client.login(credentials!));
  await writePrivateJson(landingPath, htmlSnapshot(response.html, response.url));
  if (process.argv.includes('--remember')) await rememberCredentials(credentials);
  console.error(`HTTP login confirmed. Session saved locally.${process.argv.includes('--remember') ? ' Password saved in macOS Keychain for automatic re-login.' : ''}`);
} catch (error) {
  console.error(error instanceof PortalError ? `${error.code}: ${error.message}` : 'Login failed. No credentials have been printed.');
  process.exitCode = 1;
}
