# Native Earn provider

The current native adapter targets Rhea lending. Its reads and reviewed supply/withdrawal calls use the configured six-decimal NEP-141 USDC token. No token substitution, bridging or fixed-rate Treasury product is implied.

The reserve account is separate from the payment vault. The adapter requires actual token support and an explicitly approved provider code hash before it enables any financial action. Storage registration is reviewed separately. Supply and withdrawal require the exact signed native call, finalized successful receipts, authoritative token events and provider completion events.

Use `scripts/prepare-near-earn.mjs` to observe compatibility. A successful read alone is not provider approval. See [native treasury runbook](NEAR-TREASURY-RUNBOOK.md). The original filename is retained for existing links; imported provider records are historical.
