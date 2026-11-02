import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  api,
  MERCHANT_OPTIONS,
  type Charter,
  type CreateCharterInput,
  type NotificationItem,
  type Offer,
  type RailsConfig,
  type Settlement,
} from "../lib/api";
import "./Dashboard.css";

type Page =
  | "overview"
  | "work"
  | "activity"
  | "messages"
  | "access"
  | "wallet"
  | "compose";

const NAV: Array<{ id: Page; label: string; hint: string }> = [
  { id: "overview", label: "Overview", hint: "Envelope & status" },
  { id: "work", label: "Work", hint: "Search & settle" },
  { id: "activity", label: "Activity", hint: "HSP ledger" },
  { id: "messages", label: "Messages", hint: "AFK alerts" },
  { id: "access", label: "Access", hint: "Agent keys" },
  { id: "wallet", label: "Wallet", hint: "Platform payer" },
];

const TOKEN_KEY = "charter.agentToken";
const CHARTER_KEY = "charter.activeId";

function pageFromPath(pathname: string): Page {
  const seg = pathname.replace(/^\/app\/?/, "").split("/")[0] || "overview";
  if (seg === "new" || seg === "compose") return "compose";
  if (NAV.some((n) => n.id === seg)) return seg as Page;
  return "overview";
}

function pathForPage(page: Page) {
  if (page === "overview") return "/app";
  if (page === "compose") return "/app/new";
  return `/app/${page}`;
}

function defaultDates() {
  const inDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const outDate = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  return { checkIn: inDate, checkOut: outDate };
}

function emptyForm(): CreateCharterInput {
  const { checkIn, checkOut } = defaultDates();
  return {
    title: "",
    city: "Tokyo",
    checkIn,
    checkOut,
    budgetUsdc: "900",
    maxPerPaymentUsdc: "500",
    maxPerNightUsdc: 200,
    categories: ["hotel", "flight"],
    allowMerchants: ["ShibuyaNest", "CapsulePrime", "SkyBridge", "PacificHop"],
    notes: "",
    notify: { email: "", telegram: "" },
  };
}

