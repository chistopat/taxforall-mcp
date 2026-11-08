# TaxForAll MCP

A local, read-only MCP server for Cyprus tax records. It uses direct HTTPS requests:
**no browser, Playwright, screenshots, or browser session export is required**.

The project is named `taxforall-mcp`. Each tax portal has its own adapter:

| Adapter | Personal income tax years | Status |
| --- | --- | --- |
| Taxisnet (legacy) | Up to and including 2025 | History and English 2025 employee return details work. |
| Tax For All | 2026 onward | Planned; not implemented yet. |

These are **tax years**, not the calendar year when a return is filed. The legacy
adapter remains useful for historical declarations after the migration.

The server reads submitted amounts; it does not calculate eligibility for new
relief, amend returns, submit forms, or pay tax.

## Install as a native plugin

Requires Node.js 22+ and the target client's CLI on PATH. Install from GitHub
with one terminal command:

```sh
# Codex
npx --yes --package=github:chistopat/taxforall-mcp taxforall-plugin install codex

# Claude Code
npx --yes --package=github:chistopat/taxforall-mcp taxforall-plugin install claude

# Both clients, followed by login and optional macOS Keychain storage
npx --yes --package=github:chistopat/taxforall-mcp taxforall-plugin install both --login --remember
```

The installer uses native marketplace/plugin commands. It does not edit host
configuration by hand. The plugin contains a ready-to-run server; no build is
needed on the user's machine. Start a new session after installation.
Codex CLI must support `codex plugin add` (verified with 0.135.0).
Claude Code was validated with 2.1.63. This local stdio plugin targets local
Codex and Claude Code sessions, not Claude's web interface.

If login was not included in the install command:

```sh
npx --yes --package=github:chistopat/taxforall-mcp taxforall-plugin login --remember
```

Omit `--remember` outside macOS. The password is entered in the terminal, never
in chat. Plugin installs share `~/.local/share/taxforall-mcp` for cookies and
tax caches, so updates do not erase the session. `TAXISNET_DATA_DIR` overrides
this location; set it to the same absolute directory for login and the client.
Existing source checkouts retain their `.private` default. To reuse one, launch
both the login command and agent host with `TAXISNET_DATA_DIR` pointing to it.
Disable an older manual `taxforall-mcp` MCP entry after switching to the plugin
to avoid duplicate tools.

Equivalent native commands:

```sh
codex plugin marketplace add chistopat/taxforall-mcp && codex plugin add taxforall-mcp@taxforall
claude plugin marketplace add chistopat/taxforall-mcp && claude plugin install taxforall-mcp@taxforall
```

