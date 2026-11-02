import { Wallet } from "ethers";
import { config } from "../config.js";
import { assertHspTools, callHspTool } from "./mcp.js";

export type ChainToken = {
  address: string;
  decimals: number;
  payment_protocol?: string;
  symbol?: string;
  coin?: string;
};

export type ChainNetwork = {
  network?: string;
  chain_id?: number;
  chainId?: number;
  tokens?: ChainToken[];
  [key: string]: unknown;
};

export type AgenticPayInput = {
  merchantName: string;
  payTo: string;
  payer: string;
  amountUsd: string;
  itemId: string;
  itemName: string;
  itemDescription: string;
  protocol?: "eip3009" | "permit2";
};

export type AgenticPayResult = {
  flowId: string;
  paymentRequestId: string;
  paymentUrl?: string;
  tokenTotalRaw: string;
  payTo: string;
  payer: string;
  network?: string;
  submitStatus: string;
  finalStatus: string;
  attributionVerified?: boolean;
  txSignature?: string;
  quoteExpiresAt?: string;
  raw: {
    chainConfig: unknown;
    order: unknown;
    prepare: unknown;
    finalize: unknown;
    submit: unknown;
    query: unknown;
  };
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v) return v;
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

function cartExpiryRfc3339(minutes = 30) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function selectNetworkAndToken(chainConfig: unknown): {
  network: string;
  chainId: number;
  token: ChainToken;
  protocol: "eip3009" | "permit2";
} {
  const root = asRecord(chainConfig);
  const networks = (root.networks ?? root.chains ?? root.data ?? chainConfig) as unknown;
  const list: ChainNetwork[] = Array.isArray(networks)
    ? (networks as ChainNetwork[])
    : Array.isArray(asRecord(networks).networks)
      ? (asRecord(networks).networks as ChainNetwork[])
      : [root as ChainNetwork];

  // Prefer HashKey QA network from MCP even if MandateVault is on Sepolia.
  const preferred =
    list.find((n) => String(n.network ?? "").toLowerCase().includes("hashkey")) ??
    list.find((n) => Number(n.chain_id ?? n.chainId ?? 0) === config.chainId) ??
    list[0];

  if (!preferred) throw new Error("get_chain_config returned no networks");

  const tokens = preferred.tokens ?? [];
  const token =
    tokens.find((t) => t.address?.toLowerCase() === config.usdc.toLowerCase()) ??
    tokens.find((t) => /usdc/i.test(String(t.symbol ?? t.coin ?? ""))) ??
    tokens[0];

  if (!token?.address) {
    throw new Error("get_chain_config returned no payment token. Fund/config mismatch.");
  }

  const protocol = (
    (token.payment_protocol === "permit2" ? "permit2" : "eip3009") as "eip3009" | "permit2"
  );

  return {
    network: String(preferred.network ?? `eip155:${preferred.chain_id ?? preferred.chainId}`),
    chainId: Number(preferred.chain_id ?? preferred.chainId ?? config.chainId),
    token,
    protocol,
  };
}

function buildCartMandate(opts: {
  amountUsd: string;
  itemId: string;
  itemName: string;
  itemDescription: string;
  network: string;
  tokenAddress: string;
  protocol: string;
}) {
  const id = `cart_${Date.now().toString(36)}`;
  return {
    contents: {
      id,
      cart_expiry: cartExpiryRfc3339(30),
      payment_request: {
        method_data: [
          {
            supported_methods: ["https://www.x402.org/"],
            data: {
              x402Version: 2,
              network: opts.network,
              asset: opts.tokenAddress,
              protocol: opts.protocol,
            },
          },
        ],
        details: {
          id,
          displayItems: [
            {
              label: opts.itemName,
              amount: { value: opts.amountUsd, currency: "USD" },
            },
          ],
          total: {
            label: "Total",
            amount: { value: opts.amountUsd, currency: "USD" },
          },
        },
      },
    },
  };
}

async function signEip712(eip712: {
  domain: Record<string, unknown>;
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
}) {
  const wallet = new Wallet(config.agentPrivateKey);
  // ethers signTypedData rejects EIP712Domain in types
  const types = { ...eip712.types };
  delete types.EIP712Domain;
  const signature = await wallet.signTypedData(
    eip712.domain as Parameters<Wallet["signTypedData"]>[0],
    types,
    eip712.message,
  );
  return signature;
}

