import { load } from 'cheerio';
import { CookieJar } from 'tough-cookie';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { origin, loginUrl, statePath } from './config.js';
import { assertReadUrl, routes } from './routes.js';
import { PortalError } from './store.js';
import { writePrivateJson } from './private-files.js';
import type { Credentials } from './credentials.js';
import { assertAuthenticatedHtml } from './parse.js';

const authPaths = new Set(['/displayWelcome.do', '/login.jsp', '/j_security_check']);
const maxBytes = 5 * 1024 * 1024;

export class TaxisnetHttp {
  constructor(private jar = new CookieJar(), private fetcher: typeof fetch = fetch, public accountKey = '') {}

  static async fromSavedSession(fetcher: typeof fetch = fetch) {
    let saved;
    try { saved = JSON.parse(await readFile(statePath, 'utf8')); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new TaxisnetHttp(undefined, fetcher);
      throw new PortalError('INVALID_SESSION', 'Cannot read the saved session. Run npm run login again.');
    }
    try {
      if (saved.format !== 'taxisnet-http-v1' || !/^[a-f0-9]{64}$/.test(saved.accountKey)) throw new Error();
      if (process.env.TAXISNET_USERNAME && createHash('sha256').update(process.env.TAXISNET_USERNAME).digest('hex') !== saved.accountKey) {
        return new TaxisnetHttp(undefined, fetcher);
      }
      return new TaxisnetHttp(await CookieJar.deserialize(saved.jar), fetcher, saved.accountKey);
    } catch { throw new PortalError('INVALID_SESSION', 'The session format is invalid. Run npm run login again.'); }
  }

  async saveSession() {
    await writePrivateJson(statePath, { format: 'taxisnet-http-v1', accountKey: this.accountKey, savedAt: new Date().toISOString(), jar: await this.jar.serialize() });
  }

  private async request(value: string, auth = false, body?: URLSearchParams): Promise<{ html: string; url: string }> {
    let url = new URL(value);
    for (let count = 0; count < 8; count++) {
      if (url.origin !== origin || url.username || url.password || url.hash) throw new PortalError('BLOCKED_ROUTE', 'Portal attempted an unverified redirect.');
      if (!auth || !authPaths.has(url.pathname) || url.search) assertReadUrl(url.href);
      if (body && (!auth || url.pathname !== '/j_security_check')) throw new PortalError('BLOCKED_ROUTE', 'Only the login form may use POST.');
      let response: Response;
      try {
        response = await this.fetcher(url.href, {
          method: body ? 'POST' : 'GET', body,
          redirect: 'manual', signal: AbortSignal.timeout(30_000),
          headers: {
            'User-Agent': 'taxforall-mcp/0.1.0', 'Accept-Language': 'en',
            Accept: 'text/html', Cookie: await this.jar.getCookieString(url.href),
            ...(body ? { Origin: origin, Referer: loginUrl } : {}),
          },
        });
      } catch { throw new PortalError('NETWORK_ERROR', 'Taxisnet could not be reached. Try again later.'); }
      for (const cookie of response.headers.getSetCookie()) await this.jar.setCookie(cookie, url.href, { ignoreError: true });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location || (body && [307, 308].includes(response.status))) throw new PortalError('UNEXPECTED_REDIRECT', 'Unsupported login redirect. Credentials were not forwarded.');
        url = new URL(location, url);
        if (!auth && url.origin === origin && authPaths.has(url.pathname)) throw new PortalError('LOGIN_REQUIRED', 'Session expired. Run npm run login or configure saved credentials.');
        body = undefined;
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new PortalError('PORTAL_HTTP_ERROR', `Taxisnet returned HTTP ${response.status}.`);
      }
      if (!response.headers.get('content-type')?.toLowerCase().includes('text/html')) {
        await response.body?.cancel();
        throw new PortalError('UNEXPECTED_RESPONSE', 'Expected an HTML tax page.');
      }
      const chunks: Uint8Array[] = [];
      let length = 0;
      if (!response.body) throw new PortalError('UNEXPECTED_RESPONSE', 'Portal response was empty.');
      const reader = response.body.getReader();
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        length += chunk.length;
        if (length > maxBytes) { await reader.cancel(); throw new PortalError('RESPONSE_TOO_LARGE', 'Portal page exceeded the size limit.'); }
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      const charset = /charset\s*=\s*["']?([\w-]+)/i.exec(response.headers.get('content-type') ?? '')?.[1]
        ?? /charset\s*=\s*["']?([\w-]+)/i.exec(bytes.subarray(0, 4096).toString('ascii'))?.[1] ?? 'utf-8';
      let html: string;
      try { html = new TextDecoder(charset).decode(bytes); }
      catch { throw new PortalError('UNSUPPORTED_ENCODING', 'Portal page has an unsupported text encoding.'); }
      if (!auth) assertAuthenticatedHtml(html);
      return { html, url: url.href };
    }
    throw new PortalError('TOO_MANY_REDIRECTS', 'Taxisnet redirected too many times.');
  }

  async read(url: string) { return this.request(url); }

  async login(credentials: Credentials) {
    this.jar = new CookieJar();
    const page = await this.request(loginUrl, true);
    const $ = load(page.html);
    const form = $('#loginForm');
    if (!form.length || !form.find('[name=j_username]').length || !form.find('[name=j_password]').length) {
      throw new PortalError('LOGIN_FLOW_CHANGED', 'The standard login form is unavailable. The portal may require additional verification.');
    }
    if ($('[name*=captcha i],[id*=captcha i],iframe[src*=captcha i]').length) {
      throw new PortalError('MANUAL_VERIFICATION_REQUIRED', 'The portal requires a CAPTCHA; unattended login cannot continue.');
    }
    const action = new URL(form.attr('action') ?? '', new URL($('base').attr('href') ?? page.url, page.url));
    if (action.href !== `${origin}/j_security_check`) throw new PortalError('LOGIN_FLOW_CHANGED', 'The login destination changed. Credentials were not sent.');
    const body = new URLSearchParams();
    form.find('input[type=hidden][name]').each((_, e) => { body.set($(e).attr('name')!, $(e).attr('value') ?? ''); });
    body.set('j_username', credentials.username);
    body.set('j_password', credentials.password);
    const response = await this.request(action.href, true, body);
    const result = load(response.html);
    if (result('input[type=password]').length || !result('a[href="/processLogout.do"]').length) {
      throw new PortalError('LOGIN_FAILED', 'Taxisnet did not confirm login. Check credentials or extra verification requirements. No automatic retry was made.');
    }
    this.accountKey = createHash('sha256').update(credentials.username).digest('hex');
    await this.saveSession();
    return response;
  }

  async check() {
    const response = await this.read(routes.home);
    if (!load(response.html)('a[href="/processLogout.do"]').length) throw new PortalError('LOGIN_REQUIRED', 'An authenticated account page was not returned.');
    return response;
  }
}
