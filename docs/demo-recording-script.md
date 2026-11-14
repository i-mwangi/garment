# Settlbox AI finance operations demo script

This script presents Settlbox as an AI-assisted business-operations workspace
on native NEAR. The central story is not a wallet transfer: it is how a
company turns invoices, bills, payroll obligations, reimbursements and receipt
evidence into controlled, reviewable operations.

The Finance agent can analyze saved company records, attach a receipt to a
request, prepare a deterministic decision summary and propose supported
actions. The agent does not become an approver. Staff roles, company scope,
owner review, policy checks, wallet authorization, restricted vault execution
and finalized NEAR evidence remain separate controls.

Record only what is visible in the current environment. Label seeded, local,
mocked, sandbox, historical, provider-reported and live evidence accurately.
This is a recording plan, not proof that every configured provider or treasury
deployment is available.

The submission story is the **Autonomous Business** track: humans set policy,
the agent observes sales and obligations, and guarded workers prepare or execute
only what those constraints permit. Treasury, invoice collection, procurement,
MCP proposals, revenue-sharing obligations and public evidence form one causal
business loop. Do not present the example research-shop prompt as the product;
Settlbox is the general business-operations layer.

## Current rehearsal state — verify again before recording

At the time this guide was updated, the configured NEAR testnet vault was
deployed but paused, its internal liquid balance was zero, and it required one
human approval. The configured Web3Auth owner was the implicit account ending
in `344b`, which held 20 units of the project's test fixture token. These are
temporary rehearsal facts, not narration. Before recording, use
`/agent/controls` to add the approver, allow the intended recipient, fund the
vault through its deposit callback, activate it and refresh the observed state.
Read the final values from the screen; never reuse values from this paragraph.

Azure AI is the configured fallback when NEAR AI Cloud has no funded model.
Base USDC checkout through NEAR Intents remains disabled during the testnet
recording because that corridor is mainnet-only. Say this boundary explicitly
instead of simulating a cross-chain settlement.

## Voice-over and evidence rules

Read only the quoted narration. Numbered actions are recording instructions.
Replace bracketed values with the values visible in the current workspace.

- Say **native NEAR** and **NEP-141 USDC**. Do not say Arc or Circle.
- Never show passwords, seed phrases, private keys, bearer tokens, API keys,
  webhook URLs or real receipts containing personal information.
- A saved draft, agent proposal, approval request, provider response or HTTP
  success is not a completed payment.
- A payment is completed only when the expected finalized NEAR receipt, token
  transfer event, vault event and business record agree.
- Do not describe the agent's answer as private model reasoning. Show the
  saved decision summary, reasons, proposal terms and audit trail instead.
- Use a unique prefix such as `DEMO-20261113-A` for new disposable records.
- If a prerequisite is missing, record the boundary and stop that action. Do
  not replace a real workflow with a success fixture.

## What this recording proves

The recording is intended to show:

- company-scoped business records and receipt evidence;
- Finance-agent analysis of due, eligible and blocked obligations;
- deterministic planning based on saved records, cash, reserves and policy;
- staff access versus owner approval;
- exact proposal terms and stale-record protection;
- native NEAR payment review, restricted execution and final reconciliation;
- invoices, bills, payroll, reimbursements and payment links as durable records;
- inbound MCP access that can read or propose but cannot approve or pay;
- automation controls that can be stopped and cannot sign human approvals.

The recording does not, by itself, prove:

- a funded wallet or deployed treasury for the current workspace;
- provider availability or commercial readiness;
- live fiat payout, card, yield or Intents settlement;
- automatic two-way synchronization with an external service;
- that a historical or seeded paid row was created during this recording.

## 1. Prepare the workspace — approximately 30 seconds

### Show

1. Use a clean browser profile and keep `.env.local`, `.data`, credentials and
   private keys off camera.
