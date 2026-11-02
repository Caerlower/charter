# HSP Agentic Payment

Charter settles via the official HashKey Agentic Payment MCP ([docs](https://hsp-hackathon.hashkeymerchant.com/docs)).

## Flow

`get_chain_config` → `create_order` → `prepare_payment` → EIP-712 sign → `finalize_payment` → `submit_payment` → `query_payment`

App Key / App Secret are managed on HSP QA. Do not build merchant JWTs or x402 payloads yourself.

Code: `apps/api/src/hsp/mcp.ts`, `apps/api/src/hsp/agenticPayment.ts`.

## Attribution

Set `MERCHANT_NAME=Charter` so `expected_merchant_name` matches hackathon team reporting.

## Allowlist

MCP QA is Cloudflare-gated. Send a stable public egress IP to HSP Ops for team **Charter**.

Mobile hotspots rotate — prefer home WiFi or a hosted API egress (e.g. Render).

## Env

```bash
HSP_MODE=mcp
HSP_MCP_URL=https://mcp-qa.hashkeymerchant.com/
MERCHANT_NAME=Charter
PAY_TO_ADDRESS=0x…          # ≠ agent
AGENT_WALLET_PRIVATE_KEY=0x…
```

## Smoke

```bash
pnpm --filter @charter/api exec tsx src/index.ts
pnpm smoke
```

Mock settle (no MCP):

```bash
HSP_MODE=mock PORT=8788 pnpm --filter @charter/api exec tsx src/index.ts
API_BASE=http://localhost:8788/api pnpm smoke
```

## Wallet prep

1. `GET /api/rails` → fund `payer.address` with the QA token from `get_chain_config`
2. Complete EIP-3009 / Permit2 approvals for that token
3. Keep `payTo` ≠ `payer`
