import { open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { dataDir, preparePrivateDir } from './config.js';
import { PortalError } from './store.js';

export async function withSessionLock<T>(operation: () => Promise<T>): Promise<T> {
  await preparePrivateDir();
  const lockPath = path.join(dataDir, 'session.lock');
  const deadline = Date.now() + 10_000;
  let handle;
  while (!handle) {
    try { handle = await open(lockPath, 'wx', 0o600); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (Date.now() >= deadline) throw new PortalError('SESSION_BUSY', 'Another process is using the Taxisnet session. Retry after it finishes. If it crashed, remove .private/session.lock only after stopping all connector processes.');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  try { await handle.writeFile(String(process.pid)); return await operation(); }
  finally { await handle.close(); await unlink(lockPath); }
}