2. From the repository root, use the existing configured environment. Do not
   copy `.env.example`, reseed data or rerun authentication setup immediately
   before recording unless you intentionally want a new workspace.

   **Development mode — application and inbound MCP endpoint:**

   ```powershell
   Set-Location C:\Users\Administrator\Music\Near
   npm ci
   npm run dev -- --hostname 127.0.0.1 --port 3000
   ```

   The inbound MCP server is part of this same Next.js process at
   `http://127.0.0.1:3000/api/mcp`; do not start a second MCP process.

   **Optional background Finance worker in development — second terminal:**

   ```powershell
   Set-Location C:\Users\Administrator\Music\Near
   $env:PORT='3000'
   npm run agent:worker
   ```

   **Production mode — application plus scheduled, Finance and payout workers:**

   ```powershell
   Set-Location C:\Users\Administrator\Music\Near
   npm ci
   npm run build
   $env:PORT='3000'
   $env:HOSTNAME='127.0.0.1'
   npm start
   ```

   `npm start` already starts the workers. Never run `npm run agent:worker` at
   the same time as `npm start`.

3. Open `http://127.0.0.1:3000/login`.
4. Confirm the network label, company/workspace name, current staff identity,
   wallet state and whether a native treasury binding is configured.

### Say

> **“This is Settlbox, an AI-native business-operations workspace on NEAR. A
> human sets treasury, approval and automation constraints; the Finance agent
> turns verified sales and saved obligations into reviewable actions. I will
> follow one operation from its business record through human authorization to
> final settlement evidence.”**

### Evidence

Capture the actual network and workspace identity. If the wallet or treasury
is unavailable, say that the later payment scene will remain at review or
configuration state.

## 2. Establish the business context and staff controls — approximately 45 seconds

### Show

1. Open the dashboard and point to obligations, receivables, payroll or
   activity without treating rounded totals as an on-chain balance.
2. Open **Settings → Company and team**.
3. Show the current company identity, member list and visible roles.
4. Show that administrative member changes are restricted to an OWNER or ADMIN.
5. If a separate staff session is available, show the staff member's role and
   the Finance-agent access boundary. Do not expose invitation tokens.
6. Return to `/agent`.

### Say

> **“Settlbox separates the people who operate the business from the authority
> to approve money movement. Staff work inside the company scope and can
> prepare or review business operations according to their role. Owner-level
> controls decide which proposals can proceed. The Finance agent does not
> replace those roles.”**

### Evidence

Show actual role labels. Do not claim that every staff role can create,
approve or execute every operation. The agent chat is available to OWNER and
ADMIN sessions; payment proposals are subject to the owner review path.

## 3. Create or open the business records — approximately 1 minute

### Show

Use existing disposable records when possible. Otherwise create one record of
each type with the unique demo prefix.

1. Open **Invoices** and show a customer, line item, amount, due date,
   receiving account and saved status.
2. Open **Bills** and show the contractor, recipient account, amount, due date,
   description and draft or unpaid status.
3. Open **Payroll** and show a prepared contractor or payroll period. Keep
   preparation separate from payment.
4. Open **Reimbursements** and show an expense request with a non-sensitive
   PNG/JPEG receipt. Show the request status and approval controls.
5. Open the saved detail view for one record and point to its stable ID.

### Say

> **“These are the business objects the agent operates on: an invoice to
> collect, a bill or payroll obligation to pay, and a reimbursement supported
> by a receipt. They are durable, company-scoped records. Saving one does not
> send money, and attaching a receipt does not approve an expense.”**

### Evidence

Do not use a fabricated recipient or account. Do not call a status label
settled without a matching transaction reference and receipt proof.

## 4. Give the agent a receipt-backed business request — approximately 50 seconds

### Show

1. Open `/agent` as an OWNER or ADMIN.
2. Attach a disposable PNG or JPEG receipt, at most 2 MB.
3. Ask a read-and-prepare question, for example:

   ```text
   Review this receipt and the saved reimbursement records. Tell me which
   request needs attention, what is missing, and prepare a review without
   approving or paying anything.
   ```

