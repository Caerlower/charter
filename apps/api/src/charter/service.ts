import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Wallet } from "ethers";
import { config } from "../config.js";
import { executeAgenticPayment } from "../hsp/agenticPayment.js";
import { buildCartMandate } from "../hsp/cartMandate.js";
import { createOrder, payWithAgentWallet } from "../hsp/client.js";
import {
  authorizeOnChain,
  checkAuthorization,
  creditAgent,
  getAgentView,
  recordSettlementOnChain,
  setMerchantOnChain,
  setPolicyOnChain,
  usdcToUnits,
} from "../lib/vault.js";
import { pushEvent } from "../store/events.js";
import {
  addNotification,
  addSettlement,
  db,
  getCharter,
  getOffer,
  listCharters,
  listKeys,
  listNotifications,
  listOffers,
  listSettlements,
  saveCharter,
  saveKey,
  saveOffer,
} from "./store.js";
import type { Charter, CharterConstraints, NotifyChannels, VendorOffer } from "./types.js";
import { searchVendorOffers } from "./vendors.js";

function digest(obj: unknown) {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

const INTENT_TYPES: Record<string, Array<{ name: string; type: string }>> = {
  IntentMandate: [
    { name: "mandateId", type: "string" },
    { name: "charterId", type: "string" },
    { name: "budgetUsdc", type: "string" },
    { name: "maxPerPaymentUsdc", type: "string" },
    { name: "expiresAt", type: "string" },
    { name: "digest", type: "bytes32" },
  ],
};

let vaultReady = false;

export async function ensureVaultReady() {
  if (vaultReady) return;
  try {
    const view = await getAgentView();
    if (!view.policy.exists || Number(view.balance) === 0) {
      await creditAgent(5000);
      await setPolicyOnChain({
        maxPerPayment: 2000,
        dailyCap: 5000,
        totalCap: 20000,
        expiresAt: Math.floor(Date.now() / 1000) + 30 * 86400,
        frozen: false,
      });
      await setMerchantOnChain(config.payToAddress, true);
    }
    vaultReady = true;
  } catch (err) {
    console.warn("[vault] ensureVaultReady", err);
  }
}

function nightsBetween(checkIn: string, checkOut: string) {
  const a = new Date(checkIn).getTime();
  const b = new Date(checkOut).getTime();
  return Math.max(1, Math.round((b - a) / 86400000));
}

export function createCharter(input: {
  title?: string;
  budgetUsdc: string;
  maxPerPaymentUsdc?: string;
  constraints: Partial<CharterConstraints> & { city: string; checkIn: string; checkOut: string };
  allowMerchants?: string[];
  notify?: NotifyChannels;
  expiresInHours?: number;
}) {
  const nights = input.constraints.nights ?? nightsBetween(input.constraints.checkIn, input.constraints.checkOut);
  const id = `chr_${randomUUID().slice(0, 8)}`;
  const expiresAt = new Date(Date.now() + (input.expiresInHours ?? 72) * 3600_000).toISOString();

  const charter: Charter = {
    id,
    title: input.title ?? `${input.constraints.city} trip charter`,
    status: "draft",
    budgetUsdc: Number(input.budgetUsdc).toFixed(2),
    spentUsdc: "0.00",
    maxPerPaymentUsdc: Number(input.maxPerPaymentUsdc ?? input.budgetUsdc).toFixed(2),
    constraints: {
      city: input.constraints.city,
      checkIn: input.constraints.checkIn,
      checkOut: input.constraints.checkOut,
      nights,
      maxPerNightUsdc: input.constraints.maxPerNightUsdc,
      categories: input.constraints.categories ?? ["hotel", "flight"],
      notes: input.constraints.notes,
    },
    allowMerchants:
      input.allowMerchants ?? ["ShibuyaNest", "CapsulePrime", "SkyBridge", "PacificHop"],
    notify: input.notify ?? { email: "you@example.com", telegram: "@you" },
    intentMandate: null,
    createdAt: new Date().toISOString(),
    expiresAt,
  };

  saveCharter(charter);
  void ensureVaultReady();
  pushEvent({ type: "policy", title: `Charter drafted: ${charter.title}`, detail: charter });
  return charter;
}

export async function approveCharter(charterId: string) {
  const charter = getCharter(charterId);
  if (charter.status === "revoked") throw new Error("Charter revoked");
  if (charter.status === "active" && charter.intentMandate) return charter;
  if (new Date(charter.expiresAt).getTime() < Date.now()) {
    charter.status = "expired";
    saveCharter(charter);
    throw new Error("Charter expired");
  }

  await ensureVaultReady();

  const mandateId = `intent_${randomUUID().slice(0, 10)}`;
  const body = {
    mandateId,
    charterId: charter.id,
    budgetUsdc: charter.budgetUsdc,
    maxPerPaymentUsdc: charter.maxPerPaymentUsdc,
    constraints: charter.constraints,
    allowMerchants: charter.allowMerchants,
    expiresAt: charter.expiresAt,
  };
  const dig = digest(body);
  const digBytes32 = `0x${dig}` as `0x${string}`;
  const human = new Wallet(config.ownerPrivateKey);
  const verifyingContract =
    config.vaultAddress || "0x0000000000000000000000000000000000000001";
  const signature = await human.signTypedData(
    {
      name: "Charter",
      version: "1",
      chainId: config.chainId,
      verifyingContract,
    },
    INTENT_TYPES,
    {
      mandateId,
      charterId: charter.id,
      budgetUsdc: charter.budgetUsdc,
      maxPerPaymentUsdc: charter.maxPerPaymentUsdc,
      expiresAt: charter.expiresAt,
      digest: digBytes32,
    },
  );

  charter.intentMandate = {
    ...body,
    version: "intent.v1",
    approvedAt: new Date().toISOString(),
    signature,
    digest: dig,
    signer: human.address,
  };
  charter.status = "active";
  saveCharter(charter);

  pushEvent({
    type: "mandate",
    title: "Human signed Intent Mandate — agent may work Human Not Present",
    detail: charter.intentMandate,
  });

  notify(charter, {
    subject: `Charter approved: ${charter.title}`,
    body: `Your Intent Mandate is active.\nBudget: ${charter.budgetUsdc} USDC\nCity: ${charter.constraints.city}\nDates: ${charter.constraints.checkIn} → ${charter.constraints.checkOut}\nSigner: ${human.address}\nAgents with an API key can now search & settle under this charter via HSP.`,
  });

  return charter;
}

export function proposeIntent(input: {
  title?: string;
  city: string;
  checkIn: string;
  checkOut: string;
  budgetUsdc: string;
  maxPerPaymentUsdc?: string;
  maxPerNightUsdc?: number;
  categories?: Array<"hotel" | "flight">;
  allowMerchants?: string[];
  notes?: string;
  notify?: { email?: string; telegram?: string };
  agentName?: string;
}) {
  const charter = createCharter({
    title: input.title ?? `${input.city} trip · agent draft`,
    budgetUsdc: input.budgetUsdc,
    maxPerPaymentUsdc: input.maxPerPaymentUsdc ?? input.budgetUsdc,
    constraints: {
      city: input.city,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      maxPerNightUsdc: input.maxPerNightUsdc,
      categories: input.categories ?? ["hotel", "flight"],
      notes:
        input.notes ??
        `Drafted by agent ${input.agentName ?? "Claude"}. Human must approve Intent Mandate before settle.`,
    },
    allowMerchants: input.allowMerchants,
    notify: input.notify,
  });

  return {
    charter,
    next: [
      "Human opens the desk and reviews this draft",
      "Human approves Intent Mandate (EIP-712)",
      "Human issues an agent API key (chlive_…)",
      "Agent calls POST /api/v1/search then POST /api/v1/settle",
    ],
    approve: `POST /api/charters/${charter.id}/approve`,
    issueKey: `POST /api/charters/${charter.id}/keys { "name": "Claude" }`,
  };
}

export function issueAgentKey(charterId: string, name: string) {
  const charter = getCharter(charterId);
  if (charter.status !== "active") throw new Error("Approve the charter before issuing agent keys");
  const token = `chlive_${randomBytes(18).toString("hex")}`;
  const key = saveKey({
    id: `key_${randomUUID().slice(0, 8)}`,
    charterId,
    name: name || "Grok",
    token,
    createdAt: new Date().toISOString(),
    revoked: false,
  });
  pushEvent({ type: "policy", title: `Agent key issued for ${key.name}`, detail: { charterId, name: key.name } });
  return key;
}

export function revokeAgentKey(keyId: string) {
  const key = [...db.keysById.values()].find((k) => k.id === keyId);
  if (!key) throw new Error("Unknown key");
  key.revoked = true;
  saveKey(key);
  return key;
}

export function searchOffers(charterId: string, category: "hotel" | "flight") {
  const charter = requireActiveCharter(charterId);
  if (!charter.constraints.categories.includes(category)) {
    throw new Error(`Category ${category} not allowed by charter`);
  }
  const offers = searchVendorOffers(charter, category);
  pushEvent({
    type: "conditions",
    title: `${category} receiving agents returned offers`,
    detail: offers.map((o) => ({ offerId: o.offerId, title: o.title, amount: o.amount, merchant: o.merchantId })),
  });
  return offers;
}

function requireActiveCharter(charterId: string) {
  const charter = getCharter(charterId);
  if (!charter.intentMandate) throw new Error("Charter not approved");
  if (charter.status !== "active") throw new Error(`Charter is ${charter.status}`);
  if (new Date(charter.expiresAt).getTime() < Date.now()) {
    charter.status = "expired";
    saveCharter(charter);
    throw new Error("Charter expired");
  }
  return charter;
}

function evaluateOffer(charter: Charter, offer: VendorOffer): { ok: boolean; reason?: string } {
  if (offer.charterId !== charter.id) return { ok: false, reason: "offer_wrong_charter" };
  if (offer.status !== "open") return { ok: false, reason: "offer_not_open" };
  if (!charter.constraints.categories.includes(offer.category)) return { ok: false, reason: "category_not_allowed" };
  if (!charter.allowMerchants.includes(offer.merchantId)) return { ok: false, reason: "merchant_not_allowed" };

  const amount = Number(offer.amount);
  const remaining = Number(charter.budgetUsdc) - Number(charter.spentUsdc);
  if (amount > Number(charter.maxPerPaymentUsdc)) return { ok: false, reason: "exceeds_max_per_payment" };
  if (amount > remaining) return { ok: false, reason: "exceeds_charter_budget" };

  if (offer.category === "hotel" && charter.constraints.maxPerNightUsdc) {
    const nights = Number(offer.meta.nights ?? charter.constraints.nights);
    const perNight = amount / nights;
    if (perNight > charter.constraints.maxPerNightUsdc + 1e-6) {
      return { ok: false, reason: "exceeds_max_per_night" };
    }
  }
  return { ok: true };
}

export async function settleOffer(charterId: string, offerId: string, agentName = "agent") {
  const charter = requireActiveCharter(charterId);
  const offer = getOffer(offerId);
  const check = evaluateOffer(charter, offer);

  pushEvent({
    type: "conditions",
    title: `${offer.vendorAgent} payment conditions for ${offer.title}`,
    detail: { offer, intentMandateId: charter.intentMandate?.mandateId },
  });

  if (!check.ok) {
    offer.status = "blocked";
    saveOffer(offer);
    addSettlement({
      id: `set_${randomUUID().slice(0, 8)}`,
      charterId,
      offerId,
      amount: offer.amount,
      status: "blocked",
      reason: check.reason,
      at: new Date().toISOString(),
    });
    pushEvent({
      type: "blocked",
      title: `Blocked by Intent Mandate: ${check.reason}`,
      detail: { reason: check.reason, offerId, agentName },
    });
    notify(charter, {
      subject: `Blocked under charter ${charter.id}`,
      body: `${agentName} tried to settle ${offer.title} for ${offer.amount} USDC.\nDenied: ${check.reason}\nRemaining budget: ${(Number(charter.budgetUsdc) - Number(charter.spentUsdc)).toFixed(2)} USDC`,
    });
    return { ok: false as const, blocked: true, reason: check.reason, offer, charter };
  }

  const amountUnits = usdcToUnits(offer.amount);
  const vaultCheck = await checkAuthorization(offer.payTo, amountUnits);
  if (!vaultCheck.ok) {
    offer.status = "blocked";
    saveOffer(offer);
    addSettlement({
      id: `set_${randomUUID().slice(0, 8)}`,
      charterId,
      offerId,
      amount: offer.amount,
      status: "blocked",
      reason: vaultCheck.reason,
      at: new Date().toISOString(),
    });
    return { ok: false as const, blocked: true, reason: vaultCheck.reason, offer, charter };
  }

  const conditions = {
    serviceId: offer.offerId,
    serviceName: offer.title,
    description: `${offer.description} · Intent ${charter.intentMandate!.mandateId}`,
    amount: offer.amount,
    currency: "USD" as const,
    token: offer.token,
    chainId: offer.chainId,
    payTo: offer.payTo,
    merchantId: offer.merchantId,
    expiresAt: offer.expiresAt,
  };

  const cartMandate = buildCartMandate(conditions);
  const cartMandateId = String(cartMandate.contents.cart_mandate_id);

  pushEvent({
    type: "mandate",
    title: "Payment Agent built Payment/Cart Mandate bound to Intent",
    detail: {
      intentMandateId: charter.intentMandate!.mandateId,
      cart_mandate_id: cartMandateId,
      offerId,
      agentName,
      hspMode: config.hspMode,
    },
  });

  try {
    await authorizeOnChain(offer.payTo, amountUnits, cartMandateId);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "authorize_failed";
    offer.status = "blocked";
    saveOffer(offer);
    return { ok: false as const, blocked: true, reason, offer, charter, cartMandate };
  }

  let paymentRef = cartMandateId;
  let txHash: string | undefined;
  let paymentStatus: unknown = null;
  let order: unknown = null;
  let pay: unknown = null;
  let agentic: Awaited<ReturnType<typeof executeAgenticPayment>> | null = null;

  if (config.hspMode === "mcp") {
    try {
      offer.payTo = config.payToAddress;
      offer.token = config.usdc;
      offer.chainId = config.chainId;
      saveOffer(offer);
      agentic = await executeAgenticPayment({
        merchantName: config.merchantName,
        payTo: config.payToAddress,
        payer: config.agentAddress,
        amountUsd: offer.amount,
        itemId: offer.offerId,
        itemName: offer.title,
        itemDescription: `${offer.description} · Intent ${charter.intentMandate!.mandateId}`,
      });
      paymentRef = agentic.paymentRequestId || agentic.flowId;
      txHash = agentic.txSignature;
      paymentStatus = {
        submitStatus: agentic.submitStatus,
        finalStatus: agentic.finalStatus,
        attributionVerified: agentic.attributionVerified,
        network: agentic.network,
        tokenTotalRaw: agentic.tokenTotalRaw,
        flowId: agentic.flowId,
      };
      if (agentic.finalStatus === "payment-failed") {
        offer.status = "blocked";
        saveOffer(offer);
        addSettlement({
          id: `set_${randomUUID().slice(0, 8)}`,
          charterId,
          offerId,
          paymentRef,
          txHash,
          amount: offer.amount,
          status: "failed",
          reason: `hsp_failed:${agentic.finalStatus}`,
          at: new Date().toISOString(),
          mandatePreview: { agentic: { flowId: agentic.flowId, finalStatus: agentic.finalStatus } },
        });
        return {
          ok: false as const,
          blocked: false,
          reason: `hsp_failed:${agentic.finalStatus}`,
          offer,
          charter,
          agentic,
        };
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : "hsp_mcp_failed";
      addSettlement({
        id: `set_${randomUUID().slice(0, 8)}`,
        charterId,
        offerId,
        amount: offer.amount,
        status: "failed",
        reason,
        at: new Date().toISOString(),
      });
      pushEvent({
        type: "blocked",
        title: "HSP MCP settle failed",
        detail: { reason, offerId, agentName },
      });
      return { ok: false as const, blocked: false, reason, offer, charter };
    }
  } else {
    order = await createOrder(cartMandate);
    const mockPay = await payWithAgentWallet({
      amount: offer.amount,
      payTo: offer.payTo,
      flowId: (order as { data: { flow_id: string } }).data.flow_id,
      paymentRequestId: (order as { data: { payment_request_id: string } }).data.payment_request_id,
      cartMandate,
    });
    pay = mockPay;
    if (mockPay.code !== 0 && mockPay.code !== undefined) {
      return {
        ok: false as const,
        blocked: false,
        reason: `hsp_failed:${mockPay.code}`,
        offer,
        charter,
        order,
        pay: mockPay,
      };
    }
    paymentRef = mockPay.data?.payment_ref ?? cartMandateId;
    txHash = mockPay.data?.tx_hash;
  }

  const settlement = await recordSettlementOnChain({
    merchant: offer.payTo,
    amountUnits,
    mandateId: cartMandateId,
    paymentRef,
    settleTxHash: txHash ?? `pending_${cartMandateId}`,
  });

  offer.status = "settled";
  charter.spentUsdc = (Number(charter.spentUsdc) + Number(offer.amount)).toFixed(2);
  if (Number(charter.spentUsdc) >= Number(charter.budgetUsdc) - 1e-9) {
    charter.status = "exhausted";
  }
  saveCharter(charter);

  const record = addSettlement({
    id: `set_${randomUUID().slice(0, 8)}`,
    charterId,
    offerId,
    paymentRef,
    txHash,
    amount: offer.amount,
    status: "settled",
    at: new Date().toISOString(),
    mandatePreview: {
      intentMandateId: charter.intentMandate!.mandateId,
      cartMandateId,
      paymentStatus,
      agentic: agentic
        ? {
            flowId: agentic.flowId,
            finalStatus: agentic.finalStatus,
            attributionVerified: agentic.attributionVerified,
          }
        : undefined,
    },
  });

  pushEvent({
    type: "settlement",
    title: `HSP settled ${offer.amount} USDC · ${offer.title}`,
    detail: record,
  });

  const remaining = (Number(charter.budgetUsdc) - Number(charter.spentUsdc)).toFixed(2);
  notify(charter, {
    subject: `Settled: ${offer.title}`,
    body: [
      `${agentName} settled under your charter while you were away.`,
      ``,
      `Item: ${offer.title}`,
      `Vendor: ${offer.merchantName} (${offer.vendorAgent})`,
      `Amount: ${offer.amount} USDC`,
      `HSP payment ref: ${paymentRef}`,
      txHash ? `Tx: ${txHash}` : `Tx: pending`,
      `Intent mandate: ${charter.intentMandate!.mandateId}`,
      `Remaining budget: ${remaining} USDC`,
      ``,
      `Open Charter to review receipts.`,
    ].join("\n"),
  });

  return {
    ok: true as const,
    blocked: false,
    offer,
    charter,
    cartMandate,
    order,
    pay,
    agentic,
    settlement,
    record,
  };
}

function notify(charter: Charter, msg: { subject: string; body: string }) {
  const channels: Array<{ channel: "email" | "telegram" | "whatsapp" | "inbox"; to: string }> = [
    { channel: "inbox", to: "dashboard" },
  ];
  if (charter.notify.email) channels.push({ channel: "email", to: charter.notify.email });
  if (charter.notify.telegram) channels.push({ channel: "telegram", to: charter.notify.telegram });
  if (charter.notify.whatsapp) channels.push({ channel: "whatsapp", to: charter.notify.whatsapp });

  for (const c of channels) {
    addNotification({
      id: `ntf_${randomUUID().slice(0, 8)}`,
      charterId: charter.id,
      channel: c.channel,
      to: c.to,
      subject: msg.subject,
      body: msg.body,
      at: new Date().toISOString(),
    });
  }
  pushEvent({ type: "chat", title: `Notified: ${msg.subject}`, detail: { channels: channels.map((c) => c.channel) } });
}

/** Seed a Tokyo sample as draft only (still requires approve + key). */
export async function seedTokyoDraft(opts?: { reset?: boolean }) {
  if (opts?.reset) db.reset();
  vaultReady = false;
  await ensureVaultReady();

  const checkIn = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const checkOut = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);

  const charter = createCharter({
    title: "Tokyo weekend",
    budgetUsdc: "900",
    maxPerPaymentUsdc: "500",
    constraints: {
      city: "Tokyo",
      checkIn,
      checkOut,
      maxPerNightUsdc: 200,
      categories: ["hotel", "flight"],
      notes: "Near Shibuya preferred. Book while I'm offline.",
    },
    allowMerchants: ["ShibuyaNest", "CapsulePrime", "SkyBridge", "PacificHop"],
    notify: { email: "founder@example.com", telegram: "@founder" },
  });

  return {
    charter: getCharter(charter.id),
    next: ["Review the draft", "Approve Intent Mandate", "Issue a Grok API key", "Search & settle"],
  };
}

/** @deprecated Prefer seedTokyoDraft. */
export async function bootstrapDemo() {
  return seedTokyoDraft({ reset: true });
}

export function dashboardState() {
  return {
    charters: listCharters(),
    settlements: listSettlements(),
    notifications: listNotifications(),
    offers: [...db.offers.values()],
  };
}

export function charterDetail(charterId: string) {
  return {
    charter: getCharter(charterId),
    keys: listKeys(charterId).map((k) => ({
      ...k,
      tokenPreview: `${k.token.slice(0, 12)}…`,
      token: undefined as string | undefined,
    })),
    offers: listOffers(charterId),
    settlements: listSettlements(charterId),
    notifications: listNotifications(charterId),
  };
}

export type { VendorOffer };
