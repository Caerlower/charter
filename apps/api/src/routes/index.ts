import { Router } from "express";
import { config } from "../config.js";
import {
  approveCharter,
  charterDetail,
  createCharter,
  dashboardState,
  ensureVaultReady,
  issueAgentKey,
  revokeAgentKey,
  seedTokyoDraft,
  settleOffer,
  searchOffers,
} from "../charter/service.js";
import { listCharters } from "../charter/store.js";
import { getAgentView, unitsToUsdc, vaultMode } from "../lib/vault.js";
import { getState } from "../store/events.js";
import { verifyWebhookSignature } from "../hsp/hmac.js";
import { probeHspMcp } from "../hsp/mcp.js";
import { getPaymentRails } from "../hsp/rails.js";
import { agentV1 } from "./agentV1.js";

export const router: Router = Router();

router.use("/v1", agentV1);

router.get("/health", async (_req, res) => {
  let egressIp: string | null = null;
  try {
    const ipRes = await fetch("https://api.ipify.org?format=json", {
      signal: AbortSignal.timeout(4000),
    });
    if (ipRes.ok) {
      const body = (await ipRes.json()) as { ip?: string };
      egressIp = body.ip ?? null;
    }
  } catch {
    egressIp = null;
  }

  const hsp =
    config.hspMode === "mcp"
      ? await probeHspMcp()
      : { ok: true, url: null as string | null, mode: "mock" };
  res.json({
    ok: true,
    product: "Charter",
    tagline: "Human Not Present payments. Website for you, API for agents, settlement on HSP.",
    hspMode: config.hspMode,
    hspMcp: hsp,
    egressIp,
    merchantName: config.merchantName,
    vaultMode: vaultMode(),
    chainId: config.chainId,
    agent: config.agentAddress,
    payTo: config.payToAddress,
    vault: config.vaultAddress || null,
    agentApi: "/api/v1/* (Bearer chlive_…)",
  });
});

router.post("/demo/sample", async (req, res) => {
  try {
    const demo = await seedTokyoDraft({ reset: Boolean(req.body?.reset) });
    res.json({ ok: true, ...demo });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "sample failed" });
  }
});

router.get("/demo/bootstrap", async (_req, res) => {
  try {
    const demo = await seedTokyoDraft({ reset: true });
    res.json({ ok: true, ...demo });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "bootstrap failed" });
  }
});

router.get("/charters", (_req, res) => {
  res.json({ charters: listCharters() });
});

router.post("/charters", (req, res) => {
  try {
    const charter = createCharter({
      title: req.body.title,
      budgetUsdc: String(req.body.budgetUsdc ?? "900"),
      maxPerPaymentUsdc: req.body.maxPerPaymentUsdc
        ? String(req.body.maxPerPaymentUsdc)
        : undefined,
      constraints: {
        city: String(req.body.city ?? "Tokyo"),
        checkIn: String(req.body.checkIn),
        checkOut: String(req.body.checkOut),
        maxPerNightUsdc: req.body.maxPerNightUsdc
          ? Number(req.body.maxPerNightUsdc)
          : undefined,
        categories: req.body.categories,
        notes: req.body.notes,
      },
      allowMerchants: req.body.allowMerchants,
      notify: req.body.notify,
    });
    res.status(201).json({ charter });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "create failed" });
  }
});

router.get("/charters/:id", (req, res) => {
  try {
    res.json(charterDetail(req.params.id));
  } catch (e) {
    res.status(404).json({ error: e instanceof Error ? e.message : "not found" });
  }
});

router.post("/charters/:id/approve", async (req, res) => {
  try {
    const charter = await approveCharter(req.params.id);
    const wantKey = Boolean(req.body?.issueKey);
    if (wantKey) {
      const key = issueAgentKey(charter.id, String(req.body?.agentName ?? "Claude"));
      res.json({
        charter,
        agentKey: {
          id: key.id,
          name: key.name,
          token: key.token,
          createdAt: key.createdAt,
        },
        hint: "Save token now. Paste as Authorization: Bearer for /api/v1/*",
      });
      return;
    }
    res.json({ charter });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "approve failed" });
  }
});

router.post("/charters/:id/keys", (req, res) => {
  try {
    const key = issueAgentKey(req.params.id, String(req.body.name ?? "Grok"));
    res.status(201).json({
      key: {
        id: key.id,
        name: key.name,
        charterId: key.charterId,
        token: key.token,
        createdAt: key.createdAt,
      },
      usage: {
        header: `Authorization: Bearer ${key.token}`,
        base: "/api/v1",
        examples: [
          "GET /api/v1/me",
          "POST /api/v1/search { \"category\": \"hotel\" }",
          "POST /api/v1/settle { \"offerId\": \"offer_…\" }",
        ],
      },
    });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "key failed" });
  }
});

router.post("/keys/:id/revoke", (req, res) => {
  try {
    res.json({ key: revokeAgentKey(req.params.id) });
  } catch (e) {
    res.status(404).json({ error: e instanceof Error ? e.message : "not found" });
  }
});

router.post("/charters/:id/search", (req, res) => {
  try {
    const category = (req.body.category === "flight" ? "flight" : "hotel") as "hotel" | "flight";
    const offers = searchOffers(req.params.id, category);
    res.json({ offers });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "search failed" });
  }
});

router.post("/charters/:id/settle", async (req, res) => {
  try {
    const result = await settleOffer(req.params.id, String(req.body.offerId), "Dashboard");
    res.status(result.ok ? 200 : result.blocked ? 403 : 502).json(result);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "settle failed" });
  }
});

router.get("/dashboard", async (_req, res) => {
  await ensureVaultReady();
  const agent = await getAgentView();
  const rails = await getPaymentRails();
  res.json({
    ...dashboardState(),
    wallet: {
      balanceUsdc: unitsToUsdc(agent.balance),
      spentTodayUsdc: unitsToUsdc(agent.spentToday),
      vaultMode: vaultMode(),
      vaultAddress: config.vaultAddress || null,
      address: config.agentAddress,
      explorerBase: config.explorerBase,
    },
    rails,
    timeline: getState().timeline,
    config: {
      product: "Charter",
      hspMode: config.hspMode,
      chainId: config.chainId,
      network: config.network,
      hspBaseUrl: config.hspBaseUrl,
      merchantName: config.merchantName,
      liveReady: config.hspMode === "mcp" && rails.hspMcp.ok,
      hspMcpUrl: config.hspMcpUrl,
      vaultOnChain: Boolean(config.vaultAddress),
      payTo: config.payToAddress,
      agent: config.agentAddress,
    },
  });
});

router.get("/state", async (_req, res) => {
  const agent = await getAgentView();
  res.json({
    ...getState(),
    ...dashboardState(),
    wallet: {
      balanceUsdc: unitsToUsdc(agent.balance),
      address: config.agentAddress,
    },
  });
});

router.get("/rails", async (_req, res) => {
  try {
    res.json(await getPaymentRails());
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "rails failed" });
  }
});

router.post("/webhooks/hsp", (req, res) => {
  const raw = (req as typeof req & { rawBody?: Buffer }).rawBody;
  const sig = String(req.header("X-Signature") ?? "");
  const hasRealSecret =
    Boolean(config.appSecret) && config.appSecret !== "demo-app-secret";
  if (config.hspMode === "mcp" && hasRealSecret) {
    if (!raw || !verifyWebhookSignature(sig, raw, config.appSecret)) {
      res.status(401).json({ error: "invalid signature" });
      return;
    }
  }
  res.json({ ok: true, received: req.body });
});
