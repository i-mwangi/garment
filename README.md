# Settlbox on NEAR

Business treasury, invoices, payroll, gifts and reviewed finance-agent payments use native NEAR accounts and NEP-141 USDC. Web3Auth supplies the human wallet; restricted NEAR function-call keys execute policy-approved treasury payments. The original UI is retained in the app and presentation trees.

## Local development

Use Node 24, run `npm install --legacy-peer-deps`, copy `.env.example` to `.env.local`, configure the public Web3Auth client ID and allowed localhost origin, then run `npm run dev`. Never put private keys in public environment variables.

USDC uses six decimals. NEAR gas and storage deposits use 24 decimals. Settlement requires the original signed transaction, finalized successful child receipts, authoritative token events and contract state. An HTTP response or an outer success alone does not prove payment.

## Native components

- Web3Auth: `services/wallet/web3auth-near.ts` and `contexts/NearWalletProvider.tsx`.
- Treasury approvals, execution, ownership and durable recovery: `services/server/vault-payments.ts`, `near-executor.ts` and the native treasury contract.
- Collections, gifts, invoices, payroll and reimbursements: native account validation, exact USDC amounts and final receipt verification.
- Earn: Rhea native lending supply and withdrawal from the reserve wallet. Native USDC support and an explicitly approved provider code hash are required. Rates vary; historical imported yield records are labelled separately.

## Verification and configuration

`npm test` runs local regression tests. `npm run typecheck` checks the full project. `npm run build` creates the production bundle. `powershell -File scripts/near-contracts.ps1 -Action test` runs native Rust contract tests on Windows.

The deployment scripts prepare a plan by default. Testnet broadcasting requires an explicit flag and separate deployment authority. Read `docs/NEAR-TREASURY-RUNBOOK.md` for native bindings, restricted executor permissions and deployment preparation.

`node --env-file-if-exists=.env.local --experimental-strip-types scripts/prepare-near-earn.mjs` reads the provider and configured native USDC support. Review the observed code before explicitly approving it with `--approve-code=HASH`.

Local unit tests and a production build do not establish deployed end-to-end settlement. Remote sandbox verification and testnet deployment are separate steps. No live transaction is claimed. Imported provider fixtures and migration inventories retain their historical provenance; they are not proof of native settlement.

The file migration ledger accounts for every original source file and records explicit native replacements. Kora remains a separate fiat sandbox integration; cards, banking and other unavailable external services are not represented as NEAR transfers.
