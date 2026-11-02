import "dotenv/config";
import { Wallet } from "ethers";

const rawMode = (process.env.HSP_MODE ?? "mock").toLowerCase();
const mode = (rawMode === "live" || rawMode === "mcp" ? "mcp" : "mock") as "mock" | "mcp";

const agentPk =
  process.env.AGENT_WALLET_PRIVATE_KEY ??
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const ownerPk =
  process.env.OWNER_PRIVATE_KEY ??
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const agentWallet = new Wallet(agentPk);
const ownerWallet = new Wallet(ownerPk);

/** Circle USDC on Ethereum Sepolia (hackathon contract testing). */
const SEPOLIA_USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

export const config = {
  port: Number(process.env.PORT ?? 8787),
  hspMode: mode,
  hspMcpUrl: process.env.HSP_MCP_URL ?? "https://mcp-qa.hashkeymerchant.com/",
  hspBaseUrl: process.env.HSP_BASE_URL ?? "https://merchant-qa.hashkeymerchant.com",
  appKey: process.env.APP_KEY ?? "demo-app-key",
  appSecret: process.env.APP_SECRET ?? "demo-app-secret",
  merchantName: process.env.MERCHANT_NAME ?? process.env.CHARTER_TEAM_NAME ?? "Charter",
  merchantPrivateKeyPem: process.env.MERCHANT_PRIVATE_KEY_PEM ?? "",
  merchantPrivateKeyPath: process.env.MERCHANT_PRIVATE_KEY_PATH ?? "",
  payToAddress:
    process.env.PAY_TO_ADDRESS ?? "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  /** Display / HSP preference — MCP get_chain_config remains source of truth for live settle. */
  network: process.env.NETWORK ?? "hashkey-testnet",
  chainId: Number(process.env.CHAIN_ID ?? 133),
  usdc: process.env.USDC_CONTRACT ?? "0x8FE3cB719Ee4410E236Cd6b72ab1fCDC06eF53c6",
  rpcUrl: process.env.RPC_URL ?? "http://127.0.0.1:8545",
  explorerBase: process.env.EXPLORER_BASE ?? "https://testnet-explorer.hsk.xyz",
  /**
   * MandateVault can live on a different chain than HSP settle (e.g. Sepolia vault + HashKey MCP).
   * Falls back to primary RPC/USDC when unset.
   */
  vaultAddress: process.env.VAULT_ADDRESS ?? "",
  vaultRpcUrl: process.env.VAULT_RPC_URL ?? process.env.RPC_URL ?? "http://127.0.0.1:8545",
  vaultChainId: Number(process.env.VAULT_CHAIN_ID ?? process.env.CHAIN_ID ?? 133),
  vaultUsdc: process.env.VAULT_USDC ?? process.env.USDC_CONTRACT ?? SEPOLIA_USDC,
  vaultExplorerBase:
    process.env.VAULT_EXPLORER_BASE ??
    process.env.EXPLORER_BASE ??
    "https://sepolia.etherscan.io",
  agentPrivateKey: agentPk,
  agentAddress: process.env.AGENT_WALLET_ADDRESS ?? agentWallet.address,
  ownerPrivateKey: ownerPk,
  ownerAddress: ownerWallet.address,
  redirectBaseUrl: process.env.REDIRECT_BASE_URL ?? "http://localhost:5173",
};

export type AppConfig = typeof config;
