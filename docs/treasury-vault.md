# Native NEAR treasury vault

The native Rust contract and server handlers implement policy-bound NEP-141 payments, distinct human approvals, a restricted executor, durable submission recovery and two-step ownership transfer. Exact USDC amounts use six decimals; attached gas/storage amounts use NEAR units.

See the native contract source under `contracts/near/` and the [setup and authority runbook](NEAR-TREASURY-RUNBOOK.md). Local tests and recorded sandbox results do not establish that a particular deployment is funded, active or authorized.
