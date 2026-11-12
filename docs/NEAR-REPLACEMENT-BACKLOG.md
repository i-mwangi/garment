# Native migration verification boundaries

The direct treasury APIs, payment approval/cancellation, business payment consumers, Earn provider, UI network labels and native support scripts now have native implementations. Retired services, Solidity artifacts and old EVM fixtures have explicit replacements in the file ledger. The static runtime audit currently reports zero legacy blockchain patterns in application code.

The Rhea adapter requires actual native USDC support and an explicitly approved deployed code hash before it enables supply or withdrawal. This is a configuration prerequisite, not a claim that the current testnet deployment supports that asset.

Local checks passed: 169 full regression tests, the 97-test native subset, 31 mocked Rust contract unit tests, full TypeScript validation, production build/standalone packaging and isolated production HTTP workflows. The browser smoke check rendered login and opened Web3Auth. Results are recorded in `NEAR-LOCAL-VERIFICATION.json`. Full asynchronous sandbox verification, gas/storage-capacity checks and native testnet deployment remain separate. No native contract deployment or live token transfer has been performed.

All 1,472 original source files are accounted for. Per-file copy evidence and a static search do not prove visual/behavioral parity for every screen. Historical imported records remain historical; they are not represented as native settlement evidence. Features that originally required unavailable external banking/card services remain dependent on those services.

The user requested code migration before supplying a remote runner. Do not ask for a runner again during this code-verification phase.
