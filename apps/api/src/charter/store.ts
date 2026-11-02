import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  AgentKey,
  Charter,
  NotificationItem,
  SettlementRecord,
  VendorOffer,
} from "./types.js";

const charters = new Map<string, Charter>();
const keysByToken = new Map<string, AgentKey>();
const keysById = new Map<string, AgentKey>();
const offers = new Map<string, VendorOffer>();
const settlements: SettlementRecord[] = [];
const notifications: NotificationItem[] = [];

const DATA_PATH = join(process.cwd(), "data/charter-store.json");

type Snapshot = {
  charters: Charter[];
  keys: AgentKey[];
  offers: VendorOffer[];
  settlements: SettlementRecord[];
  notifications: NotificationItem[];
};

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistNow();
  }, 80);
}

function persistNow() {
  try {
    mkdirSync(dirname(DATA_PATH), { recursive: true });
    const snap: Snapshot = {
      charters: [...charters.values()],
      keys: [...keysById.values()],
      offers: [...offers.values()],
      settlements: [...settlements],
      notifications: [...notifications],
    };
    writeFileSync(DATA_PATH, JSON.stringify(snap, null, 2), "utf8");
  } catch (err) {
    console.error("[charter-store] persist failed", err);
  }
}

function load() {
  if (!existsSync(DATA_PATH)) return;
  try {
    const snap = JSON.parse(readFileSync(DATA_PATH, "utf8")) as Snapshot;
    for (const c of snap.charters ?? []) charters.set(c.id, c);
    for (const k of snap.keys ?? []) {
      keysById.set(k.id, k);
      keysByToken.set(k.token, k);
    }
    for (const o of snap.offers ?? []) offers.set(o.offerId, o);
    settlements.push(...(snap.settlements ?? []));
    notifications.push(...(snap.notifications ?? []));
  } catch (err) {
    console.error("[charter-store] load failed", err);
  }
}

load();

export const db = {
  charters,
  keysByToken,
  keysById,
  offers,
  settlements,
  notifications,
  reset() {
    charters.clear();
    keysByToken.clear();
    keysById.clear();
    offers.clear();
    settlements.length = 0;
    notifications.length = 0;
    persistNow();
  },
};

export function listCharters() {
  return [...charters.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getCharter(id: string) {
  const c = charters.get(id);
  if (!c) throw new Error(`Unknown charter: ${id}`);
  return c;
}

export function saveCharter(c: Charter) {
  charters.set(c.id, c);
  schedulePersist();
  return c;
}

export function saveKey(k: AgentKey) {
  keysById.set(k.id, k);
  keysByToken.set(k.token, k);
  schedulePersist();
  return k;
}

export function findKey(token: string) {
  return keysByToken.get(token) ?? null;
}

export function listKeys(charterId: string) {
  return [...keysById.values()].filter((k) => k.charterId === charterId);
}

export function saveOffer(o: VendorOffer) {
  offers.set(o.offerId, o);
  schedulePersist();
  return o;
}

export function getOffer(id: string) {
  const o = offers.get(id);
  if (!o) throw new Error(`Unknown offer: ${id}`);
  return o;
}

export function listOffers(charterId: string) {
  return [...offers.values()]
    .filter((o) => o.charterId === charterId)
    .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt));
}

export function addSettlement(s: SettlementRecord) {
  settlements.unshift(s);
  if (settlements.length > 200) settlements.pop();
  schedulePersist();
  return s;
}

export function listSettlements(charterId?: string) {
  return charterId ? settlements.filter((s) => s.charterId === charterId) : [...settlements];
}

export function addNotification(n: NotificationItem) {
  notifications.unshift(n);
  if (notifications.length > 200) notifications.pop();
  schedulePersist();
  return n;
}

export function listNotifications(charterId?: string) {
  return charterId
    ? notifications.filter((n) => n.charterId === charterId)
    : [...notifications];
}