4. Show the receipt name attached to the saved conversation.
5. Show the response, the referenced record, missing information and proposed
   next step.
6. Do not approve or pay in this scene.

### Say

> **“The agent can receive business context and supporting receipt evidence.
> It does not treat an uploaded image as authorization. It matches the request
> to company records, explains what needs attention and stops at review until a
> permitted human action is taken.”**

### Evidence

Use a synthetic receipt. Never show employee addresses, bank details, card
numbers or real personal expense information.

## 5. Ask the Finance agent to analyze obligations — approximately 1 minute

### Show

1. Start a new agent question:

   ```text
   What needs attention in this workspace? Rank the saved invoices, bills,
   payroll obligations and reimbursements by due date and explain which are
   eligible, blocked or review-required. Do not execute anything.
   ```

2. Show the response and the **Financial decision summary**.
3. Expand the decision record and show:
   - observed balance;
   - protected liquidity and additional reserve;
   - available amount before proposed payments;
   - eligible payment amount;
   - blocked obligations and their reasons;
   - uncollected invoices excluded from spendable cash;
   - each action's record ID, amount, due date and disposition.
4. Open the agent audit trail and saved conversation.

### Say

> **“The Finance agent is making a controlled decision from saved records, not
> inventing unknown expenses. It distinguishes receivables from spendable cash,
> protects the liquidity floor, orders eligible obligations by due date and
> explains why another item is blocked. This is planning and explanation, not
> payment authorization.”**

### Evidence

Do not claim forecasting, autonomous financial judgment beyond the displayed
records, or a consolidated balance across unrelated accounts.

## 6. Prepare an exact proposal and demonstrate the control boundary — approximately 1 minute

### Show

1. Ask the agent:

   ```text
   Prepare a payment review for [exact saved unpaid bill]. Keep the amount,
   recipient, due date and network unchanged. Do not execute it.
   ```

2. Open the resulting proposal or payment review.
3. Show the exact record ID, amount, recipient, due date, network, funding
   source, policy reasons, proposal status and expiration if visible.
4. If the UI allows a disposable edit, change the underlying record and reopen
   the proposal. Otherwise show the stale-record warning from a previously
   prepared disposable example.
5. Leave the proposal unexecuted.

### Say

> **“The agent proposal is bound to the saved record and exact terms. A
> natural-language request cannot silently replace the recipient or amount. If
> the record changes, the current precondition must be checked again. A
> proposal is not a payment.”**

### Evidence

Capture the review terms, not only the agent's text. Do not edit a production
obligation just to create a visual effect.

## 7. Show the native agent payment sequence — approximately 1 minute 50 seconds

Use the full execution scene only when a verified native treasury, configured
NEP-141 USDC token, approved recipient, funded vault and authorized approver
exist for this workspace. Otherwise record the review state and use the
alternative narration below.

Before recording this scene, open `/agent/controls` and confirm all five facts
on screen: the vault says **Enabled**, its internal balance is nonzero,
**approval capacity ready** is no longer shown as an error, the bill recipient
is allowlisted, and the application policy permits the amount. The raw token
balance of the contract address is not the vault's spendable internal ledger.

### Sequence shown on screen

```text
saved obligation
→ bounded agent context
→ deterministic plan
→ exact proposal and precondition
→ owner review
→ payment reservation
→ native queue_payment
→ required human approval
→ restricted execute_payment
→ exact NEP-141 USDC transfer
→ finalized receipt and event verification
→ paid business record
→ worker reconciliation and audit event
```

### Show

1. Open **Finance agent → Finance controls** (`/agent/controls`) and show the
   verified vault state, policy limits and connected Web3Auth owner without
   reading the full account aloud.
