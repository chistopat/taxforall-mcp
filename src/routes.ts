import { origin } from './config.js';
import { PortalError } from './store.js';

export const routes = {
  home: `${origin}/basic/displayMain.do`,
  owner: `${origin}/basic/processDocOwner.do`,
  history: `${origin}/basic/directDocManagement.do?dispatch=history.epr1`,
  historyList: `${origin}/epr1/processAllEPR1DocumentList.do?dispatch=find&epr1Type=epr1m-declarations`,
  print: `${origin}/epr1/printEPR1MFormLookup.do?dispatch=partAll`,
};
export const returnIdPattern = /^\d{1,12}-\d{4}$/;

// This is an exact allowlist of GET views observed in the authenticated UI.
// A .do path or GET method alone does not establish that an action is read-only.
export function assertReadUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new PortalError('BLOCKED_ROUTE', 'Invalid portal URL.'); }
  if (url.origin !== origin || url.username || url.password || url.hash) {
    throw new PortalError('BLOCKED_ROUTE', 'Only verified Taxisnet read routes are permitted.');
  }
  const params = Object.fromEntries(url.searchParams);
  const exact = (expected: Record<string, string>) =>
    [...url.searchParams].length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, val]) => params[key] === val);
  const allowed =
    (['/basic/displayMain.do', '/basic/processDocOwner.do'].includes(url.pathname) && exact({})) ||
    (url.pathname === '/basic/directDocManagement.do' && exact({ dispatch: 'history.epr1' })) ||
    (url.pathname === '/epr1/chooseEPR1Type.do' && exact({ forAction: 'history' })) ||
    (url.pathname === '/epr1/processAllEPR1DocumentList.do' && exact({ dispatch: 'find', epr1Type: 'epr1m-declarations' })) ||
    (url.pathname === '/epr1/printEPR1MFormLookup.do' && exact({ dispatch: 'partAll' })) ||
    (url.pathname === '/epr1/relayDisplayAllEPR1DocumentList.do' &&
      /^\d{4}$/.test(params.docTaxYear ?? '') && returnIdPattern.test(params.docKey ?? '') &&
      exact({ docType: 'epr1m-declarations', docTaxYear: params.docTaxYear, docKey: params.docKey }));
  if (!allowed) throw new PortalError('BLOCKED_ROUTE', 'This route has not been verified as a read-only view.');
  return url;
}
