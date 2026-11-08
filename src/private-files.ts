import { randomUUID } from 'node:crypto';
import { chmod, rename, unlink, writeFile } from 'node:fs/promises';
import { preparePrivateDir } from './config.js';

export async function writePrivateJson(file: string, value: unknown) {
  await preparePrivateDir();
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600 });
    await rename(temporary, file);
    await chmod(file, 0o600);
  } finally { await unlink(temporary).catch(() => {}); }
}
