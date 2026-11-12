# Native execution account setup

Human approval uses Web3Auth. Automated queue and execute calls use a separate native NEAR account with a finite function-call access key restricted to the configured treasury contract and `queue_payment` / `execute_payment`.

Run `scripts/prepare-agent-executor.mjs` only after the native contract bindings are prepared. It creates a local credential file and prints a public registration plan. It does not register the key, deploy a contract, transfer funds or grant approval authority. The account owner must register the exact restricted permission. No provider API key or entity secret is used.

The server verifies the registered permission and uses the native submission journal to persist signed bytes before broadcasting. See [native treasury runbook](NEAR-TREASURY-RUNBOOK.md) for account separation, deployment and recovery. This document retains its original filename for existing links.
