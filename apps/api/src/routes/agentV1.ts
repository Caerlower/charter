import { Router, type Request, type Response, type NextFunction } from "express";
import { config } from "../config.js";
import {
  charterDetail,
  proposeIntent,
  searchOffers,
  settleOffer,
} from "../charter/service.js";
import { findKey, getCharter } from "../charter/store.js";
import { getPaymentRails } from "../hsp/rails.js";

export const agentV1: Router = Router();

function agentAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") || "";
  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : header.trim();
  if (!token) {
    res.status(401).json({ error: "Missing Bearer agent API key (chlive_…)" });
    return;
  }
  const key = findKey(token);
  if (!key || key.revoked) {
    res.status(401).json({ error: "Invalid or revoked agent key" });
    return;
  }
  key.lastUsedAt = new Date().toISOString();
  (req as Request & { agentKey: typeof key }).agentKey = key;
  next();
}

type Authed = Request & { agentKey: NonNullable<ReturnType<typeof findKey>> };

agentV1.get("/connect", (_req, res) => {
  res.json({
    product: "Charter",
    tagline: "Human Not Present payments for AI agents on HashKey HSP",
    walletModel:
      "Platform agent wallet. Claude never holds keys. Human funds Charter payer address and approves Intent Mandate once.",
    merchantName: config.merchantName,
    baseUrl: `http://localhost:${config.port}/api/v1`,
    authHeader: "Authorization: Bearer chlive_…",
    flow: [
      "1. POST /api/v1/intent with trip budget/dates (creates draft policy)",
      "2. Human approves Intent Mandate on the desk (or POST /api/charters/:id/approve)",
      "3. Human issues agent key POST /api/charters/:id/keys",
      "4. Agent: GET /api/v1/me",
      "5. Agent: POST /api/v1/search { category: hotel|flight }",
      "6. Agent: POST /api/v1/settle { offerId } → Charter signs HSP via platform wallet",
    ],
    exampleIntent: {
      city: "Mumbai",
      checkIn: "2026-11-03",
      checkOut: "2026-11-10",
      budgetUsdc: "400",
      maxPerPaymentUsdc: "250",
      notes: "Book hotel and flight under $400",
      agentName: "Claude",
    },
    rails: "GET /api/v1/rails",
  });
});

agentV1.get("/rails", async (_req, res) => {
  try {
    res.json(await getPaymentRails());
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "rails failed" });
  }
});

agentV1.post("/intent", (req, res) => {
  try {
    const city = String(req.body.city ?? "").trim();
    const checkIn = String(req.body.checkIn ?? "").trim();
    const checkOut = String(req.body.checkOut ?? "").trim();
    const budgetUsdc = String(req.body.budgetUsdc ?? req.body.budget ?? "").trim();
    if (!city || !checkIn || !checkOut || !budgetUsdc) {
      res.status(400).json({
        error: "city, checkIn, checkOut, budgetUsdc required",
        example: {
          city: "Mumbai",
          checkIn: "2026-11-03",
          checkOut: "2026-11-10",
          budgetUsdc: "400",
          maxPerPaymentUsdc: "250",
          notes: "Hotel + flight",
          agentName: "Claude",
        },
      });
      return;
    }

    const proposed = proposeIntent({
      title: req.body.title ? String(req.body.title) : undefined,
      city,
      checkIn,
      checkOut,
      budgetUsdc,
      maxPerPaymentUsdc: req.body.maxPerPaymentUsdc
        ? String(req.body.maxPerPaymentUsdc)
        : undefined,
      maxPerNightUsdc: req.body.maxPerNightUsdc
        ? Number(req.body.maxPerNightUsdc)
        : undefined,
      categories: req.body.categories,
      allowMerchants: req.body.allowMerchants,
      notes: req.body.notes ? String(req.body.notes) : undefined,
      notify: req.body.notify,
      agentName: req.body.agentName ? String(req.body.agentName) : "Claude",
    });

    res.status(201).json({
      ok: true,
      status: "draft",
      message:
        "Policy drafted. Human must approve Intent Mandate, then issue your API key before search/settle.",
      ...proposed,
      payerWallet: config.agentAddress,
      hspMode: config.hspMode,
    });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "intent failed" });
  }
});

agentV1.get("/me", agentAuth, (req, res) => {
  const key = (req as Authed).agentKey;
  const charter = getCharter(key.charterId);
  res.json({
    agent: { name: key.name, keyId: key.id },
    walletModel: "platform_agent_wallet",
    payer: config.agentAddress,
    hspMode: config.hspMode,
    merchantName: config.merchantName,
    charter: {
      id: charter.id,
      title: charter.title,
      status: charter.status,
      budgetUsdc: charter.budgetUsdc,
      spentUsdc: charter.spentUsdc,
      remainingUsdc: (Number(charter.budgetUsdc) - Number(charter.spentUsdc)).toFixed(2),
      maxPerPaymentUsdc: charter.maxPerPaymentUsdc,
      constraints: charter.constraints,
      allowMerchants: charter.allowMerchants,
      intentMandateId: charter.intentMandate?.mandateId ?? null,
      intentSigner: charter.intentMandate?.signer ?? null,
      expiresAt: charter.expiresAt,
    },
  });
});

agentV1.post("/search", agentAuth, (req, res) => {
  try {
    const key = (req as Authed).agentKey;
    const category = (req.body.category === "flight" ? "flight" : "hotel") as "hotel" | "flight";
    const offers = searchOffers(key.charterId, category);
    res.json({
      offers: offers.map((o) => ({
        offerId: o.offerId,
        category: o.category,
        vendorAgent: o.vendorAgent,
        merchantId: o.merchantId,
        merchantName: o.merchantName,
        title: o.title,
        description: o.description,
        amount: o.amount,
        currency: o.currency,
        payTo: o.payTo,
        meta: o.meta,
        expiresAt: o.expiresAt,
      })),
    });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "search failed" });
  }
});

agentV1.post("/settle", agentAuth, async (req, res) => {
  try {
    const key = (req as Authed).agentKey;
    const offerId = String(req.body.offerId ?? "");
    if (!offerId) {
      res.status(400).json({ error: "offerId required" });
      return;
    }
    const result = await settleOffer(key.charterId, offerId, key.name);
    res.status(result.ok ? 200 : result.blocked ? 403 : 502).json({
      ok: result.ok,
      blocked: result.blocked,
      reason: "reason" in result ? result.reason : undefined,
      offer: result.offer,
      remainingUsdc: (
        Number(result.charter.budgetUsdc) - Number(result.charter.spentUsdc)
      ).toFixed(2),
      paymentRef: result.ok
        ? result.agentic?.paymentRequestId ??
          (result.pay as { data?: { payment_ref?: string } } | undefined)?.data?.payment_ref
        : undefined,
      flowId: result.ok ? result.agentic?.flowId : undefined,
      txHash: result.ok ? result.agentic?.txSignature : undefined,
      hspStatus: result.ok ? result.agentic?.finalStatus : undefined,
      attributionVerified: result.ok ? result.agentic?.attributionVerified : undefined,
      payer: config.agentAddress,
      intentMandateId: result.charter.intentMandate?.mandateId,
      notification: "User notified on enabled channels (email / telegram / inbox)",
    });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "settle failed" });
  }
});

agentV1.get("/activity", agentAuth, (req, res) => {
  const key = (req as Authed).agentKey;
  res.json(charterDetail(key.charterId));
});
