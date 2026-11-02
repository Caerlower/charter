#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

RPC="${SEPOLIA_RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
KEY_FILE=".deploy/sepolia.key"
ADDR_FILE=".deploy/sepolia.address"

if [[ ! -f "$KEY_FILE" ]]; then
  echo "Missing $KEY_FILE — generate with: cast wallet new"
  exit 1
fi

PK=$(cat "$KEY_FILE")
ADDR=$(cast wallet address "$PK")
echo "$ADDR" > "$ADDR_FILE"

BAL=$(cast balance "$ADDR" --rpc-url "$RPC")
echo "Deployer: $ADDR"
echo "Sepolia ETH (wei): $BAL"
if [[ "$BAL" == "0" ]]; then
  echo ""
  echo "Fund this address with Sepolia ETH, then re-run:"
  echo "  https://cloud.google.com/application/web3/faucet/ethereum/sepolia"
  echo "  https://www.alchemy.com/faucets/ethereum-sepolia"
  echo ""
  echo "Optional Circle test USDC (for fund(), not required for credit()):"
  echo "  https://faucet.circle.com  → Ethereum Sepolia → $ADDR"
  exit 1
fi

export PRIVATE_KEY="$PK"
forge create src/MandateVault.sol:MandateVault \
  --broadcast \
  --rpc-url "$RPC" \
  --private-key "$PK" \
  --constructor-args 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238 "$(cast wallet address "$PK")" \
  --gas-limit 8000000 \
  --with-gas-price 2gwei \
  --priority-gas-price 1gwei
