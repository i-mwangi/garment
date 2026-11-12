# Web3Auth human approvals on NEAR

Configure the public `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID`, `NEXT_PUBLIC_WEB3AUTH_NETWORK` and allowed application origin. Human signatures are produced by the connected native Ed25519 wallet. Private keys and verification codes must never be sent to the server or entered in finance chat.

A company member proves native account ownership using a single-use signed challenge. Vault approval additionally requires that account to be a registered contract approver. Exact saved terms are reviewed before signing; one person cannot count twice. Ownership handover requires separate nomination and acceptance signatures while the vault is paused and idle.

An approval transaction is not a completed payment. The application verifies finalized receipts and contract state, then uses the restricted executor for eligible payment execution. Unknown outcomes retain their original transaction hash for reconciliation.

See [native treasury runbook](NEAR-TREASURY-RUNBOOK.md).
