export type NotifyChannels = {
  email?: string;
  telegram?: string; // chat id or @handle
  whatsapp?: string;
};

export type CharterConstraints = {
  city: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string;
  nights: number;
  maxPerNightUsdc?: number;
  categories: Array<"hotel" | "flight">;
  notes?: string;
};

export type IntentMandate = {
  mandateId: string;
  version: "intent.v1";
  charterId: string;
  budgetUsdc: string;
  maxPerPaymentUsdc: string;
  constraints: CharterConstraints;
  allowMerchants: string[];
  expiresAt: string;
  approvedAt: string;
  /** EIP-712 Intent Mandate signature from the human operator wallet */
  signature: string;
  digest: string;
  signer?: string;
};

export type Charter = {
  id: string;
  title: string;
  status: "draft" | "active" | "exhausted" | "expired" | "revoked";
  budgetUsdc: string;
  spentUsdc: string;
  maxPerPaymentUsdc: string;
  constraints: CharterConstraints;
  allowMerchants: string[];
  notify: NotifyChannels;
  intentMandate: IntentMandate | null;
  createdAt: string;
  expiresAt: string;
};

export type AgentKey = {
  id: string;
  charterId: string;
  name: string; // e.g. Grok
  token: string; // chlive_...
  createdAt: string;
  lastUsedAt?: string;
  revoked: boolean;
};

export type VendorOffer = {
  offerId: string;
  charterId: string;
  category: "hotel" | "flight";
  vendorAgent: string;
  merchantId: string;
  merchantName: string;
  title: string;
  description: string;
  amount: string;
  currency: "USD";
  payTo: string;
  token: string;
  chainId: number;
  meta: Record<string, string | number>;
  expiresAt: string;
  status: "open" | "settled" | "blocked" | "expired";
};

export type NotificationItem = {
  id: string;
  charterId: string;
  channel: "email" | "telegram" | "whatsapp" | "inbox";
  to: string;
  subject: string;
  body: string;
  at: string;
};

export type SettlementRecord = {
  id: string;
  charterId: string;
  offerId: string;
  paymentRef?: string;
  txHash?: string;
  amount: string;
  status: "settled" | "blocked" | "failed";
  reason?: string;
  at: string;
  mandatePreview?: unknown;
};
