# TaxForAll plugin

Local, read-only access to Cyprus tax records for Codex and Claude Code.
Requires Node.js 22+ on PATH. The bundled server runs without npm install or a
build step. Taxisnet history and English 2025 employee returns are supported;
the Tax For All adapter is planned.

Install from [chistopat/taxforall-mcp](https://github.com/chistopat/taxforall-mcp):

```sh
npx --yes --package=github:chistopat/taxforall-mcp taxforall-plugin install codex
npx --yes --package=github:chistopat/taxforall-mcp taxforall-plugin install claude
```

Use `both` to install into both clients. These commands call the clients' native
marketplace and plugin commands. Start a new session after installation.

Sign in from your terminal, never in chat:

```sh
npx --yes --package=github:chistopat/taxforall-mcp taxforall-plugin login --remember
```

`--remember` uses macOS Keychain. Omit it on other platforms to save only the
session. Add `--interactive` to replace saved credentials. Installation also
accepts `--login --remember` to perform setup in the same command.

Cookies and tax caches live in `~/.local/share/taxforall-mcp`, outside the plugin
cache. Both clients share this directory and serialize access. Use the same
absolute `TAXISNET_DATA_DIR` for login and server if overriding it. Passwords
are not stored in this directory. Files are private to the OS user but are not
encrypted by the plugin. Uninstalling the plugin leaves this account data and
any Keychain entry intact.

The plugin has seven read-only MCP tools: `get_connection_status`,
`check_connection`, `list_returns`, `get_return`, `get_declared_deductions`,
`read_account_snapshot`, and `search_account_snapshot`.
Start with `list_returns`, then use the returned ID with `get_return`.
Use `mode: "refresh"` for current portal data and `detail: "full"` for source
fields and tables. A self-assessment is not proof of current debt or payment.
The plugin cannot submit returns, amend them, pay tax, or read payment history.
Data returned through tools is visible to the connected agent and is subject
to that host's data policy. There is no remote MCP listener or telemetry.

For a manual local setup, run `node /absolute/path/to/plugin/run.mjs login`.
The Claude manifest uses `${CLAUDE_PLUGIN_ROOT}`; Codex uses `${PLUGIN_ROOT}`.
The root portable manifest and the Codex compatibility manifest describe the
same server. No hooks or automatic shell approvals are installed.
