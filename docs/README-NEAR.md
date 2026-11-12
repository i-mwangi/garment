# Settlbox on native NEAR

This workspace replicates the original Settlbox UI and settles on native NEAR with Web3Auth (MetaMask Embedded Wallets).

The root README now describes the native implementation. Migration inventories and imported fixtures retain historical provenance. Native deployment and full end-to-end verification remain separate from local code checks.

## Run locally

Node.js 24+, then `npm install --legacy-peer-deps`, `npm run typecheck`, and `npm run dev`. Open `http://localhost:3000/transfer` to test the embedded wallet independently of company treasury setup. The supplied public Client ID is configured locally; use `.env.example` for another deployment.

## Status and evidence

- [Current verification record](./NEAR-LOCAL-VERIFICATION.json)
- [Native treasury setup and safeguards](./NEAR-TREASURY-RUNBOOK.md)
- [Windows contract tooling and verification](./WINDOWS-CONTRACT-SETUP.md)
- [Routes and APIs](./ROUTE-INVENTORY.md)
- Local reference inventories stay off the published tree. A static search is not proof that every screen matches the original product.

Run the native suite with `npm run test:near` (99 native tests; the full regression suite has 171 tests). Use `npm run typecheck` to check the full copied application; `typecheck:near` checks the wallet foundation scope only.

The local owner/workspace has been initialized using `scripts/setup-near-workspace.mjs`. Web3Auth email login and a native signed workspace challenge have reached the authenticated dashboard. The live provider observation found zero reserve-wallet USDC. Earlier wallet activation status is historical; no live transfer is claimed.

Native regression tests, operational scripts and container configuration have been ported. The treasury contract is deployed on NEAR testnet and verified against the approved code hash. The gift account is not created yet, so gift escrow is not live. The sandbox suite passed in an ephemeral chain.

Current provider observations show native USDC listed on Rhea mainnet, but not on the configured testnet provider. Earn remains disabled on testnet; the mainnet observation does not switch networks or authorize deposits.
