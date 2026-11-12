# Native vault payment workflow

Create a canonical bill, payroll or reimbursement obligation with an exact six-decimal USDC amount and native recipient. Planning checks due dates, policy, allowed recipients, available vault liquidity and existing commitments. Queue reservation freezes the record and prevents another route from paying it.

The human reviews and signs required contract approvals through Web3Auth. A separately restricted native executor can queue and execute; it cannot approve or administer the vault. Native NEAR covers gas/storage, while USDC is the transfer asset. Collection/reserve wallet balances are separate from vault liquidity.

A paid record requires the original signed call, final successful receipt tree, exact NEP-141 transfer, native completion event and final contract state. Submission alone never marks it paid. Failed or unknown outcomes require reconciliation/review; no automatic replacement transfer is created.

See [native treasury runbook](NEAR-TREASURY-RUNBOOK.md) and [verification record](NEAR-LOCAL-VERIFICATION.json). No deployed payment is claimed by these instructions.