2. Open the payment review and read the amount, recipient, network and vault.
3. Show the owner review control and the immutable saved business terms.
4. Show the saved payment moving through queue or approval states.
5. Open the native wallet authorization. Keep signing details private.
6. Show the approval transaction identity and then the restricted execution
   state.
7. Wait for the finalized NEAR receipt; do not call a pending hash settled.
8. Show the expected NEP-141 transfer event and native vault completion event.
9. Return to the bill or obligation and show the paid state and transaction
   reference.
10. Open the payment journal and public `/ledger` entry.

### Say during review

> **“The agent prepared this payment, but it cannot approve itself. The owner
> reviews the exact recipient and amount. Settlbox reserves the obligation and
> rechecks policy, liquidity, recipient permission and current record state
> before the native transaction is submitted.”**

### Say after final verification

> **“This is recorded as paid only after the finalized NEAR receipt contains
> the expected USDC transfer and vault completion event, and the business
> record is reconciled to that evidence. The restricted executor can use only
> the configured vault methods; it cannot create human approval or deploy a
> contract.”**

### Stop conditions

Stop at the current state if the vault is missing, paused, unfunded, outside
policy, missing approvers, using a non-allowlisted recipient, or returning an
uncertain receipt.

> **“The payment remains review-required. Settlbox does not treat a provider
> response, pending transaction or uncertain receipt as proof of settlement.”**

## 8. Show automation and agent control — approximately 45 seconds

### Show

1. Open **Finance agent → Finance controls** at `/agent/controls`.
2. Show whether automation is enabled or stopped.
3. Show automatic queueing, reserve, maximum actions per cycle and policy
   state if visible.
4. Open the automation audit events.
5. If safe, run one cycle with no eligible disposable payment, or show the
   policy-stopped result.
6. Show the controls to stop automation.

### Say

> **“Automation is a controlled worker, not an unrestricted agent wallet. It
> checks saved payments and can prepare or reconcile eligible work within
> limits. It cannot sign human approvals, change vault settings or bypass
> recipient permissions and spending policy. Stopping automation prevents new
> automatic submissions, while already-submitted transactions can still be
> reconciled.”**

Then show the revenue-sharing section while it remains disabled, or configure
only disposable test recipients whose NEAR accounts are also allowlisted.

> **“Revenue sharing is policy-driven and disabled by default. When enabled, a
> verified invoice sale creates exact, immutable payable obligations. Those
> obligations still pass through the same recipient permissions, liquidity
> limits, human approval and final receipt checks as every other bill.”**

### Evidence

Do not imply that enabling the worker proves a background runner is deployed.
Show the actual runner status and audit result.

## 9. Show invoices, bills, payroll and reimbursements together — approximately 1 minute 10 seconds

### Show

1. Reopen the invoice detail and printable preview. Show customer, line items,
   due date, receiving account and payment status.
2. Open the public payment page only with disposable data and show the accepted
   network and token. An issued link is not receipt evidence.
3. Reopen Bills and show draft, blocked, review-required and paid states if
   those states actually exist.
4. Open Payroll and show preparation, contractor terms and period status.
5. Reopen the reimbursement and show its receipt, review status and approval
   decision. Do not pay it unless the native sequence was separately verified.
6. Open a transaction detail and show amount, status and settlement reference.

### Say

> **“The same workspace carries the supporting business operations around the
> agent. Invoices and payment links describe money to collect. Bills and
> payroll describe obligations to pay. Reimbursements connect an employee
> expense to receipt evidence and review. Across these screens, I distinguish
> a saved record, a review decision and a confirmed settlement.”**

### Evidence

Do not claim email delivery, payroll settlement, reimbursement payment or
customer collection from a form or status label alone.

## 10. Show external assistants through MCP — approximately 1 minute 30 seconds

### Start and verify MCP

Inbound MCP is not a separate daemon. Starting Settlbox starts the Streamable
HTTP MCP endpoint at `/api/mcp`. With the application running, use a separate
terminal for the isolated protocol verification:

