import { spawn, spawnSync } from 'node:child_process';

// Project-local account choice: do not switch gh's global active account.
const account = 'chistopat';
const gh = process.env.TAXFORALL_GH_PATH ?? '/opt/homebrew/bin/gh';
const args = process.argv.slice(2);
if (!args.length) {
  console.error('Usage: npm run github -- <gh arguments>');
  process.exit(1);
}
const lookupEnv = { ...process.env };
delete lookupEnv.GH_TOKEN;
delete lookupEnv.GITHUB_TOKEN;
const result = spawnSync(gh, ['auth', 'token', '--hostname', 'github.com', '--user', account], {
  encoding: 'utf8', env: lookupEnv, stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000,
});
const token = result.stdout?.trim();
if (result.status !== 0 || !token) {
  console.error('No saved GitHub credentials for chistopat. Authenticate that account with gh first.');
  process.exit(1);
}
const child = spawn(gh, args, {
  env: { ...lookupEnv, GH_HOST: 'github.com', GH_TOKEN: token },
  stdio: 'inherit',
});
child.on('error', () => { console.error('Could not start GitHub CLI.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
