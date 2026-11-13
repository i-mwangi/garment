# External assistants connecting to Settlbox

Settlbox exposes a JSON Streamable HTTP MCP endpoint at `/api/mcp`. This is
separate from outbound MCP connections, where Settlbox calls an owner-approved
remote server. The inbound endpoint supports initialization, scoped record reads
and immutable action proposals. It never approves, queues or executes payments.

## Connection

1. Sign in as a company owner and open Settings → MCP connections.
2. Create a separate expiring credential for each client and choose read access,
   proposal access, or both. The plaintext credential is displayed once; the
   server stores its hash.
3. Configure the client to call the deployed `/api/mcp` URL with
   `Authorization: Bearer <credential>`. Do not place credentials in URLs.
4. Review proposed changes under Finance agent → External assistant requests.

Local clients can use `http://127.0.0.1:<port>/api/mcp`. Remote clients require a
reachable HTTPS deployment whose origin is configured by the application. No
tunnel or public deployment is created automatically.

## Tools and authority

- `settlbox_list_records` reads a bounded set of company invoices and payables.
- `settlbox_action_catalog` describes supported proposal arguments.
- `settlbox_propose_action` saves an expiring, company-bound request with an
  idempotency key.
- `settlbox_proposal_status` reads proposals associated with the same credential.

Supported proposals use the existing application dispatcher and validations.
Payment-review proposals return to the Finance agent and native NEAR
authorization flow. An external client cannot approve a payment, change vault
policy, enable automation, access signing keys or invoke outbound tools.

Credentials are company-scoped, owner-bound, expiring and revocable. Membership,
origin, payload-size and rate-limit checks apply. Tool calls are audited without
storing authorization headers or plaintext tokens. Revocation blocks future
requests but cannot undo an already confirmed action.

## OAuth deployment

Hosted OAuth requires `SETTLBOX_OAUTH_ISSUER` to match the trusted public HTTPS
origin and that origin to be included in `SETTLBOX_ADDITIONAL_APP_ORIGINS`.
Authorization uses S256 PKCE, exact redirect matching, short-lived access tokens
and rotating refresh tokens. A public tunnel exposes the normal application and
does not bypass owner sign-in or consent.

## Verification boundary

Run `node --experimental-strip-types scripts/verify-inbound-mcp.mjs` after a
production build. The harness uses an isolated database and the official MCP
client without real provider credentials or funds. Passing it verifies protocol
and permission behavior, not connectivity from a particular hosted assistant.
