# Conversational finance

The Finance agent is a chat interface. A supported request opens a focused review automatically. Changes use immutable server-side proposals; a model response never applies a change by itself. The review shows proposed arguments and the current saved record. Owners confirm changes; payment and vault approvals use Web3Auth's native NEAR approval screen. PINs and recovery answers never enter the conversation.

Supported operations include draft invoices and bills, issuing/cancelling invoices, contacts and company settings, contractor agreements and generated bills, reimbursements, recurring schedules, collections and payment links, notification preferences, team records, treasury permissions and bounded finance automation. Existing validators and authenticated route handlers remain authoritative. Payment requests resolve one canonical payable record, recheck current policy, and resume an existing journal entry rather than duplicate it. Future-dated requests prepare a plan tied to that exact record.

For a payment, the user authorizes the exact recipient and amount in the popup. The interface queues, requests native contract approval where required, waits for verified on-chain approval, then submits execution under that explicit authorization. Closing the review or reloading stops automatic continuation. A saved pending payment can be resumed after reviewing it again. Reconciliation does not submit payments. Paid status requires verified durable settlement.

Advanced wallet setup, administration, automation settings and audit records are in Settings → Finance controls. The normal agent page contains the conversation and composer. History and proposals persist per company and authenticated principal. Proposal claims are atomic; changed records invalidate approval, duplicate confirmations cannot repeat an action, and unknown external outcomes stay unresolved rather than being blindly retried.

## Connected tools

Settings → MCP connections supports outbound remote MCP servers using HTTPS Streamable HTTP through the official TypeScript client. Owners save a public HTTPS endpoint, discover its tools, and enable individual tools. Changed endpoints or tool definitions lose prior permission. Every external call opens a review showing its input. External text and descriptions are untrusted data.

Bearer credentials use an environment-variable reference, for example SETTLBOX_MCP_ACCOUNTING_TOKEN; secrets are not stored in settings or chat. Only public port 443 endpoints are supported. Private, loopback, metadata and reserved addresses, redirects, URL credentials and query-string secrets are rejected. DNS results are validated and pinned. Payload sizes, schema complexity and request durations are bounded. Calls recheck enablement before submission.

Settlbox has two separate MCP boundaries. The outbound client described above connects to owner-approved remote tools. The authenticated inbound endpoint at `/api/mcp` lets an external assistant read scoped records or create reviewable proposals. Inbound requests cannot approve, queue or execute payments. Local stdio and OAuth authorization are not supported. Protocol and permission tests use isolated fixtures; that does not prove a customer endpoint is connected.

## Configuration and limits

The selected AI provider uses server-side environment configuration. An owner can select Azure when NEAR AI Cloud is unavailable or has no credits; the server does not silently bypass an owner-set NEAR AI budget by switching providers. Provider output is advisory: structured operations are validated, saved and presented for review before existing application handlers can apply them. Missing details require clarification; arbitrary URLs, shell commands and invented financial IDs are rejected.

The catalog does not cover every application feature. Initial Web3Auth wallet setup and ownership migration retain dedicated controls. Finance chat accepts PNG/JPEG receipt attachments up to 2 MB through the existing authenticated, company-scoped upload service. Receipt metadata accompanies the request; this does not extract or verify the image's financial contents. A reimbursement still requires exact user-supplied terms and confirmation. Card issuance, fiat banking, global accounts, on/off ramps and email delivery require actual provider adapters and credentials. Native Rhea reserve actions require the dedicated Earn review flow, actual token support and an approved provider identity. The payment vault cannot be invested. Historical records do not prove live provider support or spendable funds.

Automated tests and local builds verify code behavior, not provider availability or a completed live financial journey.

## Kora sandbox payouts

Finance chat now supports Kora destination discovery, saved recipient creation and resolution, local-currency payout preparation, separately confirmed sandbox submission, status checks and cancellation of unsubmitted drafts. Every step opens the existing action review; submission displays the exact saved recipient snapshot and local amount. KES, NGN and GHS are separate from native NEAR USDC. Sandbox success never pays a real business obligation. Full account numbers and emails are omitted from saved-result model context; exact details remain visible to the owner during review.

Settings → Fiat payouts configures the company's test-key environment references. Cashout uses the same recipient directory and payout journal. Sandbox behavior requires valid provider credentials and must not be presented as a live payout. Live payouts and NEAR-to-fiat funding are not enabled. See [fiat-payouts.md](fiat-payouts.md) for provider constraints.
