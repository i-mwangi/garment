# Settlbox on native NEAR

Settlbox is a business-finance workspace for invoices, payroll, contractors,
reimbursements, gifts and reviewed finance-agent payments. This repository uses
native NEAR accounts and six-decimal NEP-141 USDC. Web3Auth provides the human
wallet; restricted NEAR function-call keys can execute policy-approved treasury
payments.

The application includes native NEAR treasury workflows, payment links,
business records, a Finance agent, optional integrations and a mainnet-only
NEAR Intents/1Click Base USDC checkout corridor. Provider configuration,
wallet funding, contract deployment and live settlement are separate from
ordinary local startup.

## Requirements

- Node.js 24 or newer
- npm and Git
- Rust 1.93.0 and the WebAssembly target for native contract checks
- Windows contract builds additionally require Visual Studio C++ Build Tools,
  CMake and NASM

The application uses Node's built-in SQLite API. A separate SQLite service is
not required.

## Local development

Run these commands from the repository root.

### 1. Install dependencies

```powershell
git clone https://github.com/i-mwangi/garment.git
cd garment
node --version
npm --version
npm ci
```

The repository's `.npmrc` enables the peer-dependency resolution required by
the current lockfile.

### 2. Create local configuration

Do not overwrite an existing configured environment.

```powershell
Copy-Item .env.example .env.local
New-Item -ItemType Directory -Force .data
```

For a local server on port 3000, set these values in `.env.local`:

```dotenv
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
NEXT_PUBLIC_SERVER_URL=http://127.0.0.1:3000
SETTLBOX_APP_ORIGIN=http://127.0.0.1:3000
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_NEAR_RPC_URL=https://rpc.testnet.fastnear.com
```

Use the same hostname consistently. `localhost` and `127.0.0.1` are different
browser origins. Keep `.env.local`, `.data`, wallet credentials, private keys,
API tokens and uploaded receipts out of source control.

Generate private values for the operator and worker tokens when using protected
operator or worker routes:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy the output privately into `SETTLBOX_OPERATOR_TOKEN` and
`SETTLBOX_FINANCE_WORKER_TOKEN`. Configure `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID`
with the public Web3Auth client ID for the application origin. Never place
private keys or server credentials in `NEXT_PUBLIC_*` variables.

### 3. Configure workspace sign-in

There are no shared default login credentials. The PowerShell helper prompts
for an email and a password of at least 12 characters, then writes a salted
password hash to `.env.local` without storing the plaintext password:

```powershell
powershell -NoProfile -File scripts/configure-auth.ps1
```

### 4. Initialize a native NEAR workspace

Choose a NEAR account that you control. The command creates the local company
identity, owner membership and empty business records. It refuses to overwrite
an existing identity for a different account or network.

```powershell
node --env-file-if-exists=.env.local --experimental-strip-types `
  scripts/setup-near-workspace.mjs your-account.testnet
```

Replace `your-account.testnet` with the actual NEAR testnet account ID. The
workspace configuration is stored at `.data/near-treasury.json` by default.
Creating the local workspace does not create or fund an on-chain wallet.

To load the checked-in demo records after initialization:

```powershell
npm run seed:demo
```

Use demo data for exploration only. It does not prove that a provider or
payment is live.

### 5. Start the development server

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open [http://127.0.0.1:3000/login](http://127.0.0.1:3000/login) and sign in
with the credentials configured above. The transfer and workspace screens can
then be explored against the local configuration.

`npm run dev` starts the Next.js development server only. It does not start
the background workers used by the production launcher. To run the finance
agent worker separately, configure its required settings and use a second
terminal:

```powershell
$env:PORT='3000'
npm run agent:worker
```

Do not run a duplicate worker alongside `npm start`.

## Native NEAR capabilities

- **Wallet and access:** Web3Auth login, signed workspace challenges, company
  membership and role checks.
- **Treasury:** native NEAR treasury bindings, restricted executor keys,
  approval-controlled payments, durable journals and receipt reconciliation.
- **Business workflows:** invoices, payment links, bills, contractors,
  payroll preparation, reimbursements and gift records.
- **Finance agent:** deterministic planning, policy checks, reviewed proposals
  and optional configured AI providers.
- **Earn:** a guarded native Rhea adapter. Provider code approval and token
  support are required before execution; observed rates and historical
  records are not guarantees.
- **NEAR Intents:** a disabled-by-default, mainnet-only Base USDC to NEAR USDC
  1Click corridor. It requires a 1Click JWT and FastNear key, and only a
  verified final NEAR receipt can book a payment.
- **Integrations:** optional Google Sheets, Slack, Stripe, MCP and sandbox
  fiat workflows, each requiring its own configuration.

Empty configuration does not make an integration operational. The UI can
contain screens for capabilities that are disabled, provider-gated or still
awaiting live verification.

## Production build and startup

Stop any running server before rebuilding, especially on Windows where
generated standalone files can be locked. Preserve `.data` and `.env.local`.

```powershell
npm run build
$env:PORT='3000'
$env:HOSTNAME='127.0.0.1'
npm start
```

The build produces `.next/standalone`. The production launcher loads
`.env.local`, starts the standalone server and starts configured schedule,
finance and payout-status workers. Rebuild after source changes before
restarting production.

## Verification commands

Run the application checks with:

```powershell
npm test
npm run typecheck
npm run test:near
npm run build
```

The native contract checks are separate:

```powershell
powershell -File scripts/near-contracts.ps1 -Action check
powershell -File scripts/near-contracts.ps1 -Action test
powershell -File scripts/near-contracts.ps1 -Action build
```

These commands compile or test locally. They do not deploy contracts, transfer
assets or establish live end-to-end settlement.

## Native treasury and deployment boundaries

Read [docs/NEAR-TREASURY-RUNBOOK.md](docs/NEAR-TREASURY-RUNBOOK.md) before
preparing executor, vault or Earn configuration. Deployment scripts prepare
plans by default; broadcasting requires explicit authority and flags. Never
grant a server executor FullAccess or approval authority.

Native settlement requires the original signed transaction, finalized
successful child receipts, authoritative NEP-141 token events and the expected
contract state. An HTTP success response, an outer transaction success or a
provider-reported status alone is not proof of payment.

## Documentation

- [Documentation index](docs/README.md)
- [Native treasury runbook](docs/NEAR-TREASURY-RUNBOOK.md)
- [Windows contract setup](docs/WINDOWS-CONTRACT-SETUP.md)
- [Finance automation](docs/finance-automation.md)
- [Finance chat](docs/finance-chat.md)
- [Human wallet approvals](docs/human-wallet-approvals.md)
- [USYC integration boundaries](docs/usyc-integration.md)
- [Workflow readiness audit](docs/workflow-readiness-audit.md)
- [Environment template](.env.example)

Local databases, configuration, uploads and verification artifacts live under
`.data` by default. Preserve this directory and the integration encryption key
across restarts when using configured integrations. No local test, build or
fixture should be interpreted as commercial adoption, provider availability or
live payment volume.
