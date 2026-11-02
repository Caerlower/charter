const BASE = `${(import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? ""}/api`;

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const { headers: initHeaders, ...rest } = init ?? {};
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(initHeaders ?? {}),
    },
  });
  const json = await res.json();
  if (!res.ok && !(json?.blocked || json?.ok === false)) {
    throw new Error(json?.error ?? `Request failed: ${res.status}`);
  }
  return json as T;
}

export type Charter = {
  id: string;
  title: string;
  status: string;
  budgetUsdc: string;
  spentUsdc: string;
  maxPerPaymentUsdc: string;
  constraints: {
    city: string;
    checkIn: string;
    checkOut: string;
    nights: number;
    maxPerNightUsdc?: number;
    categories: string[];
    notes?: string;
  };
  allowMerchants: string[];
  notify: { email?: string; telegram?: string; whatsapp?: string };
  intentMandate: null | {
    mandateId: string;
    signature: string;
    digest: string;
    approvedAt: string;
    signer?: string;
  };
  expiresAt: string;
};

export type Offer = {
  offerId: string;
  category: string;
  vendorAgent: string;
  merchantId: string;
  merchantName: string;
  title: string;
  description: string;
  amount: string;
  status: string;
  meta: Record<string, string | number>;
};

export type NotificationItem = {
  id: string;
  channel: string;
  to: string;
  subject: string;
  body: string;
  at: string;
  charterId: string;
};

export type Settlement = {
  id: string;
  offerId: string;
  amount: string;
  status: string;
  reason?: string;
  paymentRef?: string;
  at: string;
};

export type RailsConfig = {
  product: string;
  hspMode: "mock" | "live" | "mcp" | string;
  chainId: number;
  network?: string;
  hspBaseUrl?: string;
  merchantName?: string;
  liveReady?: boolean;
  vaultOnChain?: boolean;
  payTo?: string;
  agent?: string;
};

export type CreateCharterInput = {
  title?: string;
  budgetUsdc: string;
  maxPerPaymentUsdc?: string;
  city: string;
  checkIn: string;
  checkOut: string;
  maxPerNightUsdc?: number;
  categories?: string[];
  notes?: string;
  allowMerchants?: string[];
  notify?: { email?: string; telegram?: string };
};

export const MERCHANT_OPTIONS = [
  { id: "ShibuyaNest", label: "Shibuya Nest Hotels" },
  { id: "CapsulePrime", label: "Capsule Prime" },
  { id: "SkyBridge", label: "SkyBridge Air" },
  { id: "PacificHop", label: "Pacific Hop (deny demos)" },
] as const;

export const api = {
  health: () => req<Record<string, unknown>>("/health"),
  sample: (reset = false) =>
    req<{
      ok: boolean;
      charter: Charter;
      next: string[];
    }>("/demo/sample", { method: "POST", body: JSON.stringify({ reset }) }),
  dashboard: () =>
    req<{
      charters: Charter[];
      settlements: Settlement[];
      notifications: NotificationItem[];
      offers: Offer[];
      wallet: {
        balanceUsdc: string;
        address: string;
        explorerBase: string;
        vaultMode: string;
      };
      timeline: Array<{ id: string; at: string; type: string; title: string }>;
      config: RailsConfig;
    }>("/dashboard"),
  charter: (id: string) =>
    req<{
      charter: Charter;
      keys: Array<{ id: string; name: string; tokenPreview: string; revoked: boolean }>;
      offers: Offer[];
      settlements: Settlement[];
      notifications: NotificationItem[];
    }>(`/charters/${id}`),
  createCharter: (input: CreateCharterInput) =>
    req<{ charter: Charter }>("/charters", {
      method: "POST",
      body: JSON.stringify({
        title: input.title,
        budgetUsdc: input.budgetUsdc,
        maxPerPaymentUsdc: input.maxPerPaymentUsdc,
        city: input.city,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        maxPerNightUsdc: input.maxPerNightUsdc,
        categories: input.categories,
        notes: input.notes,
        allowMerchants: input.allowMerchants,
        notify: input.notify,
      }),
    }),
  approve: (id: string) =>
    req<{ charter: Charter }>(`/charters/${id}/approve`, { method: "POST", body: "{}" }),
  issueKey: (id: string, name: string) =>
    req<{ key: { token: string; name: string; id: string }; usage: unknown }>(
      `/charters/${id}/keys`,
      { method: "POST", body: JSON.stringify({ name }) },
    ),
  search: (id: string, category: "hotel" | "flight") =>
    req<{ offers: Offer[] }>(`/charters/${id}/search`, {
      method: "POST",
      body: JSON.stringify({ category }),
    }),
  settle: (id: string, offerId: string) =>
    req<{
      ok: boolean;
      blocked?: boolean;
      reason?: string;
      offer: Offer;
      pay?: { data?: { payment_ref?: string } };
      charter: Charter;
    }>(`/charters/${id}/settle`, {
      method: "POST",
      body: JSON.stringify({ offerId }),
    }),
};
