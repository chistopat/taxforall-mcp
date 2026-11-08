import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { loginHtml, homeHtml, historyHtml, returnHtml, record } from './fixtures.js';

const dir = await mkdtemp(path.join(tmpdir(), 'taxisnet-http-'));
process.env.TAXISNET_DATA_DIR = dir;
const { TaxisnetHttp } = await import('../src/http.js');
const { TaxService } = await import('../src/service.js');
const { routes, assertReadUrl } = await import('../src/routes.js');
after(async () => { await rm(dir, { recursive: true, force: true }); });

const html = (body: string, headers: Record<string, string> = {}) => new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8', ...headers } });

test('route allowlist blocks writes, extra query args, duplicate dispatch and foreign hosts', () => {
  for (const url of [
    'https://taxisnet.mof.gov.cy/processLogout.do',
    'https://taxisnet.mof.gov.cy/basic/directDocManagement.do?dispatch=prevTaxYears.epr1',
    routes.history + '&dispatch=create', record.url + '&changeStatus=temporary',
    'https://taxisnet.mof.gov.cy.evil.test/basic/displayMain.do',
  ]) assert.throws(() => assertReadUrl(url), /read|verified/i);
  assert.equal(assertReadUrl(record.url).href, record.url);
});

test('browser-free login handles cookies and redirects; service reads and caches without POSTing returns', async () => {
  const requests: { url: string; method: string }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, method: init?.method ?? 'GET' });
    if (url.endsWith('/displayWelcome.do')) return html(loginHtml, { 'Set-Cookie': 'JSESSIONID=prelogin; Path=/; Secure; HttpOnly' });
    if (url.endsWith('/j_security_check')) {
      assert.equal(init?.method, 'POST');
      assert.equal(new Headers(init?.headers).get('cookie'), 'JSESSIONID=prelogin');
      assert.equal((init?.body as URLSearchParams).get('j_password'), 'fake & test=password');
      return new Response(null, { status: 302, headers: { Location: routes.home, 'Set-Cookie': 'JSESSIONID=authed; Path=/; Secure; HttpOnly' } });
    }
    assert.equal(new Headers(init?.headers).get('cookie'), 'JSESSIONID=authed');
    if (url === routes.home || url === routes.owner || url === record.url) return html(homeHtml);
    if (url === routes.history) return new Response(null, { status: 302, headers: { Location: '/epr1/chooseEPR1Type.do?forAction=history' } });
    if (url.endsWith('/epr1/chooseEPR1Type.do?forAction=history')) return new Response(null, { status: 302, headers: { Location: routes.historyList } });
    if (url === routes.historyList) return html(historyHtml);
    if (url === routes.print) return html(returnHtml);
    throw new Error('Unexpected URL');
  };
  const client = new TaxisnetHttp(undefined, fetcher);
  await client.login({ username: 'test-account', password: 'fake & test=password' });
  const saved = await readFile(path.join(dir, 'session.json'), 'utf8');
  assert.ok(!saved.includes('fake & test=password'));
  const service = new TaxService(() => TaxisnetHttp.fromSavedSession(fetcher), async () => null);
  assert.equal((await service.listReturns('refresh')).returns[0].id, record.id);
  const deductions = await service.getDeductions(record.id, 'refresh');
  assert.equal(deductions.contributions[0].amount.decimal, '4000');
  assert.equal(deductions.cached, false);
  const previous = requests.length;
  assert.equal((await service.getDeductions(record.id)).cached, true);
  assert.equal(requests.length, previous);
  assert.deepEqual(requests.filter(r => r.method === 'POST').map(r => r.url), ['https://taxisnet.mof.gov.cy/j_security_check']);
});

test('expired sessions and cross-origin redirects stop before requesting another site', async () => {
  let calls = 0;
  const expired = new TaxisnetHttp(undefined, async () => { calls++; return new Response(null, { status: 302, headers: { Location: '/displayWelcome.do' } }); });
  await assert.rejects(expired.read(routes.home), /Session expired/);
  assert.equal(calls, 1);
  const redirected = new TaxisnetHttp(undefined, async () => new Response(null, { status: 302, headers: { Location: 'https://evil.test/' } }));
  await assert.rejects(redirected.read(routes.home), /unverified/);
});

test('unexpected login action and failed login do not leak or retry credentials', async () => {
  let calls = 0;
  const wrongAction = new TaxisnetHttp(undefined, async () => { calls++; return html(loginHtml.replace('action="j_security_check"', 'action="https://evil.test/collect"')); });
  await assert.rejects(wrongAction.login({ username: 'test', password: 'synthetic-secret' }), /Credentials were not sent/);
  assert.equal(calls, 1);
  calls = 0;
  const rejected = new TaxisnetHttp(undefined, async () => { calls++; return html(loginHtml); });
  await assert.rejects(rejected.login({ username: 'test', password: 'synthetic-secret' }), e => e instanceof Error && !e.message.includes('synthetic-secret') && /No automatic retry/.test(e.message));
  assert.equal(calls, 2);
});

test('explicit stale-cache reads work offline, auto reads fail on network errors, and another account cannot read the cache', async () => {
  const cacheFile = path.join(dir, `return-${record.id}.json`);
  const cache = JSON.parse(await readFile(cacheFile, 'utf8'));
  cache.fetchedAt = '2000-01-01T00:00:00.000Z';
  const { writeFile } = await import('node:fs/promises');
  await writeFile(cacheFile, JSON.stringify(cache));
  const offline: typeof fetch = async () => { throw new Error('Offline'); };
  const service = new TaxService(() => TaxisnetHttp.fromSavedSession(offline), async () => null);
  const data = await service.getReturn(record.id, 'cached');
  assert.equal(data.stale, true);
  await assert.rejects(service.getReturn(record.id, 'auto'), /could not be reached/);
  const previousUsername = process.env.TAXISNET_USERNAME;
  try {
    process.env.TAXISNET_USERNAME = 'different-test-account';
    await assert.rejects(service.getReturn(record.id, 'cached'), /No cache/);
  } finally {
    if (previousUsername === undefined) delete process.env.TAXISNET_USERNAME;
    else process.env.TAXISNET_USERNAME = previousUsername;
  }
});

test('automatic HTTP re-login succeeds once and pauses after a failed login', async () => {
  let loggedIn = false;
  let posts = 0;
  const fetcher: typeof fetch = async (input, init) => {
    if (String(input).endsWith('/displayWelcome.do')) return html(loginHtml);
    if (init?.method === 'POST') { posts++; loggedIn = true; return html(homeHtml); }
    return html(loggedIn ? homeHtml : loginHtml);
  };
  const credentials = async () => ({ username: 'automatic-test-account', password: 'synthetic-password' });
  const service = new TaxService(async () => new TaxisnetHttp(undefined, fetcher), credentials);
  assert.equal((await service.checkConnection()).connected, true);
  assert.equal(posts, 1);
  let failedPosts = 0;
  const rejected = new TaxService(async () => new TaxisnetHttp(undefined, async (_url, init) => {
    if (init?.method === 'POST') failedPosts++;
    return html(loginHtml);
  }), credentials);
  await assert.rejects(rejected.checkConnection(), /did not confirm login/);
  await assert.rejects(rejected.checkConnection(), /Automatic login stopped/);
  assert.equal(failedPosts, 1);
});
