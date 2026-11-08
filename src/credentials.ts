import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { dataDir } from './config.js';
import { PortalError } from './store.js';
import { writePrivateJson } from './private-files.js';

const execFileAsync = promisify(execFile);
const service = 'cy.taxisnet.mcp';
const accountFile = path.join(dataDir, 'account.json');
export type Credentials = { username: string; password: string };

export async function readCredentials(): Promise<Credentials | null> {
  const username = process.env.TAXISNET_USERNAME;
  const password = process.env.TAXISNET_PASSWORD;
  if (username && password) return { username, password };
  if (process.platform !== 'darwin') return null;
  let account: string;
  try { account = JSON.parse(await readFile(accountFile, 'utf8')).username; }
  catch { return null; }
  if (typeof account !== 'string' || !account) return null;
  try {
    const { stdout } = await execFileAsync('/usr/bin/security', ['find-generic-password', '-s', service, '-a', account, '-w'], { timeout: 15_000 });
    return { username: account, password: stdout.replace(/\r?\n$/, '') };
  } catch { throw new PortalError('KEYCHAIN_UNAVAILABLE', 'Cannot read the saved password from macOS Keychain. Run npm run login or check Keychain access.'); }
}

export async function rememberCredentials(credentials: Credentials) {
  if (process.platform !== 'darwin') throw new PortalError('KEYCHAIN_UNAVAILABLE', '--remember currently supports macOS Keychain only.');
  const quote = (value: string) => {
    if (/[\r\n\0]/.test(value)) throw new PortalError('INVALID_CREDENTIALS', 'Keychain credentials cannot contain line breaks.');
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  };
  const command = `add-generic-password -U -s ${quote(service)} -a ${quote(credentials.username)} -w ${quote(credentials.password)}\n`;
  // Pipe interactive input so the secret is not exposed in the process argv.
  await new Promise<void>((resolve, reject) => {
    const child = spawn('/usr/bin/security', ['-i'], { stdio: ['pipe', 'ignore', 'ignore'] });
    const timer = setTimeout(() => { child.kill(); reject(new PortalError('KEYCHAIN_UNAVAILABLE', 'Keychain write timed out.')); }, 30_000);
    child.on('error', () => { clearTimeout(timer); reject(new PortalError('KEYCHAIN_UNAVAILABLE', 'Keychain could not be opened.')); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new PortalError('KEYCHAIN_UNAVAILABLE', 'Password was not saved in Keychain.')); });
    child.stdin.on('error', () => {});
    child.stdin.end(command);
  });
  try {
    const { stdout } = await execFileAsync('/usr/bin/security', ['find-generic-password', '-s', service, '-a', credentials.username, '-w'], { timeout: 15_000 });
    if (stdout.replace(/\r?\n$/, '') !== credentials.password) throw new Error();
  } catch { throw new PortalError('KEYCHAIN_UNAVAILABLE', 'The Keychain password could not be verified. The HTTP session is saved, but automatic re-login is not configured.'); }
  await writePrivateJson(accountFile, { username: credentials.username, service });
}
