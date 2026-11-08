import { build } from 'esbuild';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const result = await build({
  entryPoints: ['src/server.ts', 'src/login.ts'],
  outdir: 'plugins/taxforall-mcp/runtime',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  minify: true,
  legalComments: 'linked',
  metafile: true,
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
});
// esbuild preserves license comments, but many packages keep their full license
// in a separate file. Include those notices in the distributable as well.
const packages = new Set(Object.keys(result.metafile.inputs).flatMap(file => {
  const match = file.match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//);
  return match ? [match[1]] : [];
}));
const notices = [];
for (const dir of [...packages].sort()) {
  const metadata = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
  const licenses = (await readdir(dir)).filter(file => /^(license|licence|copying|notice)(\.|$)/i.test(file)).sort();
  const text = licenses.length
    ? (await Promise.all(licenses.map(file => readFile(path.join(dir, file), 'utf8')))).join('\n')
    : `No separate license file is shipped by this package.\nDeclared license: ${metadata.license}\nAuthor: ${JSON.stringify(metadata.author)}\nRepository: ${JSON.stringify(metadata.repository)}`;
  notices.push(`${metadata.name}@${metadata.version}\n${text}`);
}
await writeFile('plugins/taxforall-mcp/runtime/THIRD_PARTY_NOTICES.txt', notices.join('\n\n--------------------\n\n'));
for (const file of ['plugin.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json']) {
  const url = new URL(`../plugins/taxforall-mcp/${file}`, import.meta.url);
  const manifest = JSON.parse(await readFile(url, 'utf8'));
  manifest.version = pkg.version;
  await writeFile(url, JSON.stringify(manifest, null, 2) + '\n');
}