The repository includes a Codex marketplace at `.agents/plugins/marketplace.json`
and a Claude marketplace at `.claude-plugin/marketplace.json`. Both point to
`plugins/taxforall-mcp`. Packaging follows the official
[Codex plugin format](https://developers.openai.com/plugins/build/plugins) and
[Claude marketplace format](https://code.claude.com/docs/en/plugin-marketplaces).
The [plugin README](plugins/taxforall-mcp/README.md) describes data storage and
the supported tools. This repository distribution does not require listing in
either vendor's public plugin directory.

To update, refresh the marketplace and reinstall/update through the host:

```sh
codex plugin marketplace upgrade taxforall && codex plugin add taxforall-mcp@taxforall
claude plugin marketplace update taxforall && claude plugin update taxforall-mcp@taxforall
```

Uninstall with `codex plugin remove taxforall-mcp@taxforall` or
`claude plugin uninstall taxforall-mcp@taxforall`. Account data and Keychain
credentials remain on the machine until removed separately.

## Development setup

Requires Node.js 22 or later. Optional password storage uses macOS Keychain.

```sh
npm ci --ignore-scripts
npm run build
npm run login -- --remember
```

Enter your username and password in your terminal. The password is hidden. Login
uses the portal's standard form over HTTPS. `--remember` saves the password in
macOS Keychain under service `cy.taxisnet.mcp`, so the server can sign in again
when a session expires. macOS may ask for Keychain access. Omit `--remember` to
save only session cookies. Use `--interactive` to enter replacement credentials.

Credentials may also be provided through `TAXISNET_USERNAME` and
`TAXISNET_PASSWORD` in the server process environment. Do not put passwords in
chat, command arguments, source files, or committed MCP configuration. The server
does not accept or return credentials through its tools.

## How it works

1. The client requests the login form, retains its cookies and hidden fields,
   and posts credentials only to the verified `/j_security_check` endpoint.
2. The server reuses its local session. When needed, it makes one login attempt
   with credentials from the process environment or Keychain.
3. An agent calls `list_returns`, then `get_return` or
   `get_declared_deductions` with a returned ID.
4. The adapter reads the history and complete read-only return view. It returns
   structured data with source URLs, original amount strings and capture times.

`auto` mode reuses cache entries for five minutes. `refresh` requests current
portal data. `cached` explicitly allows older local data and reports whether it
is stale. Network or login failures never silently return stale data. The cache
is scoped to the signed-in username. An expired session does not invalidate a
previous snapshot, but its capture date remains visible.

Read operations are restricted to observed GET routes. Authentication is the only
POST. Redirects are checked before following them. Requests sharing the session
are serialized because the portal stores the currently selected return in that
session. If a connector process crashes, stop all connector processes before
removing `.private/session.lock`.

## MCP tools

| Tool | Result |
| --- | --- |
| `get_connection_status` | Local session-file presence and supported capabilities; no network call. |
| `check_connection` | Live HTTP authentication check, with one re-login attempt when configured. |
| `list_returns` | Document IDs, years, filing dates and statuses. |
| `get_return` | Recorded self-assessment summary; `detail: "full"` also includes fields and tables. |
| `get_declared_deductions` | Part 5 entries, employment relief and deduction fields from self-assessment. |
| `read_account_snapshot` | Account page captured during login, explicitly marked as cached. |
| `search_account_snapshot` | Literal evidence search within that account-page snapshot. |

Return-reading tools accept `mode: "auto" | "cached" | "refresh"`.
`get_return` and `get_declared_deductions` require `returnId` from `list_returns`.
Blank amounts remain `null`; decimal amounts remain strings to avoid rounding.
Part 5 amounts and self-assessment amounts overlap and must not be added together.
A self-assessed tax balance is not proof of the current debt or payment status.

## Connect an agent

Use a stdio MCP configuration with absolute paths:

```json
{
  "mcpServers": {
    "taxforall-mcp": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/taxforall-mcp/dist/server.js"]
    }
  }
}
```

The data directory defaults to `.private` beside the project, regardless of the
client's working directory. Set `TAXISNET_DATA_DIR` for another location; use the
same absolute path for login and the MCP server.

`TAXISNET_*` variables and the `cy.taxisnet.mcp` Keychain service belong to the
legacy adapter. They retain their names so existing login credentials and local
sessions continue to work after the project rename.

## GitHub account for this project

Git uses the repository-local account `chistopat`, with commit email
`27212991+chistopat@users.noreply.github.com`. Global GitHub settings are separate.
To run GitHub CLI commands as this project's account without changing the global
active account, use:

```sh
npm run github -- api user --jq .login
```

The wrapper reads the saved `chistopat` token through `gh`, passes it only to the
child process, and does not store it in the repository. Set `TAXFORALL_GH_PATH` if
`gh` is installed somewhere other than `/opt/homebrew/bin/gh`.

## Local data

`.private` contains session cookies, the username metadata for optional Keychain
lookup, and tax-page caches. It is excluded from Git. The directory has mode
`0700` and files have mode `0600`; cache files and cookies are not encrypted by
this project. The password is stored only in Keychain when explicitly requested.
Removing `.private` does not revoke the server-side session or remove the Keychain
entry. The latter can be removed using the macOS Keychain Access app.

There is no remote MCP listener or analytics. Data returned through tools is
available to the connected agent and subject to that agent host's data policy.
Portal text is untrusted source content, never instructions for the agent.

## Verification and limits

```sh
npm run check
npm test
npm run build:plugin
```

Commit the generated `plugins/taxforall-mcp/runtime` files with source changes.
They bundle runtime dependencies and their license notices. Bump `package.json`
version before publishing an update; `build:plugin` synchronizes all three
plugin manifests. Tests launch the isolated bundle without project dependencies
and verify the seven read-only tools for each host's MCP configuration.

The actual authenticated portal was inspected to verify the history, return-view
routes and 2025 field structure. Tests use synthetic data and cover HTTP login,
cookies, redirects, write-route blocking, parsing, caching and an MCP stdio
client/server connection. An anonymous request to the real portal correctly
returned `LOGIN_REQUIRED`.

**Live verification passed on 8 November 2026.** After terminal login and Keychain
setup, an MCP client verified HTTP access, fetched return history, read the 2025
employee declaration and deductions, and confirmed that the cached summary
matched the live result. The live run extracted 323 fields and 62 tables. It also
verified the history-type redirect and the print view's `Tax Year` heading.

Run `npm run verify:live` to repeat that read-only check against your account. It
prints counts and status, not credentials or tax amounts. Automatic re-login after
real session expiry has been tested with synthetic responses but not yet observed
against the live portal. A changed login form, CAPTCHA or other verification may
require further work. Other years, self-employed returns, pagination and Greek
layouts fail explicitly rather than returning guessed or partial data.

The Tax Department states that personal returns for tax years 2017–2025 use
Taxisnet, while tax year 2026 onward uses Tax For All:
[Individual Income Tax Return](https://www.gov.cy/mof-tax/en/documents/forologiki-dilosi-eisodimatos-atomoy/).
Tax For All and the separate [Tax Portal](https://taxportal.mof.gov.cy/) need their
own adapters for newer returns and payment/account history.