```powershell
Set-Location C:\Users\Administrator\Music\Near
node --experimental-strip-types scripts/verify-inbound-mcp.mjs
```

That harness uses an isolated database and the official MCP client; it does not
spend money or prove that a particular external assistant can reach localhost.
For a real client, create a short-lived credential in Settlbox, then configure:

```text
Transport: Streamable HTTP
URL: http://127.0.0.1:3000/api/mcp
Header: Authorization: Bearer <one-time credential shown by Settlbox>
```

Never paste the bearer value into the recording, repository, command history or
client URL. A hosted external assistant cannot reach localhost without an
explicit HTTPS deployment; do not create a public tunnel just for this scene.

### Inbound assistant

1. Open the MCP access settings and create a short-lived recording credential
   with only `records:read` or `actions:propose`.
2. Do not show the credential value.
3. Connect an external assistant to `/api/mcp`.
4. Ask it:

   ```text
   List unpaid draft bills. Read only; do not propose changes or payments.
   ```

5. Select one disposable unpaid bill and ask the assistant to propose changing
   only its description, preserving amount, recipient and due date.
6. Open **Finance agent → External assistant requests** in Settlbox.
7. Review the exact proposal, confirm it as the owner and reopen the bill to
   show the persisted description.
8. Show the access scope and audit activity, then revoke the credential.

### Say

> **“An external assistant can read permitted records or propose a supported
> change through MCP. The proposal returns to Settlbox for owner review. The
> assistant does not receive wallet credentials and cannot approve or execute a
> payment.”**

### Outbound connection

If an approved external MCP server is configured, show its name, enabled tools,
fingerprint and connection status. Ask the Finance agent to use one harmless
tool, open the `mcp.call` review, confirm it and show the audit result.

> **“Outbound MCP is also treated as untrusted external data. Settlbox checks
> the configured connection and tool scope, and routes the call through the
> same review boundary.”**

Do not show credentials or allow an external tool to receive payment authority.

## 11. Brief service tour and capability boundaries — approximately 1 minute

Show only configured or meaningful screens:

- **Google Sheets:** explicit reviewed import/export; not automatic
  two-way synchronization.
- **Slack:** structured notifications when configured; not settlement proof.
- **Stripe:** read-only provider snapshot; not spendable NEAR balance.
- **Fiat payouts:** sandbox or setup only unless a separately verified
  provider result exists; simulated funds are not a bank or mobile-money
  payment.
- **Gifts:** recipient and expiry records; claim/refund requires separate
  deployed and verified escrow evidence.
- **Earn:** provider observation and approval state; not a guaranteed return.
- **NEAR Intents/1Click:** disabled by default and mainnet-only for
  Base USDC → NEAR mainnet USDC; provider status still requires final NEAR
  destination verification.

### Say

> **“Settlbox has supporting integrations and service areas, but each has its
> own evidence boundary. I am showing configured workflows and interfaces,
> not claiming that an integration, provider sandbox or historical record is
> a native NEAR settlement.”**

## 12. Close with verification — approximately 35 seconds

### Show

1. Show the final business record, payment review or blocked state that matches
   the footage.
2. Show the transaction explorer only for a transaction recorded in this demo
   and independently verified.
3. If demonstrating repository verification, show:

   ```powershell
   npm test
   npm run typecheck
   npm run test:near
   ```

4. Keep test output and documentation visible without exposing environment
   files or secrets.

### Closing narration

> **“Settlbox puts AI assistance inside a controlled business-operations
> system. The agent reads company records, works with invoice and receipt
> evidence, explains priorities and prepares exact proposals. Staff operate
> within their roles; owners review authority-sensitive actions; native NEAR
> wallet and vault controls enforce the payment boundary; and final receipts
> reconcile the business record. External assistants can read or propose within
> explicit scopes, but they do not become payment approvers.”**

