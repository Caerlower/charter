import { randomBytes, randomUUID } from "node:crypto";
import { Wallet, TypedDataEncoder } from "ethers";
import { config } from "../config.js";
import { buildHmacHeaders } from "./hmac.js";
import { buildHs256Jwt } from "./jwt.js";
import { sha256CanonicalJson } from "./canonical.js";
import type { CartMandate } from "./cartMandate.js";

export type CreateOrderResult = {
  code: number;
  data: {
    flow_id: string;
    payment_request_id: string;
    payment_url: string;
    cart_mandate_id: string;
  };
  mock?: boolean;
};

export type PayMandateResult = {
  code: number;
  data: {
    status: string;
    payment_ref: string;
    tx_hash: string;
  };
  mock?: boolean;
  signature?: string;
  payment_mandate?: unknown;
};

const TRANSFER_TYPES: Record<string, Array<{ name: string; type: string }>> = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

function buildPaymentDetailsId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts = [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds()),
  ].join("");
  const rand6 = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
  return `${ts}${rand6}`;
}

export async function createOrder(cartMandate: CartMandate): Promise<CreateOrderResult> {
  const cartMandateId = String(cartMandate.contents.cart_mandate_id);
  const bodyObj = {
    cart_mandate: cartMandate,
    redirect_url: `${config.redirectBaseUrl}/?paid=1`,
  };

  if (config.hspMode === "mock") {
    const flowId = `flow_mock_${randomUUID().slice(0, 8)}`;
    return {
      code: 0,
      mock: true,
      data: {
        flow_id: flowId,
        payment_request_id: `preq_${randomUUID().slice(0, 10)}`,
        payment_url: `https://pay.hashkey.com/flow/${flowId}`,
        cart_mandate_id: cartMandateId,
      },
    };
  }

  const pathStr = "/api/v1/merchant/orders";
  const bodyStr = JSON.stringify(bodyObj);
  const headers = buildHmacHeaders({
    method: "POST",
    path: pathStr,
    body: bodyStr,
    appKey: config.appKey,
    appSecret: config.appSecret,
  });

  const res = await fetch(`${config.hspBaseUrl}${pathStr}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: bodyStr,
  });
  const json = (await res.json()) as CreateOrderResult & { data?: Partial<CreateOrderResult["data"]> };

  // Normalize common response shapes
  const data = json.data ?? (json as unknown as CreateOrderResult["data"]);
  return {
    code: json.code ?? (res.ok ? 0 : res.status),
    data: {
      flow_id: data.flow_id ?? "",
      payment_request_id: data.payment_request_id ?? "",
      payment_url: data.payment_url ?? "",
      cart_mandate_id: cartMandateId,
    },
  };
}

export async function payWithAgentWallet(opts: {
  amount: string;
  payTo: string;
  flowId: string;
  paymentRequestId: string;
  cartMandate: CartMandate;
}): Promise<PayMandateResult> {
  const wallet = new Wallet(config.agentPrivateKey);
  const valueWei = BigInt(Math.round(parseFloat(opts.amount) * 1e6));
  const nonce = `0x${randomBytes(32).toString("hex")}`;
  const now = Math.floor(Date.now() / 1000);
  const validAfter = BigInt(now);
  const validBefore = BigInt(now + 300);

  const domain = {
    name: "USD Coin",
    version: "2",
    chainId: config.chainId,
    verifyingContract: config.usdc,
  };

  const message = {
    from: wallet.address,
    to: opts.payTo,
    value: valueWei,
    validAfter,
    validBefore,
    nonce,
  };

  const signature = await wallet.signTypedData(domain, TRANSFER_TYPES, message);

  const payloadBase64 = Buffer.from(
    JSON.stringify({
      x402Version: 2,
      payload: {
        signature,
        authorization: {
          from: wallet.address,
          to: opts.payTo,
          value: valueWei.toString(),
          validAfter: validAfter.toString(),
          validBefore: validBefore.toString(),
          nonce,
        },
      },
      accepted: {
        scheme: "exact",
        network: `eip155:${config.chainId}`,
        asset: config.usdc,
        amount: valueWei.toString(),
        payTo: opts.payTo,
        maxTimeoutSeconds: 3600,
        extra: { protocol: "eip3009", name: "USD Coin", version: "2" },
      },
    }),
  ).toString("base64");

  const paymentMandateContents = {
    payment_mandate_id: opts.paymentRequestId,
    payment_details_id: buildPaymentDetailsId(),
    payment_details_total: {
      label: "Total",
      amount: { value: parseFloat(opts.amount).toFixed(2), currency: "USD" },
      pending: false,
    },
    payment_response: {
      request_id: opts.paymentRequestId,
      method_name: "https://www.x402.org/",
      details: { payment_payload: payloadBase64 },
      shipping_address: null,
      shipping_option: null,
      payer_name: null,
      payer_email: null,
      payer_phone: null,
    },
    merchant_agent: "HashkeyMerchant",
    timestamp: new Date().toISOString(),
  };

  const iat = Math.floor(Date.now() / 1000);
  const userAuthorization = buildHs256Jwt(
    {
      aud: "HashkeyMerchant",
      nonce: `0x${randomBytes(32).toString("hex")}`,
      iat,
      exp: iat + 120,
      iss: wallet.address,
      transaction_data: [
        sha256CanonicalJson(opts.cartMandate.contents),
        sha256CanonicalJson(paymentMandateContents),
      ],
    },
    Buffer.from(wallet.address),
  );

  const paymentMandate = {
    payment_mandate_contents: paymentMandateContents,
    user_authorization: userAuthorization,
  };

  if (config.hspMode === "mock") {
    const digest = TypedDataEncoder.hash(domain, TRANSFER_TYPES, message);
    return {
      code: 0,
      mock: true,
      signature,
      payment_mandate: paymentMandate,
      data: {
        status: "payment-successful",
        payment_ref: `pref_mock_${randomUUID().slice(0, 10)}`,
        tx_hash: `0x${digest.slice(2).padEnd(64, "0").slice(0, 64)}`,
      },
    };
  }

  const pathStr = "/api/v1/payment/pay-mandate";
  const body = JSON.stringify({ flow_id: opts.flowId, payment_mandate: paymentMandate });
  const headers = buildHmacHeaders({
    method: "POST",
    path: pathStr,
    body,
    appKey: config.appKey,
    appSecret: config.appSecret,
  });
  const res = await fetch(`${config.hspBaseUrl}${pathStr}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
  let json: PayMandateResult;
  try {
    json = (await res.json()) as PayMandateResult;
  } catch {
    throw new Error(`HSP pay-mandate returned non-JSON (${res.status})`);
  }
  if (!res.ok && (json.code === undefined || json.code === 0)) {
    json = { ...json, code: res.status };
  }
  return {
    ...json,
    signature,
    payment_mandate: paymentMandate,
  };
}

export async function queryPayment(cartMandateId: string) {
  if (config.hspMode === "mock") {
    return { code: 0, mock: true, data: { status: "payment-successful", cart_mandate_id: cartMandateId } };
  }
  const pathStr = "/api/v1/merchant/payments";
  const query = `cart_mandate_id=${encodeURIComponent(cartMandateId)}`;
  const headers = buildHmacHeaders({
    method: "GET",
    path: pathStr,
    query,
    appKey: config.appKey,
    appSecret: config.appSecret,
  });
  const res = await fetch(`${config.hspBaseUrl}${pathStr}?${query}`, {
    method: "GET",
    headers: { "Content-Type": "application/json", ...headers },
  });
  return res.json();
}