async function pollUntilSettled(opts: {
  flowId: string;
  paymentRequestId: string;
  merchantName: string;
  maxWaitMs?: number;
}) {
  const maxWaitMs = opts.maxWaitMs ?? Number(process.env.HSP_POLL_MAX_MS ?? 120_000);
  const started = Date.now();
  let last: unknown = null;
  let attempt = 0;

  while (Date.now() - started < maxWaitMs) {
    attempt += 1;
    last = await callHspTool("query_payment", {
      flow_id: opts.flowId,
      payment_request_id: opts.paymentRequestId,
      expected_merchant_name: opts.merchantName,
    });
    const row = asRecord(last);
    const payment = asRecord(row.payment ?? row.data ?? row);
    const status = String(
      payment.status ?? row.status ?? pickString(row, "payment_status") ?? "",
    );

    if (
      status === "payment-safe" ||
      status === "payment-finalized" ||
      status === "payment-failed"
    ) {
      return { status, query: last, payment };
    }

    // First query often still payment-submitted — keep polling same ids
    const delay = attempt === 1 ? 5_000 : 15_000;
    await new Promise((r) => setTimeout(r, delay));
  }

  const row = asRecord(last);
  const payment = asRecord(row.payment ?? row.data ?? row);
  return {
    status: String(payment.status ?? row.status ?? "pending-confirmation"),
    query: last,
    payment,
  };
}

export async function executeAgenticPayment(input: AgenticPayInput): Promise<AgenticPayResult> {
  await assertHspTools();

  const chainConfig = await callHspTool("get_chain_config", {});
  const selected = selectNetworkAndToken(chainConfig);
  const protocol = input.protocol ?? selected.protocol;

  if (!/^0x[a-fA-F0-9]{40}$/.test(input.payTo)) {
    throw new Error("pay_to must be a 42-character 0x EVM address");
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(input.payer)) {
    throw new Error("payer must be a 42-character 0x EVM address");
  }
  if (input.payTo.toLowerCase() === input.payer.toLowerCase()) {
    throw new Error("payer must not equal pay_to");
  }

  const cart_mandate = buildCartMandate({
    amountUsd: Number(input.amountUsd).toFixed(2),
    itemId: input.itemId,
    itemName: input.itemName,
    itemDescription: input.itemDescription,
    network: selected.network,
    tokenAddress: selected.token.address,
    protocol,
  });

  const order = asRecord(
    await callHspTool("create_order", {
      merchant_name: input.merchantName,
      pay_to: input.payTo,
      cart_mandate,
    }),
  );

  const orderData = asRecord(order.data ?? order);
  const flowId = pickString(orderData, "flow_id", "flowId");
  const paymentRequestId = pickString(orderData, "payment_request_id", "paymentRequestId");
  const paymentUrl = pickString(orderData, "payment_url", "paymentUrl");

  if (!flowId || !paymentRequestId) {
    throw new Error(`create_order missing flow_id/payment_request_id: ${JSON.stringify(order)}`);
  }

  const prepare = asRecord(
    await callHspTool("prepare_payment", {
      flow_id: flowId,
      payer: input.payer,
      protocol,
    }),
  );

  const eip712 = prepare.eip712 as
    | {
        domain: Record<string, unknown>;
        types: Record<string, Array<{ name: string; type: string }>>;
        primaryType: string;
        message: Record<string, unknown>;
      }
    | undefined;

  if (!eip712?.domain || !eip712.types || !eip712.message) {
    throw new Error(`prepare_payment missing eip712: ${JSON.stringify(prepare)}`);
  }

  const tokenTotalRaw = pickString(prepare, "token_total_raw", "tokenTotalRaw");
  if (!tokenTotalRaw) throw new Error("prepare_payment missing token_total_raw");

  const signature = await signEip712(eip712);

  const finalize = asRecord(
    await callHspTool("finalize_payment", {
      signature,
      payment_payload: prepare.payment_payload,
      payment_mandate_contents: prepare.payment_mandate_contents,
      cart_hash: prepare.cart_hash,
    }),
  );

  const paymentMandateJson =
    finalize.payment_mandate_json ?? finalize.paymentMandateJson ?? finalize;

  const submit = asRecord(
    await callHspTool("submit_payment", {
      payment_mandate_json: paymentMandateJson,
    }),
  );

  const submitStatus = String(
    pickString(asRecord(submit.payment ?? submit.data ?? submit), "status") ??
      pickString(submit, "status") ??
      "payment-submitted",
  );

  const polled = await pollUntilSettled({
    flowId,
    paymentRequestId,
    merchantName: input.merchantName,
  });

  const attributionVerified = Boolean(
    asRecord(polled.query).attribution_verified ??
      asRecord(polled.payment).attribution_verified,
  );

  const txSignature =
    pickString(polled.payment, "tx_signature", "txSignature", "tx_hash", "txHash") ??
    pickString(asRecord(submit.payment ?? submit), "tx_signature", "tx_hash");

  return {
    flowId,
    paymentRequestId,
    paymentUrl,
    tokenTotalRaw,
    payTo: String(prepare.pay_to ?? input.payTo),
    payer: String(prepare.payer ?? input.payer),
    network: selected.network,
    submitStatus,
    finalStatus: polled.status,
    attributionVerified,
    txSignature,
    quoteExpiresAt: pickString(prepare, "quote_expires_at", "quoteExpiresAt"),
    raw: {
      chainConfig,
      order,
      prepare,
      finalize,
      submit,
      query: polled.query,
    },
  };
}
