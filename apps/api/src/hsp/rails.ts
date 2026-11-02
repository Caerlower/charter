import { config } from "../config.js";
import { getAgentView, unitsToUsdc, vaultMode } from "../lib/vault.js";
import { callHspTool, probeHspMcp } from "./mcp.js";

export type PaymentRails = {
  product: "Charter";
  model: "platform_agent_wallet";
  explanation: string;
  merchantName: string;
  hspMode: "mock" | "mcp";
  hspMcp: { ok: boolean; url: string; tools?: string[]; error?: string };
  payer: {
    address: string;
    role: "platform_agent_wallet";
    fundThisAddress: true;
    note: string;
  };
  payTo: {
    address: string;
    role: "recipient";
    note: string;
  };
  vault: {
    mode: string;
    address: string | null;
    balanceUsdc: string;
  };
  chain?: {
    network?: string;
    chainId?: number;
    tokenAddress?: string;
    tokenDecimals?: number;
    protocol?: string;
    raw?: unknown;
  };
  agentApi: {
    base: string;
    auth: string;
    endpoints: string[];
  };
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

export async function getPaymentRails(): Promise<PaymentRails> {
  const agent = await getAgentView();
  const hspMcp =
    config.hspMode === "mcp"
      ? await probeHspMcp()
      : { ok: true, url: config.hspMcpUrl, tools: [] as string[] };

  let chain: PaymentRails["chain"];
  if (config.hspMode === "mcp" && hspMcp.ok) {
    try {
      const chainConfig = await callHspTool("get_chain_config", {});
      const root = asRecord(chainConfig);
      const networks = (root.networks ?? root.chains ?? root.data ?? chainConfig) as unknown;
      const list = Array.isArray(networks)
        ? networks
        : Array.isArray(asRecord(networks).networks)
          ? (asRecord(networks).networks as unknown[])
          : [root];
      const preferred =
        (list as Array<Record<string, unknown>>).find((n) => {
          const id = Number(n.chain_id ?? n.chainId ?? 0);
          return id === config.chainId || String(n.network ?? "").toLowerCase().includes("hashkey");
        }) ?? (list[0] as Record<string, unknown>);
      const tokens = (preferred?.tokens as Array<Record<string, unknown>>) ?? [];
      const token =
        tokens.find((t) => String(t.address ?? "").toLowerCase() === config.usdc.toLowerCase()) ??
        tokens.find((t) => /usdc/i.test(String(t.symbol ?? t.coin ?? ""))) ??
        tokens[0];
      chain = {
        network: String(preferred?.network ?? `eip155:${preferred?.chain_id ?? config.chainId}`),
        chainId: Number(preferred?.chain_id ?? preferred?.chainId ?? config.chainId),
        tokenAddress: token?.address ? String(token.address) : config.usdc,
        tokenDecimals: token?.decimals != null ? Number(token.decimals) : 6,
        protocol: String(token?.payment_protocol ?? "eip3009"),
        raw: chainConfig,
      };
    } catch {
      chain = {
        network: config.network,
        chainId: config.chainId,
        tokenAddress: config.usdc,
        tokenDecimals: 6,
        protocol: "eip3009",
      };
    }
  } else {
    chain = {
      network: config.network,
      chainId: config.chainId,
      tokenAddress: config.usdc,
      tokenDecimals: 6,
      protocol: "eip3009",
    };
  }

  return {
    product: "Charter",
    model: "platform_agent_wallet",
    explanation:
      "Humans approve an Intent Mandate once. Claude/Grok get a Bearer API key only. " +
      "Charter holds the platform agent wallet and signs HSP payments when policy allows.",
    merchantName: config.merchantName,
    hspMode: config.hspMode,
    hspMcp,
    payer: {
      address: config.agentAddress,
      role: "platform_agent_wallet",
      fundThisAddress: true,
      note: "Fund this address with the exact QA USDC from get_chain_config. Complete Permit2/EIP-3009 approvals manually.",
    },
    payTo: {
      address: config.payToAddress,
      role: "recipient",
      note: "Must differ from payer. HSP create_order pay_to.",
    },
    vault: {
      mode: vaultMode(),
      address: config.vaultAddress || null,
      balanceUsdc: unitsToUsdc(agent.balance),
    },
    chain,
    agentApi: {
      base: "/api/v1",
      auth: "Authorization: Bearer chlive_…",
      endpoints: [
        "GET  /api/v1/connect",
        "GET  /api/v1/rails",
        "POST /api/v1/intent   (create draft charter / policy)",
        "GET  /api/v1/me",
        "POST /api/v1/search   { category: hotel|flight }",
        "POST /api/v1/settle   { offerId }",
        "GET  /api/v1/activity",
      ],
    },
  };
}
