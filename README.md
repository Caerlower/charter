# Charter

Human Not Present payments on [HashKey](https://www.hashkey.com/) HSP.

Approve an Intent Mandate once. Issue an agent API key. Agents search and settle under your spend envelope — you get notified.

```
Human (desk)          Agent (Claude / Grok)         Charter API              HSP MCP
─────────────────     ─────────────────────         ───────────              ───────
Fund payer wallet
Approve mandate  ←──  POST /v1/intent (draft)
Issue chlive_ key
                      POST /v1/search  ───────────► policy check
                      POST /v1/settle  ───────────► prepare → sign → finalize → submit → query
                                                   (platform AGENT_WALLET signs)
```

## Stack

| Path | Role |
| --- | --- |
| `apps/api` | Express API — charters, agent `/api/v1`, HSP client |
| `apps/web` | Landing + product desk |
| `contracts` | MandateVault (Foundry) — spend envelope on HSK |
| `docs/` | HSP integration notes |

## Quick start

```bash
pnpm install
cp .env.example apps/api/.env
cd contracts && forge install foundry-rs/forge-std && cd ..
pnpm dev
```

- Landing: http://localhost:5173  
- Desk: http://localhost:5173/app  
- API: http://localhost:8787  

```bash
pnpm smoke
```

Use `HSP_MODE=mock` locally. Set `HSP_MODE=mcp` after HashKey QA allowlists your egress IP (see `docs/HSP-AGENTIC-PAYMENT.md`).

## Agent flow

1. `POST /api/v1/intent` — draft policy (city, dates, budget)
2. `POST /api/charters/:id/approve` — `{ "issueKey": true, "agentName": "Claude" }`
3. `POST /api/v1/search` — Bearer `chlive_…`, `{ "category": "hotel" }`
4. `POST /api/v1/settle` — `{ "offerId": "…" }`

Claude never holds keys. Charter signs HSP payments from the platform agent wallet.

## License

Private / hackathon submission — all rights reserved unless otherwise noted.
