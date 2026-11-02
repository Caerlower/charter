# Submission pack — HashKey Horizon Track 2

## One-liner

Charter: Human Not Present payments — Intent Mandates for AI agents settling on HashKey HSP via a platform wallet.

## Track

**Agent Payments & A2A Settlement** — uses official HSP Agentic Payment MCP.

## Links

- GitHub: https://github.com/Caerlower/charter
- HSP docs: https://hsp-hackathon.hashkeymerchant.com/docs
- HashFans: https://hashfans.io/
- Sepolia MandateVault: https://sepolia.etherscan.io/address/0x7C55AFCB871dA42aa855509f02A75b6AFeF15257

## Team / HSP reporting

- `merchant_name` / team name: **Charter**
- MCP QA URL: `https://mcp-qa.hashkeymerchant.com/`

## What to submit on DoraHacks / Devfolio

1. Project name: **Charter**
2. Track: Agent Payments & A2A Settlement
3. Repo URL: https://github.com/Caerlower/charter
4. Demo video (record locally): desk approve → agent search → settle + deny path
5. Deployed contract:
   - Sepolia (testing): `0x7C55AFCB871dA42aa855509f02A75b6AFeF15257`
   - HashKey mainnet (required for demo selection): deploy with `forge` + record in `contracts/deployments/hsk-mainnet.json`
6. Short description: paste README Problem + Solution sections
7. Tech stack: TypeScript, Express, React, Foundry, ethers, HSP MCP SDK

## Demo day talking points

- Agents don’t hold keys; Intent Mandate is the human authority.
- Policy deny is first-class (over max / merchant).
- Settlement is real HSP MCP, not a mocked x402 DIY stack.
- MandateVault is the on-chain envelope; HSP is the settlement rail.

## Blockers / honesty

- Live MCP settle needs IP allowlist from HSP Ops.
- Mainnet MandateVault must be deployed before demo selection if organizers enforce the mainnet rule strictly.