function shortAddr(addr?: string | null) {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const page = pageFromPath(location.pathname);

  const go = (p: Page) => navigate(pathForPage(p));

  const [charter, setCharter] = useState<Charter | null>(null);
  const [agentToken, setAgentToken] = useState<string | null>(() =>
    sessionStorage.getItem(TOKEN_KEY),
  );
  const [offers, setOffers] = useState<Offer[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [timeline, setTimeline] = useState<
    Array<{ id: string; title: string; at: string; type: string }>
  >([]);
  const [wallet, setWallet] = useState<{
    balanceUsdc: string;
    address: string;
    vaultMode: string;
    explorerBase?: string;
  } | null>(null);
  const [rails, setRails] = useState<RailsConfig | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState<"token" | "addr" | null>(null);
  const [ready, setReady] = useState(false);
  const [form, setForm] = useState<CreateCharterInput>(emptyForm);
  const [navOpen, setNavOpen] = useState(false);

  const rememberToken = (token: string | null) => {
    setAgentToken(token);
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  };

  const rememberCharter = (id: string | null) => {
    if (id) sessionStorage.setItem(CHARTER_KEY, id);
    else sessionStorage.removeItem(CHARTER_KEY);
  };

  const refresh = useCallback(
    async (charterId?: string) => {
      const dash = await api.dashboard();
      setWallet(dash.wallet);
      setRails(dash.config);
      setTimeline(dash.timeline);
      setSettlements(dash.settlements);
      setNotifications(dash.notifications);
      const saved = sessionStorage.getItem(CHARTER_KEY);
      const id = charterId ?? charter?.id ?? saved ?? dash.charters[0]?.id;
      if (id) {
        const detail = await api.charter(id);
        setCharter(detail.charter);
        rememberCharter(detail.charter.id);
        setOffers(detail.offers);
        setSettlements(detail.settlements);
        setNotifications(detail.notifications);
      } else {
        setCharter(null);
      }
    },
    [charter?.id],
  );

  useEffect(() => {
    refresh()
      .catch(console.error)
      .finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    setNavOpen(false);
  }, [page]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("create");
    try {
      const title =
        form.title?.trim() ||
        `${form.city} trip · ${form.checkIn} → ${form.checkOut}`;
      const res = await api.createCharter({ ...form, title });
      setCharter(res.charter);
      rememberCharter(res.charter.id);
      rememberToken(null);
      setToast("Charter drafted. Approve the Intent Mandate");
      go("access");
      await refresh(res.charter.id);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(null);
    }
  };

  const loadSample = async () => {
    setBusy("sample");
    try {
      const res = await api.sample(false);
      setCharter(res.charter);
      rememberCharter(res.charter.id);
      rememberToken(null);
      setToast("Tokyo draft loaded. Still needs your approval");
      go("access");
      await refresh(res.charter.id);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Sample failed");
    } finally {
      setBusy(null);
    }
  };

  const approve = async () => {
    if (!charter) return;
    setBusy("approve");
    try {
      const res = await api.approve(charter.id);
      setCharter(res.charter);
      setToast("Intent Mandate signed");
      await refresh(charter.id);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setBusy(null);
    }
  };

  const issueKey = async () => {
    if (!charter) return;
    setBusy("key");
    try {
      const res = await api.issueKey(charter.id, "Grok");
      rememberToken(res.key.token);
      setToast("Agent key issued. Copy it once");
      go("access");
      await refresh(charter.id);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Key failed");
    } finally {
      setBusy(null);
    }
  };

  const search = async (category: "hotel" | "flight") => {
    if (!charter) return;
    setBusy(category);
    try {
      const res = await api.search(charter.id, category);
      setOffers((prev) => {
        const others = prev.filter((o) => o.category !== category || o.status !== "open");
        return [...res.offers, ...others];
      });
      setToast(category === "hotel" ? "Hotels ready" : "Flights ready");
      go("work");
      await refresh(charter.id);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Search failed");
    } finally {
      setBusy(null);
    }
  };

  const settle = async (offerId: string) => {
    if (!charter) return;
    setBusy(offerId);
    try {
      const res = await api.settle(charter.id, offerId);
      if (res.blocked) setToast(res.reason?.replace(/_/g, " ") ?? "Blocked");
      else if (res.ok) setToast("Settled on HSP");
      else setToast(res.reason ?? "Failed");
      await refresh(charter.id);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Settle failed");
    } finally {
      setBusy(null);
    }
  };

  const copyToken = async () => {
    if (!agentToken) return;
    await navigator.clipboard.writeText(agentToken);
    setCopied("token");
    setTimeout(() => setCopied(null), 1400);
  };

  const copyAddr = async () => {
    if (!wallet?.address) return;
    await navigator.clipboard.writeText(wallet.address);
    setCopied("addr");
    setTimeout(() => setCopied(null), 1400);
  };

  const toggleMerchant = (id: string) => {
    setForm((f) => {
      const set = new Set(f.allowMerchants ?? []);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...f, allowMerchants: [...set] };
    });
  };

  const remaining = charter
    ? (Number(charter.budgetUsdc) - Number(charter.spentUsdc)).toFixed(2)
    : null;

  const spentPct = charter
    ? Math.min(100, (Number(charter.spentUsdc) / Number(charter.budgetUsdc)) * 100)
    : 0;

  const offerById = useMemo(() => new Map(offers.map((o) => [o.offerId, o])), [offers]);
  const openOffers = useMemo(() => offers.filter((o) => o.status === "open"), [offers]);
  const settledCount = useMemo(
    () => settlements.filter((s) => s.status === "settled").length,
    [settlements],
  );
  const blockedCount = useMemo(
    () => settlements.filter((s) => s.status === "blocked").length,
    [settlements],
  );

  const step =
    !charter
      ? 1
      : charter.status === "draft"
        ? 2
        : !agentToken
          ? 3
          : 4;

  const pageMeta = NAV.find((n) => n.id === page) ?? {
    id: "compose" as Page,
    label: "New charter",
    hint: "Draft Intent Mandate",
  };

  const hspLive = rails?.hspMode === "mcp" || rails?.hspMode === "live";

  return (
    <div className={`desk ${ready ? "is-ready" : ""} ${navOpen ? "nav-open" : ""}`}>
      <div className="desk-ambient" aria-hidden>
        <span className="desk-glow a" />
        <span className="desk-glow b" />
      </div>

      {toast && (
        <div className="desk-toast" role="status">
          {toast}
        </div>
      )}

      <div className="desk-shell">
        <aside className="desk-sidebar" aria-label="Desk navigation">
          <div className="desk-side-brand">
            <Link to="/" className="desk-wordmark">
              Charter
            </Link>
            <p>Human Not Present desk</p>
          </div>

          <nav className="desk-side-nav">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                className={page === item.id ? "is-on" : undefined}
                onClick={() => go(item.id)}
              >
                <strong>{item.label}</strong>
                <span>{item.hint}</span>
              </button>
            ))}
          </nav>

          <div className="desk-side-foot">
            <button
              type="button"
              className="desk-btn soft block"
              onClick={() => {
                setForm(emptyForm());
                go("compose");
              }}
            >
              New charter
            </button>
            <Link to="/" className="desk-side-home">
              ← Marketing site
            </Link>
          </div>
        </aside>

        {navOpen && (
          <button
            type="button"
            className="desk-scrim"
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
          />
        )}

        <div className="desk-body">
          <header className="desk-topbar">
            <button
              type="button"
              className="desk-menu-btn"
              aria-label="Open menu"
              onClick={() => setNavOpen(true)}
            >
              <span />
              <span />
            </button>
            <div className="desk-topbar-copy">
              <h1>{pageMeta.label}</h1>
              <p>{pageMeta.hint}</p>
            </div>
            <div className="desk-rails" aria-label="Settlement rails">
              <span className={`desk-rail-pill ${hspLive ? "live" : "mock"}`}>
                HSP {rails?.hspMode ?? "…"}
              </span>
              <span className="desk-rail-pill">
                Vault {wallet?.vaultMode || (rails?.vaultOnChain ? "chain" : "memory")}
              </span>
              {rails?.liveReady ? (
                <span className="desk-rail-pill ok">MCP ready</span>
              ) : hspLive ? (
                <span className="desk-rail-pill">Awaiting allowlist</span>
              ) : (
                <span className="desk-rail-pill">Mock settle</span>
              )}
            </div>
          </header>

          <main className="desk-main">
            {page === "compose" && (
              <section className="desk-compose">
                <header className="desk-block-head">
                  <div>
                    <h2>Create a charter</h2>
                    <p>
                      Approve the Intent Mandate once. Agents settle under it on HashKey HSP while
                      you’re away.
                    </p>
                  </div>
                </header>

                <form className="desk-form" onSubmit={create}>
                  <div className="desk-form-grid">
                    <label>
                      Title
                      <input
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        placeholder="Tokyo weekend"
                      />
                    </label>
                    <label>
                      City
                      <input
                        required
                        value={form.city}
                        onChange={(e) => setForm({ ...form, city: e.target.value })}
                      />
                    </label>
                    <label>
                      Check-in
                      <input
                        type="date"
                        required
                        value={form.checkIn}
                        onChange={(e) => setForm({ ...form, checkIn: e.target.value })}
                      />
                    </label>
                    <label>
                      Check-out
                      <input
                        type="date"
                        required
                        value={form.checkOut}
                        onChange={(e) => setForm({ ...form, checkOut: e.target.value })}
                      />
                    </label>
                    <label>
                      Budget (USDC)
                      <input
                        required
                        inputMode="decimal"
                        value={form.budgetUsdc}
                        onChange={(e) => setForm({ ...form, budgetUsdc: e.target.value })}
                      />
                    </label>
                    <label>
                      Max per payment
                      <input
                        required
                        inputMode="decimal"
                        value={form.maxPerPaymentUsdc}
                        onChange={(e) => setForm({ ...form, maxPerPaymentUsdc: e.target.value })}
                      />
                    </label>
                    <label>
                      Max per night
                      <input
                        inputMode="decimal"
                        value={form.maxPerNightUsdc ?? ""}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            maxPerNightUsdc: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                      />
                    </label>
                    <label>
                      Notify email
                      <input
                        type="email"
                        value={form.notify?.email ?? ""}
                        onChange={(e) =>
                          setForm({ ...form, notify: { ...form.notify, email: e.target.value } })
                        }
                        placeholder="you@company.com"
                      />
                    </label>
                    <label>
                      Telegram
                      <input
                        value={form.notify?.telegram ?? ""}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            notify: { ...form.notify, telegram: e.target.value },
                          })
                        }
                        placeholder="@you"
                      />
                    </label>
                    <label className="wide">
                      Notes for the agent
                      <textarea
                        rows={3}
                        value={form.notes ?? ""}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        placeholder="Near Shibuya. Prefer refundable rates."
                      />
                    </label>
                  </div>

                  <fieldset className="desk-merchants">
                    <legend>Allowlisted merchants</legend>
                    <div className="desk-merchant-grid">
                      {MERCHANT_OPTIONS.map((m) => (
                        <label key={m.id} className="desk-check">
                          <input
                            type="checkbox"
                            checked={(form.allowMerchants ?? []).includes(m.id)}
                            onChange={() => toggleMerchant(m.id)}
                          />
                          <span>{m.label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <div className="desk-actions">
                    <button type="submit" className="desk-btn" disabled={busy === "create"}>
                      {busy === "create" ? "Creating…" : "Create draft"}
                    </button>
                    <button
                      type="button"
                      className="desk-btn soft"
                      onClick={loadSample}
                      disabled={!!busy}
                    >
                      {busy === "sample" ? "Loading…" : "Use Tokyo sample"}
                    </button>
                    {charter && (
                      <button type="button" className="desk-ghost" onClick={() => go("overview")}>
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              </section>
            )}

            {page !== "compose" && !charter && (
              <section className="desk-empty-state">
                <h2>No charter yet</h2>
                <p>Draft a spend envelope, approve the Intent Mandate, then issue an agent key.</p>
                <div className="desk-actions">
                  <button
                    type="button"
                    className="desk-btn"
                    onClick={() => {
                      setForm(emptyForm());
                      go("compose");
                    }}
                  >
                    Create charter
                  </button>
                  <button
                    type="button"
                    className="desk-btn soft"
                    onClick={loadSample}
                    disabled={!!busy}
                  >
                    Tokyo sample
                  </button>
                </div>
              </section>
            )}

            {page !== "compose" && charter && (
              <>
                {page === "overview" && (
                  <section key="overview" className="desk-page">
                    <div className="desk-overview-grid">
                      <AgentWalletCard
                        address={wallet?.address}
                        balanceUsdc={wallet?.balanceUsdc}
                        hspMode={rails?.hspMode}
                        merchantName={rails?.merchantName ?? "Charter"}
                        chainId={rails?.chainId}
                        onCopy={copyAddr}
                        copied={copied === "addr"}
                        onOpenWallet={() => go("wallet")}
                      />

                      <div className="desk-overview-main">
                        <div className="desk-charter-head">
                          <p className="desk-kicker">
                            {charter.constraints.city}
                            <span className={`desk-dot ${charter.status}`} />
                            {charter.status}
                          </p>
                          <h2>{charter.title}</h2>
                          <p className="desk-lede">
                            {charter.constraints.checkIn} – {charter.constraints.checkOut} ·{" "}
                            {charter.constraints.nights} nights · max $
                            {charter.maxPerPaymentUsdc}/payment
                          </p>
                        </div>

                        <div className="desk-envelope">
                          <div>
                            <p className="desk-balance-label">Remaining envelope</p>
                            <p className="desk-figure">
                              <span>$</span>
                              {remaining}
                            </p>
                          </div>
                          <div className="desk-track" aria-hidden>
                            <i style={{ ["--spent" as string]: spentPct / 100 }} />
                          </div>
                          <div className="desk-balance-meta">
                            <span>
                              Spent ${charter.spentUsdc} / ${charter.budgetUsdc}
                            </span>
                            <span>Vault ${wallet?.balanceUsdc ?? "—"}</span>
                          </div>
                        </div>

                        <div className="desk-stats">
                          <div>
                            <strong>{settledCount}</strong>
                            <span>Settled</span>
                          </div>
                          <div>
                            <strong>{blockedCount}</strong>
                            <span>Denied</span>
                          </div>
                          <div>
                            <strong>{openOffers.length}</strong>
                            <span>Open offers</span>
                          </div>
                          <div>
                            <strong>{groupNotifications(notifications).length}</strong>
                            <span>Messages</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <ol className="desk-steps" aria-label="Charter setup">
                      {[
                        ["Draft", "Set budget & merchants"],
                        ["Approve", "Sign Intent Mandate"],
                        ["Key", "Issue agent Bearer"],
                        ["Work", "Search & settle on HSP"],
                      ].map(([label, hint], i) => {
                        const n = i + 1;
                        return (
                          <li
                            key={label}
                            className={step > n ? "done" : step === n ? "now" : undefined}
                          >
                            <b>{n}</b>
                            <div>
                              <strong>{label}</strong>
                              <span>{hint}</span>
                            </div>
                          </li>
                        );
                      })}
                    </ol>

                    {charter.status === "draft" && (
                      <div className="desk-banner">
                        <div>
                          <strong>Sign Intent Mandate</strong>
                          <p>
                            EIP-712 signature from the operator wallet. After this, agents can
                            search and settle under the charter on HSP.
                          </p>
                        </div>
                        <button
                          type="button"
                          className="desk-btn"
                          onClick={approve}
                          disabled={busy === "approve"}
                        >
                          {busy === "approve" ? "Signing…" : "Approve Intent Mandate"}
                        </button>
                      </div>
                    )}

                    {charter.status === "active" && !agentToken && (
                      <div className="desk-banner">
                        <div>
                          <strong>Issue an agent key</strong>
                          <p>
                            Claude/Grok need a Bearer token for <code>/api/v1</code>. Shown once.
                          </p>
                        </div>
                        <button
                          type="button"
                          className="desk-btn"
                          onClick={issueKey}
                          disabled={busy === "key"}
                        >
                          {busy === "key" ? "Issuing…" : "Issue Grok key"}
                        </button>
                      </div>
                    )}

                    {charter.status === "active" && (
                      <div className="desk-actions">
                        <button
                          type="button"
                          className="desk-btn soft"
                          onClick={() => search("hotel")}
                          disabled={!!busy}
                        >
                          {busy === "hotel" ? "Searching…" : "Find hotels"}
                        </button>
                        <button
                          type="button"
                          className="desk-btn"
                          onClick={() => search("flight")}
                          disabled={!!busy}
                        >
                          {busy === "flight" ? "Searching…" : "Find flights"}
                        </button>
                        <button
                          type="button"
                          className="desk-ghost"
                          onClick={() => go("work")}
                        >
                          Open Work →
                        </button>
                      </div>
                    )}
                  </section>
                )}

                {page === "wallet" && (
                  <section key="wallet" className="desk-page">
                    <div className="desk-wallet-page">
                      <AgentWalletCard
                        large
                        address={wallet?.address}
                        balanceUsdc={wallet?.balanceUsdc}
                        hspMode={rails?.hspMode}
                        merchantName={rails?.merchantName ?? "Charter"}
                        chainId={rails?.chainId}
                        onCopy={copyAddr}
                        copied={copied === "addr"}
                      />

                      <div className="desk-wallet-meta">
                        <header className="desk-block-head">
                          <div>
                            <h2>Platform agent wallet</h2>
                            <p>
                              Claude never holds keys. Charter signs HSP payments from this payer
                              when policy allows.
                            </p>
                          </div>
                        </header>

                        <dl className="desk-facts">
                          <div>
                            <dt>Address</dt>
                            <dd className="mono">{wallet?.address ?? "—"}</dd>
                          </div>
                          <div>
                            <dt>Role</dt>
                            <dd>Platform agent wallet · HSP payer</dd>
                          </div>
                          <div>
                            <dt>Pay to</dt>
                            <dd className="mono">{rails?.payTo ?? "—"}</dd>
                          </div>
                          <div>
                            <dt>Vault</dt>
                            <dd>{wallet?.vaultMode ?? "memory"} envelope</dd>
                          </div>
                          <div>
                            <dt>Network</dt>
                            <dd>
                              {rails?.network ?? "hashkey-testnet"} · chain {rails?.chainId ?? "—"}
                            </dd>
                          </div>
                        </dl>

                        <div className="desk-actions left">
                          <button type="button" className="desk-btn soft" onClick={copyAddr}>
                            {copied === "addr" ? "Copied" : "Copy address"}
                          </button>
                          {wallet?.explorerBase && wallet.address && (
                            <a
                              className="desk-ghost"
                              href={`${wallet.explorerBase}/address/${wallet.address}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Explorer
                            </a>
                          )}
                        </div>

                        <p className="desk-wallet-note">
                          Fund this address with the QA USDC from HSP <code>get_chain_config</code>,
                          complete EIP-3009 / Permit2 approvals, then settle under an approved
                          Intent Mandate.
                        </p>
                      </div>
                    </div>
                  </section>
                )}

                {page === "work" && (
                  <section key="work" className="desk-page desk-panel">
                    {charter.status === "active" && (
                      <div className="desk-actions" style={{ marginTop: 0 }}>
                        <button
                          type="button"
                          className="desk-btn soft"
                          onClick={() => search("hotel")}
                          disabled={!!busy}
                        >
                          {busy === "hotel" ? "Searching…" : "Find hotels"}
                        </button>
                        <button
                          type="button"
                          className="desk-btn"
                          onClick={() => search("flight")}
                          disabled={!!busy}
                        >
                          {busy === "flight" ? "Searching…" : "Find flights"}
                        </button>
                        <p className="desk-actions-hint">
                          Same path as <code>POST /api/v1/search</code>
                        </p>
                      </div>
                    )}

                    <div className="desk-block">
                      <header className="desk-block-head">
                        <div>
                          <h2>Offers</h2>
                          <p>Receiving agents return payment conditions. Settle under the mandate.</p>
                        </div>
                        {offers.length > 0 && (
                          <span className="desk-chip">{openOffers.length} open</span>
                        )}
                      </header>
                      {charter.status !== "active" ? (
                        <div className="desk-blank">
                          <strong>Approve first</strong>
                          <p>Sign the Intent Mandate before agents can search or settle.</p>
                        </div>
                      ) : offers.length === 0 ? (
                        <div className="desk-blank">
                          <strong>No offers yet</strong>
                          <p>Find hotels or flights, or call the agent API with your key.</p>
                        </div>
                      ) : (
                        <ul className="desk-list">
                          {offers.map((o) => (
                            <li key={o.offerId} className={`status-${o.status}`}>
                              <div className="desk-offer-mark" aria-hidden>
                                {o.category === "hotel" ? "H" : "F"}
                              </div>
                              <div className="desk-offer-body">
                                <strong>{o.title}</strong>
                                <span>
                                  {o.merchantName} · {o.category}
                                </span>
                                <em>{o.description}</em>
                              </div>
                              <div className="desk-list-end">
                                <b>${o.amount}</b>
                                <small className={o.status}>{o.status}</small>
                                <button
                                  type="button"
                                  className="desk-btn tiny"
                                  disabled={!!busy || o.status !== "open"}
                                  onClick={() => settle(o.offerId)}
                                >
                                  {busy === o.offerId ? "…" : "Settle"}
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </section>
                )}

                {page === "activity" && (
                  <section key="activity" className="desk-page desk-panel">
                    <div className="desk-block">
                      <header className="desk-block-head">
                        <div>
                          <h2>Activity</h2>
                          <p>Every HSP attempt under this charter.</p>
                        </div>
                      </header>
                      {settlements.length === 0 ? (
                        <div className="desk-blank">
                          <strong>No settlements</strong>
                          <p>Settle an open offer to see HSP outcomes here.</p>
                        </div>
                      ) : (
                        <ul className="desk-ledger">
                          {settlements.map((s, i) => {
                            const o = offerById.get(s.offerId);
                            return (
                              <li
                                key={s.id}
                                className={`is-${s.status}`}
                                style={{ ["--i" as string]: i }}
                              >
                                <div className="desk-ledger-mark" aria-hidden>
                                  {s.status === "settled" ? "✓" : "✕"}
                                </div>
                                <div className="desk-ledger-body">
                                  <strong>{o?.title ?? "Settlement"}</strong>
                                  <span>
                                    {o?.merchantName ?? "Merchant"} · {fmt(s.at)}
                                  </span>
                                  {s.reason && <em>{s.reason.replace(/_/g, " ")}</em>}
                                  {s.paymentRef && <em className="ref">{s.paymentRef}</em>}
                                </div>
                                <div className="desk-ledger-end">
                                  <b>${s.amount}</b>
                                  <small>{s.status}</small>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      <header className="desk-block-head spaced">
                        <div>
                          <h2>Trail</h2>
                          <p>Chronological mandate events.</p>
                        </div>
                      </header>
                      <ol className="desk-trail">
                        {timeline.slice(0, 12).map((e, i) => (
                          <li key={e.id} style={{ ["--i" as string]: i }}>
                            <i />
                            <div>
                              <span>{e.title}</span>
                              <time>{fmt(e.at)}</time>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </section>
                )}

                {page === "messages" && (
                  <section key="messages" className="desk-page desk-panel">
                    <div className="desk-block">
                      <header className="desk-block-head">
                        <div>
                          <h2>Messages</h2>
                          <p>What you’d get on Telegram or email while away.</p>
                        </div>
                        {notifications.length > 0 && (
                          <span className="desk-chip">
                            {groupNotifications(notifications).length} delivered
                          </span>
                        )}
                      </header>
                      {notifications.length === 0 ? (
                        <div className="desk-blank">
                          <strong>Inbox empty</strong>
                          <p>Settles and denies notify here automatically.</p>
                        </div>
                      ) : (
                        <ul className="desk-mail">
                          {groupNotifications(notifications).map((n, i) => {
                            const denied =
                              /blocked|denied/i.test(n.subject) || /Denied:/i.test(n.body);
                            const lines = n.body
                              .split("\n")
                              .map((l) => l.trim())
                              .filter(Boolean);
                            const reason = lines.find((l) => /^Denied:/i.test(l));
                            const facts = lines
                              .slice(1)
                              .filter((l) => !/^Denied:/i.test(l))
                              .slice(0, 4);
                            return (
                              <li
                                key={n.id}
                                className={denied ? "is-deny" : "is-ok"}
                                style={{ ["--i" as string]: i }}
                              >
                                <div className="desk-mail-rail">
                                  {n.channels.map((c) => (
                                    <b key={`${c.channel}-${c.to}`}>{c.channel}</b>
                                  ))}
                                  <time>{fmt(n.at)}</time>
                                </div>
                                <strong>{mailTitle(n.subject)}</strong>
                                <p>{lines[0]}</p>
                                {reason && (
                                  <em className="desk-mail-reason">
                                    {reason.replace(/^Denied:\s*/i, "").replace(/_/g, " ")}
                                  </em>
                                )}
                                {facts.length > 0 && (
                                  <ul className="desk-mail-facts">
                                    {facts.map((line) => (
                                      <li key={line}>{line}</li>
                                    ))}
                                  </ul>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </section>
                )}

                {page === "access" && (
                  <section key="access" className="desk-page desk-panel">
                    <div className="desk-block">
                      <header className="desk-block-head">
                        <div>
                          <h2>Agent access</h2>
                          <p>
                            Give Claude/Grok a Bearer token for <code>/api/v1</code>. Settlement
                            runs through HashKey HSP ({rails?.hspMode ?? "…"}).
                          </p>
                        </div>
                      </header>

                      <div className="desk-access-grid">
                        <dl className="desk-facts">
                          <div>
                            <dt>Merchants</dt>
                            <dd>{charter.allowMerchants.join(", ")}</dd>
                          </div>
                          <div>
                            <dt>Notify</dt>
                            <dd>
                              {[charter.notify.email, charter.notify.telegram]
                                .filter(Boolean)
                                .join(" · ") || "—"}
                            </dd>
                          </div>
                          {charter.intentMandate && (
                            <>
                              <div>
                                <dt>Mandate</dt>
                                <dd className="mono">{charter.intentMandate.mandateId}</dd>
                              </div>
                              {charter.intentMandate.signer && (
                                <div>
                                  <dt>Signer</dt>
                                  <dd className="mono">{charter.intentMandate.signer}</dd>
                                </div>
                              )}
                            </>
                          )}
                          <div>
                            <dt>Agent wallet</dt>
                            <dd className="mono">{wallet?.address ?? "—"}</dd>
                          </div>
                        </dl>

                        {charter.status !== "active" ? (
                          <div className="desk-key desk-key-empty">
                            <p className="desk-key-label">Intent Mandate</p>
                            <p className="desk-key-hint">
                              Approve the charter before an agent key can be issued.
                            </p>
                            <button
                              type="button"
                              className="desk-btn"
                              onClick={approve}
                              disabled={busy === "approve"}
                            >
                              {busy === "approve" ? "Signing…" : "Approve Intent Mandate"}
                            </button>
                          </div>
                        ) : agentToken ? (
                          <div className="desk-key">
                            <p className="desk-key-label">Live agent key</p>
                            <code>{agentToken}</code>
                            <div className="desk-actions left">
                              <button type="button" className="desk-btn soft" onClick={copyToken}>
                                {copied === "token" ? "Copied" : "Copy key"}
                              </button>
                              <button
                                type="button"
                                className="desk-ghost"
                                onClick={issueKey}
                                disabled={busy === "key"}
                              >
                                Re-issue
                              </button>
                            </div>
                            <pre className="desk-curl">{`curl -H "Authorization: Bearer ${agentToken}" \\
  -H "content-type: application/json" \\
  -d '{"category":"hotel"}' \\
  http://localhost:8787/api/v1/search`}</pre>
                          </div>
                        ) : (
                          <div className="desk-key desk-key-empty">
                            <p className="desk-key-label">Live agent key</p>
                            <p className="desk-key-hint">
                              Issue a scoped Bearer token so agents can search and settle under
                              this charter.
                            </p>
                            <button
                              type="button"
                              className="desk-btn"
                              onClick={issueKey}
                              disabled={busy === "key"}
                            >
                              Issue Grok key
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function AgentWalletCard(props: {
  address?: string;
  balanceUsdc?: string;
  hspMode?: string;
  merchantName: string;
  chainId?: number;
  large?: boolean;
  copied?: boolean;
  onCopy: () => void;
  onOpenWallet?: () => void;
}) {
  return (
    <article
      className={`agent-card ${props.large ? "is-large" : ""}`}
      aria-label="AI agent platform wallet"
    >
      <div className="agent-card-shine" aria-hidden />
      <header className="agent-card-top">
        <div>
          <p className="agent-card-brand">{props.merchantName}</p>
          <p className="agent-card-role">AI agent wallet</p>
        </div>
        <span className="agent-card-chip" aria-hidden />
      </header>

      <p className="agent-card-balance">
        <span>$</span>
        {props.balanceUsdc ?? "0.00"}
        <small>USDC</small>
      </p>

      <div className="agent-card-foot">
        <div>
          <span className="agent-card-label">Payer</span>
          <button type="button" className="agent-card-addr" onClick={props.onCopy}>
            {props.copied ? "Copied" : shortAddr(props.address)}
          </button>
        </div>
        <div className="agent-card-badges">
          <span>HSP {props.hspMode ?? "…"}</span>
          <span>Chain {props.chainId ?? "—"}</span>
        </div>
      </div>

      {props.onOpenWallet && (
        <button type="button" className="agent-card-link" onClick={props.onOpenWallet}>
          Wallet details →
        </button>
      )}
    </article>
  );
}

function groupNotifications(items: NotificationItem[]) {
  const map = new Map<
    string,
    {
      id: string;
      subject: string;
      body: string;
      at: string;
      channels: Array<{ channel: string; to: string }>;
    }
  >();
  for (const n of items) {
    const key = `${n.subject}\0${n.body}\0${n.at.slice(0, 16)}`;
    const existing = map.get(key);
    if (existing) {
      if (!existing.channels.some((c) => c.channel === n.channel && c.to === n.to)) {
        existing.channels.push({ channel: n.channel, to: n.to });
      }
    } else {
      map.set(key, {
        id: n.id,
        subject: n.subject,
        body: n.body,
        at: n.at,
        channels: [{ channel: n.channel, to: n.to }],
      });
    }
  }
  return [...map.values()];
}

function mailTitle(subject: string) {
  if (/^blocked/i.test(subject)) return "Spend blocked";
  if (/^settled/i.test(subject)) return subject.replace(/^Settled:\s*/i, "Settled · ");
  if (/^charter approved/i.test(subject)) return "Intent Mandate active";
  return subject.replace(/\s+chr_[a-z0-9]+/gi, "");
}

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
