import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chmod, mkdir } from 'node:fs/promises';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const dataDir = path.resolve(process.env.TAXISNET_DATA_DIR ?? path.join(projectRoot, '.private'));
export const statePath = path.join(dataDir, 'session.json');
export const landingPath = path.join(dataDir, 'landing.json');
export const origin = 'https://taxisnet.mof.gov.cy';
export const loginUrl = `${origin}/displayWelcome.do`;

export async function preparePrivateDir() {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  await chmod(dataDir, 0o700);
}
