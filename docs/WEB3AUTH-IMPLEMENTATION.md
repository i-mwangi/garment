> Historical planning or verification record. Current native setup and results are in [NEAR-TREASURY-RUNBOOK.md](NEAR-TREASURY-RUNBOOK.md) and [NEAR-LOCAL-VERIFICATION.json](NEAR-LOCAL-VERIFICATION.json). Original network names describe the dated source work, not current settlement wiring.

# Web3Auth and native NEAR implementation

The user selected Web3Auth, superseding Para in the original research plan. The implementation is in `C:\Users\Administrator\Music\Near`; the source Settlbox project remains read only.

## Implemented

- Copied all 1,472 inventoried source/support/assets files and verified their source SHA-256 hashes during copying. Runtime databases, credentials, Git internals, dependencies and build caches were excluded.
- Added native NEAR account validation, six-decimal USDC and 24-decimal NEAR amount handling, official network-specific USDC IDs, RPC network verification and final receipt checks.
- Added Web3Auth v11 browser integration following the provider's native NEAR guide, deriving a deterministic implicit account from its Ed25519 public key. The provider's legacy Aurora URLs are not used.
- Added explicit review for message signatures, token registration and transfers, durable submission hashes before broadcasting, and reconciliation before another wallet submission.
- Connected both copied UI layouts and wallet consumers to the NEAR providers. Source filenames still containing Arc are retained for inventory/compatibility while their remaining implementations are ported.
- Added native wallet ownership verification for team sign-in: an exact challenge signature, current full-access public key, network binding, expiry and single-use challenge consumption. An email login does not grant a workspace role.
- Added the supplied public Client ID to the destination `.env.local`. No source environment or private runtime state was copied.
- Ported public payment-link verification to final native NEAR receipts and authoritative NEP-141 USDC transfer events, bound to the exact payer, amount, recipient, network, token and link memo. Submission hashes retain their base58 case. The payer identity is persisted with a pending checkout for verification after reload.
- Ported payment-link persistence and group-collection splitting to native six-decimal USDC, preserving duplicate-settlement protection and immutable paid contribution amounts.
- Updated shared token selection, balance reads, account display and explorer URLs for native NEAR.
- Built native Rust treasury/gift contracts with the pinned Windows toolchain under `contracts/near`. All 31 mocked contract tests pass, and both release WebAssembly artifacts pass structural/export inspection. The contracts are not deployed or enabled in active payment handlers.
- Initialized a new empty local workspace and its owner from the authenticated native account using a CLI-only bootstrap. This neither copies private source data nor exposes an HTTP owner-enrollment endpoint. The signed workspace challenge now completes and the dashboard displays the company and owner.
- Ported business drafts, invoice issuance/collection reconciliation, employee/contact groups, payroll terms and reimbursement validation to native accounts and six-decimal USDC. Updated both copied contact modal implementations and network selectors. These changes do not establish native outgoing treasury execution.
- Added exact invoice line, tax and discount arithmetic. Native drafts retain decimal strings through persistence and invoice issuance; amounts requiring fractions below one USDC micro-unit are rejected. Draft edits do not permit forged settlement fields. Replaced unstable object dependencies that caused the copied invoice form to rerender continuously.
- Normalized legacy NEAR RPC query errors returned inside `result`; unfunded implicit accounts can prove their encoded public-key ownership, while existing accounts still require a currently authorized full-access key.

## Key model

The standard MetaMask Embedded Wallets/Web3Auth non-EVM integration makes key material available in the browser and uses a chain SDK to sign. This is not a claim of MPC signing without browser key reconstruction. Application code does not put the key in browser storage, server requests, application records or logs; the active signer is held in memory and released on disconnect. Web3Auth controls its own authentication/session storage. Enterprise MPC Core Kit is a different provider product and has not been configured.

## Not yet verified or complete

The user completed Web3Auth login and the app displayed a native 64-character implicit account ID. Read-only NEAR Testnet queries returned a zero USDC balance and reported that the native account is not yet activated. Testnet NEAR is required for activation/gas and USDC token storage. No payment, contract deployment or testnet asset transfer has been performed by this work.

This is not yet a complete Arc replacement. The copied Circle-backed company executor, policy-vault operations, gift contract integrations, agent wallet approval popups and other settlement handlers remain migration work. The new NEAR signer refuses EVM calldata, and legacy executors reject native obligations. Public payment-link verification and invoice/draft management have been ported; outgoing company payments still require the native execution replacement. Do not use the copied Arc verification scripts as NEAR evidence.

