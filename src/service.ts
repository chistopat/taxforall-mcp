import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { dataDir, landingPath } from './config.js';
import { readCredentials } from './credentials.js';
import { TaxisnetHttp } from './http.js';
import { withSessionLock } from './lock.js';
import { declaredDeductions, parseHistory, parseReturn, returnSummary, type ParsedReturn, type ReturnRecord } from './parse.js';
import { writePrivateJson } from './private-files.js';
import { returnIdPattern, routes } from './routes.js';
import { htmlSnapshot } from './snapshot.js';
import { PortalError } from './store.js';

export type ReadMode = 'auto' | 'cached' | 'refresh';
const ttl = 5 * 60_000;
const recordSchema = z.object({
  id: z.string().regex(returnIdPattern), number: z.string(), taxYear: z.number().int(), submissionYear: z.number().int(),
  type: z.string(), sender: z.string(), taxpayer: z.string(), submittedAt: z.string(), status: z.string(), url: z.string().url(),
});
const parsedSchema = z.object({
  record: recordSchema, source: z.string().url(), fetchedAt: z.string().datetime(),
  fields: z.array(z.object({ id: z.string(), name: z.string(), label: z.string(), context: z.string(), value: z.string() })),
  tables: z.array(z.array(z.array(z.string()))),
});
function stale(fetchedAt: string) {
  const age = Date.now() - Date.parse(fetchedAt);
  return !Number.isFinite(age) || age < 0 || age > ttl;
}

export class TaxService {
  private automaticLoginFailed = false;
  constructor(private makeClient = () => TaxisnetHttp.fromSavedSession(), private getCredentials = readCredentials) {}

  private async authenticate(client: TaxisnetHttp) {
    try { await client.check(); this.automaticLoginFailed = false; }
    catch (error) {
      if (!(error instanceof PortalError) || error.code !== 'LOGIN_REQUIRED') throw error;
      if (this.automaticLoginFailed) throw new PortalError('AUTO_LOGIN_PAUSED', 'Automatic login stopped after a failed attempt. Run npm run login to check credentials.');
      const credentials = await this.getCredentials();
      if (!credentials) throw error;
      let response;
      try { response = await client.login(credentials); }
      catch (error) { this.automaticLoginFailed = true; throw error; }
      await writePrivateJson(landingPath, htmlSnapshot(response.html, response.url));
    }
  }

  async checkConnection() {
    return withSessionLock(async () => {
      const client = await this.makeClient();
      await this.authenticate(client);
      await client.saveSession();
      return { connected: true, transport: 'http', verifiedAt: new Date().toISOString() };
    });
  }

  private async cache<T>(name: string, accountKey: string, schema: z.ZodType<T>, mode: ReadMode): Promise<{ data: T; fetchedAt: string } | null> {
    if (mode === 'refresh' || !accountKey) {
      if (mode === 'cached') throw new PortalError('CACHE_MISS', 'No cache is associated with a saved account session.');
      return null;
    }
    let parsed;
    try { parsed = JSON.parse(await readFile(path.join(dataDir, `${name}.json`), 'utf8')); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new PortalError('INVALID_CACHE', 'Cache could not be read. Retry with mode=refresh.');
    }
    if (parsed?.accountKey === accountKey && typeof parsed.fetchedAt === 'string' && (mode === 'cached' || !stale(parsed.fetchedAt))) {
      const data = schema.safeParse(parsed.data);
      if (data.success) return { data: data.data, fetchedAt: parsed.fetchedAt };
      throw new PortalError('INVALID_CACHE', 'Cache has an unexpected structure. Retry with mode=refresh.');
    }
    if (mode === 'cached') throw new PortalError('CACHE_MISS', 'No cached data for this account. Use mode=refresh after login.');
    return null;
  }

  private async save(name: string, client: TaxisnetHttp, data: unknown, fetchedAt: string) {
    await writePrivateJson(path.join(dataDir, `${name}.json`), { accountKey: client.accountKey, fetchedAt, data });
    await client.saveSession();
  }

  private async liveList(client: TaxisnetHttp): Promise<ReturnRecord[]> {
    await this.authenticate(client);
    await client.read(routes.owner);
    const response = await client.read(routes.history);
    return parseHistory(response.html, response.url);
  }

  async listReturns(mode: ReadMode = 'auto') {
    return withSessionLock(async () => {
      const client = await this.makeClient();
      const cache = await this.cache('returns', client.accountKey, z.array(recordSchema), mode);
      if (cache) return { returns: cache.data, fetchedAt: cache.fetchedAt, cached: true, stale: stale(cache.fetchedAt), source: routes.historyList };
      const returns = await this.liveList(client);
      const fetchedAt = new Date().toISOString();
      await this.save('returns', client, returns, fetchedAt);
      return { returns, fetchedAt, cached: false, stale: false, source: routes.historyList };
    });
  }

  private async getData(id: string, mode: ReadMode) {
    if (!returnIdPattern.test(id)) throw new PortalError('INVALID_RETURN_ID', 'Use a return ID from list_returns.');
    return withSessionLock(async () => {
      const client = await this.makeClient();
      const cache = await this.cache(`return-${id}`, client.accountKey, parsedSchema, mode);
      if (cache) {
        if (cache.data.record.id !== id) throw new PortalError('INVALID_CACHE', 'The cached return ID does not match the request.');
        return { data: cache.data, cached: true, stale: stale(cache.fetchedAt) };
      }
      const records = await this.liveList(client);
      const record = records.find(r => r.id === id);
      if (!record) throw new PortalError('RETURN_NOT_FOUND', 'The requested return was not present in this account history.');
      if (record.type !== 'E' || record.taxYear !== 2025) throw new PortalError('UNSUPPORTED_RETURN', 'Live extraction is currently verified for 2025 employee returns only.');
      await client.read(record.url);
      const response = await client.read(routes.print);
      const fetchedAt = new Date().toISOString();
      const data = parseReturn(response.html, record, response.url, fetchedAt);
      await this.save(`return-${id}`, client, data, fetchedAt);
      await this.save('returns', client, records, fetchedAt);
      return { data, cached: false, stale: false };
    });
  }

  async getReturn(id: string, mode: ReadMode = 'auto', detail: 'summary' | 'full' = 'summary') {
    const { data, ...freshness } = await this.getData(id, mode);
    return {
      record: data.record, source: data.source, fetchedAt: data.fetchedAt, ...freshness,
      summary: returnSummary(data), ...(detail === 'full' ? { fields: data.fields, tables: data.tables } : {}),
    };
  }

  async getDeductions(id: string, mode: ReadMode = 'auto') {
    const { data, ...freshness } = await this.getData(id, mode);
    return { record: data.record, source: data.source, fetchedAt: data.fetchedAt, ...freshness, ...declaredDeductions(data) };
  }
}
