import { readFile, stat } from 'node:fs/promises';
import { z } from 'zod';
import { landingPath, origin, statePath } from './config.js';

const sourceUrl = z.string().url().refine(value => {
  const url = new URL(value);
  return url.origin === origin && !url.username && !url.password;
}, 'Expected a Cyprus Taxisnet source URL');

export const snapshotSchema = z.object({
  source: z.literal('taxisnet'),
  url: sourceUrl,
  fetchedAt: z.string().datetime(),
  title: z.string(),
  text: z.string(),
  links: z.array(z.object({ text: z.string(), url: z.string() })),
  fields: z.array(z.object({ name: z.string(), label: z.string(), value: z.string(), checked: z.boolean().optional() })),
  tables: z.array(z.array(z.array(z.string()))),
});

export class PortalError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export async function readSnapshot(filePath = landingPath) {
  let raw: string;
  try { raw = await readFile(filePath, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new PortalError('LOGIN_REQUIRED', 'Run npm run login in the project folder to sign in over HTTP.');
    }
    throw new PortalError('LOCAL_READ_FAILED', 'The private snapshot could not be read. Check local file permissions.');
  }
  try { return snapshotSchema.parse(JSON.parse(raw)); }
  catch { throw new PortalError('INVALID_SNAPSHOT', 'The stored snapshot is invalid. Run npm run login again.'); }
}

export async function sessionStatus() {
  let savedAt: string | null = null;
  try { savedAt = (await stat(statePath)).mtime.toISOString(); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new PortalError('LOCAL_READ_FAILED', 'The local session file could not be inspected.');
    }
  }
  return {
    portal: 'taxisnet',
    sessionSaved: savedAt !== null,
    sessionSavedAt: savedAt,
    liveSessionVerified: false,
    transport: 'http',
    nextStep: savedAt ? 'Call check_connection to verify the session, or list_returns to read declarations.' : 'Run npm run login -- --remember in the project folder for HTTP login and macOS Keychain storage.',
    capabilities: { liveReturns: true, liveDeductions: true, supportedDetailYears: [2025], supportedReturnType: 'employee', taxForAll: false },
  };
}

export function findEvidence(snapshot: z.infer<typeof snapshotSchema>, query: string) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) throw new PortalError('INVALID_QUERY', 'Provide a non-empty search phrase.');
  const lines = snapshot.text.split('\n');
  const matches = lines.flatMap((line, index) => line.toLocaleLowerCase().includes(needle)
    ? [{ line: index + 1, text: lines.slice(Math.max(0, index - 1), index + 2).join('\n') }]
    : []);
  const fields = snapshot.fields.filter(field => `${field.label} ${field.name} ${field.value}`.toLocaleLowerCase().includes(needle));
  return {
    source: snapshot.url,
    fetchedAt: snapshot.fetchedAt,
    cached: true,
    query,
    matches: matches.slice(0, 50),
    fields: fields.slice(0, 50),
    truncated: matches.length > 50 || fields.length > 50,
    interpretation: 'Matches are evidence from the captured page only. No matches does not mean no deductions or returns exist.',
  };
}