## Five-minute submission cut

Use this order if the submission has a strict five-minute limit. Record the
long version first, then edit to these timestamps. Read the quoted lines exactly
unless the visible state contradicts them.

| Time | Screen and action | Narration |
| --- | --- | --- |
| 0:00–0:25 | Dashboard, company and NEAR Testnet label | “Settlbox is an AI-native business-operations workspace on NEAR. Humans set the constraints; the agent connects treasury, sales and procurement without becoming the approver.” |
| 0:25–0:55 | Invoice, bill and reimbursement records | “Invoices are money to collect. Bills, payroll and reimbursements are obligations to review. Saving a record or receipt does not move money.” |
| 0:55–1:35 | Finance-agent question and structured decision summary | “The agent reads canonical company records, separates receivables from available cash, preserves liquidity and explains which action is eligible or blocked.” |
| 1:35–2:05 | Exact proposal review and record-bound terms | “This proposal is bound to one saved record, recipient and amount. A changed record must be reviewed again.” |
| 2:05–3:15 | `/agent/controls`, queue, Web3Auth approval and finalized receipt | “The vault enforces recipient permissions and spending limits. The agent cannot sign; the human approver authorizes the exact action, and Settlbox records payment only after final NEAR and token evidence agree.” |
| 3:15–3:40 | Automation policy, kill switch and revenue sharing | “Automation is bounded and stoppable. Revenue sharing is disabled by default and, when enabled, creates immutable obligations that use the same approval path.” |
| 3:40–4:15 | MCP scoped read/proposal and owner request list | “External assistants receive scoped MCP access. They can read or propose, but the owner reviews the request inside Settlbox and no MCP client receives signing authority.” |
| 4:15–4:40 | Public ledger and explorer link | “The public ledger links verified sales and treasury payouts to evidence while excluding private prompts, customer details and credentials.” |
| 4:40–5:00 | Tests and final product screen | “Settlbox makes the company operable by an agent while keeping policy, human authority and settlement verification explicit.” |

If the payment remains paused, unfunded or pending, replace the 2:05 narration
with: **“The workflow stops here because the current vault condition is not
satisfied. Settlbox does not convert a pending request into a success claim.”**

## Command reference for rehearsal and judging

Run commands from `C:\Users\Administrator\Music\Near`.

### Install and verify

```powershell
npm ci
npm test
npm run typecheck
npm run test:near
```

### Development application and MCP endpoint

Terminal 1:

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Endpoints:

```text
Application: http://127.0.0.1:3000
Finance controls: http://127.0.0.1:3000/agent/controls
Public ledger: http://127.0.0.1:3000/ledger
Inbound MCP: http://127.0.0.1:3000/api/mcp
```

Terminal 2, only when testing scheduled Finance cycles in development:

```powershell
$env:PORT='3000'
npm run agent:worker
```

Protocol verification in another terminal:

```powershell
node --experimental-strip-types scripts/verify-inbound-mcp.mjs
```

### Production launcher

```powershell
npm run build
$env:PORT='3000'
$env:HOSTNAME='127.0.0.1'
npm start
```

The production launcher starts the web app and background workers together.
Do not also start `agent:worker`.

## Final editing checklist

- [ ] The recording starts with the business problem, not a generic wallet tour.
- [ ] Company, staff role and owner authority are shown accurately.
- [ ] At least one invoice, bill, reimbursement receipt and agent decision are
      visible.
- [ ] Agent planning, proposal review and payment authorization are separate
      scenes.
- [ ] Automation is described as bounded and stoppable.
- [ ] A payment is called complete only with finalized NEAR and token evidence.
- [ ] Seeded, historical, mocked, sandbox and live records are labelled.
- [ ] MCP credentials and private receipt data are hidden.
- [ ] Secondary integrations are not presented as the main product.
- [ ] The final narration matches the footage and current environment.
