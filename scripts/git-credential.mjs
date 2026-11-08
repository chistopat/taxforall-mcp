import { spawnSync } from 'node:child_process';

// Git credential-helper protocol. Its stdout contains a secret and is for Git only.
if (process.argv[2] !== 'get') process.exit(0);
let input = '';
for await (const chunk of process.stdin) input += chunk;
const fields = Object.fromEntries(input.trim().split('\n').map(line => {
  const separator = line.indexOf('=');
  return [line.slice(0, separator), line.slice(separator + 1)];
}));
if (fields.protocol !== 'https' || fields.host !== 'github.com' ||
    (fields.username && fields.username !== 'chistopat')) process.exit(0);
const env = { ...process.env };
delete env.GH_TOKEN;
delete env.GITHUB_TOKEN;
const result = spawnSync(process.env.TAXFORALL_GH_PATH ?? '/opt/homebrew/bin/gh',
  ['auth', 'token', '--hostname', 'github.com', '--user', 'chistopat'],
  { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000 });
const token = result.stdout?.trim();
if (result.status !== 0 || !token || /[\r\n]/.test(token)) process.exit(1);
process.stdout.write(`username=chistopat\npassword=${token}\n\n`);
