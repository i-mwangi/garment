# Native treasury implementation and setup

Native treasury handlers, business-record payment actions, human approvals, ownership transfer and the guarded Rhea adapter are implemented. Runtime availability is determined from the local binding and fresh chain reads; this guide does not assume that a deployment is funded, active or authorized. Gift deployment is optional and separately configured. The recorded sandbox result covers contract scenarios against pinned artifacts, not a live public-network payment.

## Contract bindings

`.data/near-contracts.json` must identify the company and NEAR network, the official six-decimal USDC contract, and both deployed contract accounts with their approved base58 code hashes. Its `treasury` object contains `accountId`, `codeHash`, `ownerId` and `executorId`; `gifts` contains `accountId` and `codeHash`. Artifact hashes are pinned by `docs/NEAR-CONTRACT-ARTIFACTS.json`. The runtime verifies network, protocol, deployed code, token metadata and authority against a final block.

The workspace collection account in `.data/near-treasury.json` remains separate from vault administration. A verified two-step ownership transfer changes the vault administrator binding only. The nominee must already be an active workspace OWNER or ADMIN. The vault must be paused with no transfers in flight. A finalized acceptance and exact transaction proof are required before an atomic configuration replacement.

## Restricted executor

Run `node --env-file-if-exists=.env.local --experimental-strip-types scripts/prepare-agent-executor.mjs` after bindings are prepared. It creates a local executor key file and prints only its public registration plan. It does not register an access key or transfer funds. The executor account owner must separately register that public key with a finite allowance, the vault as its sole receiver, and only `queue_payment` and `execute_payment` as allowed methods. Never grant this server key FullAccess, owner or approval authority.

The server checks the actual on-chain access-key permission before signing. It uses a fenced SQLite signing lease, saves the original hash and serialized signed transaction before broadcast, and blocks other nonces until a final outcome is observed. Retries re-broadcast identical bytes. Unknown outcomes and failed payments require reconciliation/review, not replacement signatures.

## Funding and approvals

The approval controls under the agent's Finance controls use Web3Auth. Fund the vault with the native funding control: it uses `ft_transfer_call` with `msg: deposit` so the vault's USDC ledger is credited. A direct `ft_transfer` does not credit this ledger. Token storage registration is a separate reviewed NEAR transaction. Funding confirmation requires both the authoritative token-transfer event and the native deposit event.

Planning uses exact six-decimal units, distinct allowed recipients, daily/lifetime limits and protected liquidity. A plan binds the network, vault and exact saved recipient. Queue reservation freezes the source obligation and prevents another payment route from claiming it. Human approvals use the registered approver's own Web3Auth key and exactly one yoctoNEAR. Executor keys cannot approve.

Settlement requires the original saved hash, exact executor call, authoritative NEP-141 transfer, native completion event and final paid state. A failed child receipt cannot become a paid business record. Failed native transactions remain review-required, and no automatic replacement payment is generated.

## Verification

Run `npm run typecheck`, `npm test`, `npm run test:near` and `npm run build`. Windows contract checks use `scripts/near-contracts.ps1`. These checks validate source behavior and packaging. Public deployment, current permissions, funding and a live UI transaction require separate verification against fresh chain state.

## Native deployment commands

`npm run contracts:deploy` and `npm run vault:deploy` now prepare native NEAR deployment plans by default, without broadcasting. They verify the local WASM hash against the approved binding. Treasury initialization additionally reads `.data/near-vault-policy.json`, containing the native contract policy fields as six-decimal base-unit strings and `required_approvals` as an integer.

Only a manually supplied `--broadcast` argument submits a testnet deployment. The contract account must already exist and hold enough NEAR for code storage and gas. Its separately configured deployment authority file must identify that same account and an on-chain FullAccess deployment key. The restricted server executor cannot deploy contracts. Deployment and initialization are one atomic transaction. Different existing contract code is never overwritten.

Deployment hashes and signed bytes are persisted before broadcast. Uncertain results retry the exact original transaction. A finalized failed deployment requires review and an explicit new `--request-id` before another signature; an unresolved deployment blocks a new nonce. The testnet treasury account already holds the approved WASM. A later broadcast check found that code, verified `get_config`, and did not submit a second deployment. The local runtime binding is `.data/near-contracts.json`. Gift deployment is still blocked because that account has not been funded.

## Native Earn reserve

`/api/earn/near` reads Rhea pool and reserve positions against the configured native USDC contract. Supply uses NEP-141 `ft_transfer_call`; withdrawal uses Rhea's native `execute` action with the provider's extra internal decimals. The payment vault cannot be invested. Each action is reviewed and signed by the reserve account through Web3Auth. A provider or token storage registration is a separate reviewed transaction, followed by another review for the actual supply/withdrawal.

Run `node --env-file-if-exists=.env.local --experimental-strip-types scripts/prepare-near-earn.mjs` to observe provider support and deployed code. Only a separately supplied `--approve-code=HASH` saves the matching local binding, and unsupported native USDC is rejected. No code hash or support is assumed. This command does not transfer tokens. Rhea lending rates and liquidity are variable; imported historical yield records do not establish a native position.

## Observed provider compatibility

`NEAR-EARN-PROVIDER-OBSERVATION.json` records public read-only observations with final block references and code hashes. The configured testnet provider did not list the official native USDC token; mainnet did list its configured native USDC token. No provider configuration was approved and no public-network transaction was submitted. The verified `get_asset` contract argument is `token_id`. Do not enable testnet Earn, silently substitute a similarly named token, or switch the application to mainnet based only on these observations.

The sandbox integration suite and pinned Linux workflow are in `contracts/near/integration/` and `.github/workflows/near-sandbox.yml`. The sandbox token fixture compiles in a separate Cargo workspace. Production WASM hashes remain identical to the approved manifest. The suite passed on GitHub Ubuntu; see `NEAR-SANDBOX-RESULT.json` for all six scenarios and artifact hashes.

## Embedded wallet testnet deployment setup

The local `/testnet-setup` page uses the existing Web3Auth embedded NEAR signer. No Meteor connection is required. An authenticated workspace OWNER prepares three distinct implicit deployment accounts with local deployment keys. The company embedded wallet reviews and signs one native funding transfer per account. The implicit account IDs derive from the saved Ed25519 public keys; NEAR activates their FullAccess keys on the first native transfer.

`npm run contracts:prepare` checks all three saved key identities against their implicit account IDs and verifies the approved WASM bytes against the manifest. It writes only a local `.data/near-contracts.draft.json`; the runtime configuration stays inactive. The deployment commands use the pinned `contracts/near/approved-wasm/` binaries and, unless explicitly overridden, the separate treasury and gifts credentials prepared by this page. The draft must be reviewed and activated only after account funding and an approved vault policy are ready.

Initial funding is 5 NEAR for treasury, 3 for gifts and 0.25 for executor, plus fees. Fund the displayed embedded wallet before approving these transfers. This initial balance does not fund the full 1,000-request storage footprint. Deployment credentials stay in the ignored `embedded-deployment` directory beside the treasury configuration; private keys are never returned to the browser. Pending transactions must reconcile, and fresh public state must be checked before retrying funding. Contract deployment, restricted executor registration, treasury policy and final bindings remain separate steps.
