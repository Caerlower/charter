# Charter

**Human Not Present payments for AI agents on HashKey HSP.**

Approve an Intent Mandate once. Issue a Bearer key to Claude/Grok. Agents search and settle under your spend envelope — Charter signs with a platform wallet, enforces policy, and notifies you.

| | |
| --- | --- |
| **Track** | HashKey Chain Horizon · **Track 2 — Agent Payments & A2A Settlement** |
| **Repo** | [github.com/Caerlower/charter](https://github.com/Caerlower/charter) |
| **HSP** | Official Agentic Payment MCP (`prepare → sign → finalize → submit → query`) |
| **Team reporting name** | `Charter` (`MERCHANT_NAME` / `expected_merchant_name`) |

---

## Problem

AI agents can plan trips and pick hotels, but humans still have to click “pay.” Giving an agent a raw wallet is unsafe. Card rails ignore crypto settlement. Hackathon agents need **governed spend**: a human-approved envelope, merchant allowlists, and real settlement on HashKey HSP — while the human is AFK.

## Solution

Charter is an **AFK spend envelope / governed paymaster**:

1. **Human** drafts a charter (budget, dates, max per payment, merchants) and signs an **EIP-712 Intent Mandate**.
2. **Human** issues a `chlive_…` API key (agents never hold private keys).
3. **Agent** searches offers and calls settle.
4. **Charter** checks Intent Mandate + MandateVault policy, then settles via **HSP Agentic Payment MCP** using the **platform agent wallet**.
5. **Human** gets activity + notifications (email / telegram / inbox).

```
Human (desk)            Agent (Claude / Grok)         Charter API                 HSP MCP
─────────────────       ─────────────────────         ───────────                 ───────
Fund payer wallet
Approve Intent Mandate ←── POST /v1/intent (draft)
Issue chlive_ key
                        POST /v1/search  ───────────► policy check
                        POST /v1/settle  ───────────► get_chain_config → create_order
                                                     → prepare → EIP-712 sign
                                                     → finalize → submit → query
                                                     (AGENT_WALLET signs)
```

---

## Hackathon submission checklist

Aligned with [HashKey Chain Horizon (Mumbai)](https://www.hackathonradar.com/database/hackathon/hashkey-chain-horizon-hackathon-india-2026) Track 2 requirements:

| Requirement | Status |
| --- | --- |
| Original project built during the hackathon | Yes |
| Track 2 — Agent Payments & A2A Settlement | Yes |
| Uses **HSP** (official Agentic Payment MCP) | Yes — `apps/api/src/hsp/` |
| Official recommended tools (MCP / HashFans stack) | Yes — MCP QA client, no hand-rolled x402/JWT settle |
| Smart contract (MandateVault) | Deployed on **Ethereum Sepolia** for testing ([address](#deployments)); **HashKey Chain mainnet** required for demo selection — see [mainnet deploy](#hashkey-chain-mainnet) |
| Public GitHub | [Caerlower/charter](https://github.com/Caerlower/charter) |
| Demo script / smoke | `pnpm smoke` |
| HSP attribution | `merchant_name=Charter` |

**Judges / ops:** egress IP must be allowlisted for MCP QA before live settle works. Until then, `HSP_MODE=mock` demos the full product path.

---

## Architecture

| Path | Role |
| --- | --- |
| `apps/api` | Express — human charter routes + agent `/api/v1` + HSP MCP client + vault adapter |
| `apps/web` | Landing + product desk (sidebar: Overview, Work, Activity, Messages, Access, Wallet) |
| `contracts` | Foundry `MandateVault` — prepaid envelope, policy, merchant allowlist, settlement receipts |
| `docs/` | HSP integration + submission notes |

**Wallet model:** Claude never holds keys. Charter holds `AGENT_WALLET_PRIVATE_KEY` and signs HSP EIP-712 payloads when policy allows.

**Dual-chain note:** HSP live settle uses HashKey QA network/token from `get_chain_config`. MandateVault may run on Sepolia (hackathon test USDC) while MCP settle stays on HashKey — configured via `VAULT_*` env vars.

---

## Deployments

### Ethereum Sepolia (hackathon contract testing)

| Contract | Address |
| --- | --- |
| **MandateVault** | [`0x7C55AFCB871dA42aa855509f02A75b6AFeF15257`](https://sepolia.etherscan.io/address/0x7C55AFCB871dA42aa855509f02A75b6AFeF15257) |
| Circle USDC | [`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`](https://sepolia.etherscan.io/address/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238) |
| Deploy tx | [`0x5467cf30…0d10`](https://sepolia.etherscan.io/tx/0x5467cf30795d9b9d66d8d64b18b8a4c846f3389d6e4b749971e5372c55029d10) |
| Owner | `0x9Dd7F2548209b763edcc7e9BfCf0b2E4Ea98C0C8` |

JSON: [`contracts/deployments/sepolia.json`](./contracts/deployments/sepolia.json)

### HashKey Chain mainnet

Demo selection requires MandateVault on **HashKey Chain mainnet** (chain id `177`).

```bash
# Fund deployer with HSK, then:
PRIVATE_KEY=0x… TOKEN=0x054ed45810DbBAb8B27668922D110669c9D88D0a \
  forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://mainnet.hsk.xyz --broadcast -vvv
```

Record the address in `contracts/deployments/hsk-mainnet.json` and set `VAULT_ADDRESS` / `VAULT_RPC_URL` accordingly.

---

## Quick start

```bash
pnpm install
cp .env.example apps/api/.env
cd contracts && forge install && cd ..
pnpm dev
```

| Surface | URL |
| --- | --- |
| Landing | http://localhost:5173 |
| Desk | http://localhost:5173/app |
| API | http://localhost:8787 |
| Agent connect | http://localhost:8787/api/v1/connect |

```bash
pnpm smoke                 # intent → approve → key → search → deny → settle
pnpm test:contracts        # forge test
```

- Local product demo: `HSP_MODE=mock`
- Live HSP: `HSP_MODE=mcp` after MCP allowlist + funded QA USDC on the payer (see [`docs/HSP-AGENTIC-PAYMENT.md`](./docs/HSP-AGENTIC-PAYMENT.md))

---

## Agent API

Auth: `Authorization: Bearer chlive_…`

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/connect` | How agents connect (public) |
| `GET` | `/api/v1/rails` | Payer address, MCP status, chain token |
| `POST` | `/api/v1/intent` | Draft charter from trip NL |
| `GET` | `/api/v1/me` | Charter + remaining budget |
| `POST` | `/api/v1/search` | `{ "category": "hotel" \| "flight" }` |
| `POST` | `/api/v1/settle` | `{ "offerId": "…" }` → policy + HSP |
| `GET` | `/api/v1/activity` | Settlements / notifications |

Human desk helpers: `POST /api/charters`, `POST /api/charters/:id/approve`, `POST /api/charters/:id/keys`.

Example:

```bash
# 1) Draft
curl -sX POST localhost:8787/api/v1/intent -H 'content-type: application/json' -d '{
  "city":"Mumbai","checkIn":"2026-11-03","checkOut":"2026-11-10",
  "budgetUsdc":"400","maxPerPaymentUsdc":"250","agentName":"Claude"
}'

# 2) Human approve + issue key
curl -sX POST localhost:8787/api/charters/chr_…/approve \
  -H 'content-type: application/json' \
  -d '{"issueKey":true,"agentName":"Claude"}'

# 3) Agent search / settle
export KEY=chlive_…
curl -sX POST localhost:8787/api/v1/search -H "Authorization: Bearer $KEY" \
  -H 'content-type: application/json' -d '{"category":"hotel"}'
curl -sX POST localhost:8787/api/v1/settle -H "Authorization: Bearer $KEY" \
  -H 'content-type: application/json' -d '{"offerId":"offer_…"}'
```

---

## HSP integration

Official MCP flow (App Key/Secret server-managed on QA):

`get_chain_config` → `create_order` → `prepare_payment` → sign EIP-712 → `finalize_payment` → `submit_payment` → `query_payment`

Implementation: `apps/api/src/hsp/mcp.ts`, `apps/api/src/hsp/agenticPayment.ts`.

Docs: [`docs/HSP-AGENTIC-PAYMENT.md`](./docs/HSP-AGENTIC-PAYMENT.md) · [HSP docs](https://hsp-hackathon.hashkeymerchant.com/docs) · [HashFans](https://hashfans.io/)

---

## Demo script (3 minutes)

1. Open desk → **New charter** (or Tokyo sample) → **Approve Intent Mandate** → **Issue key**.
2. Show agent wallet card (platform payer) on Overview / Wallet.
3. **Find hotels** → settle cheapest → show Activity receipt.
4. Attempt premium flight → **blocked** by Intent Mandate (`exceeds_max_per_payment`).
5. Point to HSP path (rails pill + `/api/v1/rails`) and Sepolia MandateVault explorer link.

---

## Environment

See [`.env.example`](./.env.example). Important vars:

| Var | Purpose |
| --- | --- |
| `HSP_MODE` | `mock` \| `mcp` |
| `MERCHANT_NAME` | Must be `Charter` for hackathon attribution |
| `AGENT_WALLET_PRIVATE_KEY` | HSP payer (fund QA USDC) |
| `PAY_TO_ADDRESS` | Recipient ≠ payer |
| `VAULT_ADDRESS` / `VAULT_RPC_URL` | On-chain MandateVault (Sepolia or HSK) |
| `OWNER_PRIVATE_KEY` | Vault owner / operator |

---

## License

Hackathon submission — all rights reserved unless otherwise noted.
