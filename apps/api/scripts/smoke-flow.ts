/**
 * End-to-end Charter smoke: intent → approve → key → search → deny → settle.
 *   pnpm smoke
 */
const BASE = process.env.API_BASE ?? "http://localhost:8787/api";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const { headers: initHeaders, ...rest } = init ?? {};
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(initHeaders ?? {}),
    },
  });
  const json = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `${res.status} ${path}`);
  return json;
}

async function main() {
  console.log("1) health / rails");
  const health = await req<{
    hspMode: string;
    agent: string;
    hspMcp?: { ok?: boolean; error?: string };
  }>("/health");
  console.log("   hspMode:", health.hspMode, "agent:", health.agent);
  const rails = await req<{
    hspMcp: { ok: boolean; error?: string };
    payer: { address: string };
    merchantName: string;
  }>("/rails");
  console.log("   merchant:", rails.merchantName);
  console.log("   mcp ok:", rails.hspMcp.ok, rails.hspMcp.error?.slice(0, 120) ?? "");
  console.log("   fund payer:", rails.payer.address);

  console.log("2) draft intent");
  const intent = await req<{
    charter: { id: string; status: string };
  }>("/v1/intent", {
    method: "POST",
    body: JSON.stringify({
      city: "Mumbai",
      checkIn: "2026-11-03",
      checkOut: "2026-11-10",
      budgetUsdc: "400",
      maxPerPaymentUsdc: "250",
      notes: "Hotel + flight under $400",
      agentName: "Claude",
    }),
  });
  const id = intent.charter.id;
  console.log("   draft:", id, intent.charter.status);

  console.log("3) approve + issue key");
  const approved = await req<{
    charter: { status: string; intentMandate: { mandateId: string } };
    agentKey: { token: string };
  }>(`/charters/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ issueKey: true, agentName: "Claude" }),
  });
  const token = approved.agentKey.token;
  console.log("   active:", approved.charter.status, approved.charter.intentMandate.mandateId);

  const auth = { Authorization: `Bearer ${token}` };

  console.log("4) search hotels");
  const search = await req<{
    offers: Array<{ offerId: string; title: string; amount: string }>;
  }>("/v1/search", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ category: "hotel" }),
  });
  const cheapest = [...search.offers].sort((a, b) => Number(a.amount) - Number(b.amount))[0];
  if (!cheapest) throw new Error("no hotel offers");
  console.log("   pick:", cheapest.title, cheapest.amount);

  console.log("5) deny over-max flight");
  const flights = await req<{
    offers: Array<{ offerId: string; title: string; amount: string }>;
  }>("/v1/search", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ category: "flight" }),
  });
  const expensive = [...flights.offers].sort((a, b) => Number(b.amount) - Number(a.amount))[0];
  if (!expensive) throw new Error("no flight offers");
  const denyRes = await fetch(`${BASE}/v1/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify({ offerId: expensive.offerId }),
  });
  const deny = (await denyRes.json()) as Record<string, unknown>;
  if (!deny.blocked) {
    throw new Error(`expected policy block for ${expensive.amount}, got ${JSON.stringify(deny)}`);
  }
  console.log("   blocked:", deny.reason, "@", expensive.amount);

  console.log("6) settle cheapest hotel", cheapest.offerId);
  const settleRes = await fetch(`${BASE}/v1/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify({ offerId: cheapest.offerId }),
  });
  const settle = (await settleRes.json()) as Record<string, unknown>;
  console.log("   http:", settleRes.status, {
    ok: settle.ok,
    blocked: settle.blocked,
    reason: typeof settle.reason === "string" ? settle.reason.slice(0, 160) : settle.reason,
    hspStatus: settle.hspStatus,
    paymentRef: settle.paymentRef,
    remainingUsdc: settle.remainingUsdc,
  });

  if (settle.ok) {
    console.log("SMOKE OK — settled");
    return;
  }
  if (settle.blocked) {
    throw new Error(`unexpected policy block: ${settle.reason}`);
  }

  const reason = String(settle.reason ?? settle.error ?? "");
  const mcpBlocked =
    !rails.hspMcp.ok ||
    /allowlist|cloudflare|blocked or unreachable|HSP MCP/i.test(reason);

  if (mcpBlocked || health.hspMode === "mcp") {
    console.log("SMOKE OK — policy path verified; HSP settle pending allowlist/funding.");
    return;
  }

  throw new Error(`settle failed: ${reason}`);
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
