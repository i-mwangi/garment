# Documentation

See the [project overview](../README.md) for current capabilities, architecture and local setup.

## Agent and payments

- [Finance chat](finance-chat.md): conversations, tools and proposal reviews.
- [Finance automation](finance-automation.md): worker configuration and execution controls.
- [Treasury vault](treasury-vault.md): contract policy and deployment.
- [Vault payment workflow](vault-payment-workflow.md): reservations, approval and settlement reconciliation.
- [Human wallet approvals](human-wallet-approvals.md): secure wallet authorization.
- [Native treasury setup](NEAR-TREASURY-RUNBOOK.md): deployment bindings, restricted executor permissions and recovery.
- [Inbound MCP](inbound-mcp.md): external assistant connection and authentication.

## Integrations

- [Google Sheets setup](google-sheets-setup.md): OAuth configuration, import rules and verification boundaries.
- [Slack and Stripe setup](slack-stripe-setup.md).
- [Fiat payouts](fiat-payouts.md): provider sandbox workflow and limitations.
- [USYC integration](usyc-integration.md): access requirements and execution limitations.

## Verification

- [Route inventory](ROUTE-INVENTORY.md): active application routes and their purpose.
- [Windows contract setup](WINDOWS-CONTRACT-SETUP.md): local Rust/WASM requirements and checks.

Historical migration ledgers, temporary audit output and local verification logs
are intentionally not part of the published documentation. Test results must be
reproduced with the commands in the root README; documentation is not proof of
a live provider connection or payment.
