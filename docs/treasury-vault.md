# Native NEAR treasury vault

The native Rust contract and server handlers implement policy-bound NEP-141 payments, distinct human approvals, a restricted executor, durable submission recovery and two-step ownership transfer. Exact USDC amounts use six decimals; attached gas/storage amounts use NEAR units.

See [native contract guide](../contracts/near/README.md), [setup and authority runbook](NEAR-TREASURY-RUNBOOK.md), and [current verification evidence](NEAR-LOCAL-VERIFICATION.json). Local mocked unit tests do not establish sandbox execution or deployed readiness.