Treasury and gift Rust/WASM contracts have not been deployed. The execution signer and company treasury identity need explicit NEAR configuration and testing. Earn/USYC remains a provider gap from the original plan. Full screen-by-screen visual and behavior parity is pending.

## Local configuration

Use `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID`, `NEXT_PUBLIC_WEB3AUTH_NETWORK=sapphire_devnet`, `NEXT_PUBLIC_NEAR_NETWORK=testnet`, and `NEXT_PUBLIC_NEAR_RPC_URL=https://rpc.testnet.near.org`. Sapphire network selects the authentication infrastructure; NEAR network selects settlement. They are distinct settings.

Allow the exact local origin in the provider dashboard. The local application uses `http://localhost:3000`. A provider client registered on a different Sapphire network needs the matching setting. No client secret is required in browser configuration.

Team authentication additionally requires a new `.data/near-treasury.json` with `companyId`, `accountId` and `networkId`. `scripts/setup-near-workspace.mjs` initializes this identity and the first local owner, refusing to replace an existing different owner. It has been run locally for the authenticated account. Do not copy the old Arc treasury configuration or private databases. An email login alone cannot enroll an owner or assign a role.

## Sources

- [Official native NEAR integration](https://docs.metamask.io/embedded-wallets/connect-blockchain/other/near/)
- [Web SDK v11](https://docs.metamask.io/embedded-wallets/sdk/js/)
- [Key models](https://docs.metamask.io/embedded-wallets/infrastructure/mpc-architecture/)
- [NEAR SDK](https://github.com/near/near-api-js)

Run `npm run test:near` for the focused native tests.

## Verification record

- Initial source copy: all 1,472 files hash-verified, with no missing source entries.
- Full application typecheck passed. The final production build also passed its type-checking stage after the invoice and transaction-hash fixes.
- The final production build passed, including every copied route and standalone asset preparation. The first build attempt was blocked by sandbox permissions on a generated `.well-known` directory; successful runs used the required filesystem access.
- The browser loaded the native `/transfer` screen, opened the configured Web3Auth email/phone login, and displayed the native account after the user authenticated. External EVM wallet choices are hidden. No live payment is claimed.
- Offline SDK verification confirms Web3Auth's documented key derivation and a correctly signed native NEAR transaction digest.
- `npm run test:near`: 47 tests passed, including native business, workspace, payroll, reimbursement, scheduling, exact invoice pricing and protected draft fields. The final base58 hash validation change also passed the seven focused foundation tests. Valid 32-byte hashes with leading zero bytes are accepted regardless of their shorter encoded length.
- Browser checks reached the authenticated dashboard, native employee form and invoice creation form, showing NEAR Testnet and the configured implicit collection account. No test contact or invoice was persisted by these UI checks.
- Native link settlement tests reject wrong token, signer, amount, memo, stale timestamps, forged events and failed child receipts. Repository and collection tests cover restart, duplicate settlement, paid history and exact USDC splitting.
- Windows tooling was installed at the user's request: Rust 1.93.0, the WebAssembly target, Microsoft C++ Build Tools/Windows SDK/CMake, and NASM 3.02. No Ubuntu/WSL distribution was installed.
- Rust verification: 18 treasury tests and 13 gift tests passed without warnings. Release WebAssembly builds passed; `NEAR-CONTRACT-ARTIFACTS.json` records sizes, SHA-256 hashes, exports and imports. The callback code uses bounded result inspection and does not refund accounting for oversized successful results.
- Full asynchronous NEAR sandbox tests, gas/storage-capacity verification and deployment remain unfinished. Windows compilation and mocked tests do not substitute for these checks. A supported remote environment can run the full node without installing Ubuntu locally.


## Native treasury and ownership update - 2026-10-28

The native vault path now includes exact six-decimal planning, immutable recipient/deployment-bound queue reservations, restricted function-call executor keys, fenced signing leases, durable original signed-byte retries, human Web3Auth approvals, authoritative token/completion-event settlement and native funding through the deposit callback. Agent and manual approval controls no longer use Circle or Rabby.

Native ownership nomination and acceptance require a paused vault, no transfers in flight and an active workspace administrator nominee. The new administrator's exact final acceptance is verified before an atomic vault-owner configuration update. The separate workspace collection account is preserved.

All 90 tests in the expanded native suite passed and the full TypeScript check passed. Windows atomic-replacement tests require normal filesystem access rather than the restricted process sandbox. No native contracts have been deployed and no live token transaction is claimed. The asynchronous remote sandbox, direct legacy treasury API paths, Earn provider and remaining copied UI/support scripts still require completion.

The 2026-10-28 production build passed, including route generation and standalone packaging. This is build verification, not sandbox or live-transfer verification.
