import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { signMerchantJwt } from "./jwt.js";

export type PaymentConditions = {
  serviceId: string;
  serviceName: string;
  description: string;
  amount: string; // human USDC, e.g. "3.00"
  currency: "USD";
  token: string;
  chainId: number;
  payTo: string;
  merchantId: string;
  expiresAt: string; // ISO
};

export type CartMandate = {
  contents: Record<string, unknown>;
  merchant_authorization: string;
};

export function buildCartMandate(conditions: PaymentConditions): CartMandate {
  const cartMandateId = `cart_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const now = new Date();
  const expiry = conditions.expiresAt || new Date(now.getTime() + 30 * 60_000).toISOString();

  const contents = {
    cart_mandate_id: cartMandateId,
    merchant_name: config.merchantName,
    merchant_id: conditions.merchantId,
    cart_expiry: expiry,
    payment_network: `eip155:${conditions.chainId}`,
    payment_token: conditions.token,
    pay_to: conditions.payTo,
    items: [
      {
        id: conditions.serviceId,
        name: conditions.serviceName,
        description: conditions.description,
        quantity: 1,
        unit_price: { value: conditions.amount, currency: conditions.currency },
      },
    ],
    total: {
      label: "Total",
      amount: { value: conditions.amount, currency: conditions.currency },
    },
    created_at: now.toISOString(),
  };

  const merchant_authorization = signMerchantJwt(contents);
  return { contents, merchant_authorization };
}
