// Synthetic values in the DOM structure observed on the English 2025 return.
export const record = {
  id: '123456-2026', number: '123456', type: 'E', taxYear: 2025, submissionYear: 2026,
  sender: 'TEST AGENT', taxpayer: 'TEST PERSON', submittedAt: '01/10/2026', status: 'Submitted',
  url: 'https://taxisnet.mof.gov.cy/epr1/relayDisplayAllEPR1DocumentList.do?docType=epr1m-declarations&docTaxYear=2025&docKey=123456-2026',
};
export const historyHtml = `<html><body><a href="/processLogout.do">Logout</a><h1>VIEW SUBMITTED INCOME TAX RETURNS</h1>
<table><tr><td><table><tr><td></td><td>Doc. Number</td><td>Type of Return</td><td>Taxation Year</td><td>Subm. Year</td><td>Sender</td><td>Taxpayer</td><td>Submit Date</td><td>Status (*)</td></tr>
<tr><td></td><td><a href="${record.url}">123456</a></td><td>E</td><td>2025</td><td>2026</td><td>TEST AGENT</td><td>TEST PERSON</td><td>01/10/2026</td><td><a href="/epr1/relayDisplayAllEPR1DocumentList.do?docType=epr1m-declarations&docTaxYear=det&docKey=123456-2026">Submitted</a></td></tr></table></td></tr></table></body></html>`;
const summaryValues: Record<string, string> = {
  fM4TAR5C1: '30000', fM7T0R1C1: '60000', fM7T0R12C1: '30000', fM7T0R13C2: '30000', fM7T0R14C1: '30000',
  fM7T0R15AC1: '', fM7T0R15A2C1: '1500', fM7T0R15BC1: '', fM7T0R15CC1: '4000', fM7T0R15DC1: '5500',
  fM7T0R15DC2: '5500', fM7T0R16C1: '24500', fM7T0R19C2: '1000,00', fM7T0R22C1: '900,00', fM7T0R23C1: '100,00',
};
export const returnHtml = `<html><body><h1>DECLARATION OF INCOME <span>Individual (other than self-employed)</span><span>Tax Year 2025</span></h1>
<h2>PART 5 - DEDUCTIONS / ALLOWANCES</h2>
<table><tr><td></td><td>DESCRIPTION</td><td>AMOUNT</td></tr><tr><td>1</td><td>TRADE UNION CONTRIBUTIONS</td><td></td></tr><tr><td>2</td><td>PROFESSIONAL SUBSCRIPTIONS</td><td>120</td></tr></table>
<table><tr><td></td><td>T.I.C.</td><td>NAME OF FUND/INSURANCE<br>COMPANY</td><td>CODE</td><td>DATE</td><td>ON LIFE OF</td><td>CAPITAL</td><td>AMOUNT PAID</td></tr>
<tr><td>1</td><td>TEST</td><td>SOCIAL INSURANCE FUND</td><td>2</td><td></td><td><label class="labelHid" for="fundOwner">INSURANCE ON LIFE OF</label><select id="fundOwner" disabled><option value=""></option><option>OWN</option><option>SPOUSE</option></select></td><td></td><td>4000</td></tr></table>
<table><tr><td></td><td>T.I.C.</td><td>YEAR OF INVESTMENT</td><td>CONTINUATION</td><td>CODE</td><td>INITIAL</td><td>PREVIOUS</td><td>AMOUNT TO BE CLAIMED IN 2025</td><td>TOTAL</td></tr><tr><td>1</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr></table>
<table>${Object.entries(summaryValues).map(([id, value]) => `<tr><td>Label ${id}</td><td><input type="text" id="${id}" name="${id}" value="${value}" readonly></td></tr>`).join('')}</table>
<input type="hidden" name="secret" value="DO_NOT_EXPOSE"><script>untrusted_script()</script></body></html>`;
export const loginHtml = `<html><head><base href="https://taxisnet.mof.gov.cy/login.jsp"></head><body><form id="loginForm" action="j_security_check" method="post"><input name="j_username"><input name="j_password" type="password"><input type="hidden" name="j_uri" value=""></form></body></html>`;
export const homeHtml = '<html><body><a href="/processLogout.do">Logout</a><a href="/basic/processDocOwner.do">Returns</a></body></html>';
