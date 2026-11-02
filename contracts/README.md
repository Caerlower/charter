# MandateVault

On-chain spend envelope for Charter (authorize / receipt). HSP settlement stays on HashKey MCP and can run on a different chain than this vault.

## Sepolia (hackathon)

Uses Circle test USDC: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`

```bash
forge install foundry-rs/forge-std
# fund contracts/.deploy/sepolia.address with Sepolia ETH, then:
./script/deploy-sepolia.sh
```

Wire the printed `MandateVault` address into `apps/api/.env`:

```bash
VAULT_ADDRESS=0x…
VAULT_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
VAULT_CHAIN_ID=11155111
VAULT_USDC=0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
```

Owner/operator keys in the API `.env` must match the deployer (or be set as operators on the vault).

## HashKey testnet

```bash
PRIVATE_KEY=0x… TOKEN=0x8FE3cB719Ee4410E236Cd6b72ab1fCDC06eF53c6 \
  forge script script/Deploy.s.sol:Deploy --rpc-url https://testnet.hsk.xyz --broadcast
```

## Local

```bash
forge test -vv
DEPLOY_MOCK_USDC=true forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:8545 --broadcast
```
