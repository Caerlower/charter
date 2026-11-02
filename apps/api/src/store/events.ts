export type TimelineEvent = {
  id: string;
  at: string;
  type:
    | "policy"
    | "conditions"
    | "mandate"
    | "authorize"
    | "blocked"
    | "pay"
    | "settlement"
    | "unlock"
    | "chat";
  title: string;
  detail?: unknown;
};

export type PurchaseAttempt = {
  id: string;
  createdAt: string;
  status: "blocked" | "settled" | "failed" | "pending";
  blockReason?: string;
  serviceId: string;
  amount: string;
  merchant: string;
  cartMandate?: unknown;
  merchantAuthorization?: string;
  paymentSignature?: string;
  flowId?: string;
  paymentRequestId?: string;
  paymentRef?: string;
  hspTxHash?: string;
  authorizeTxHash?: string;
  settlementTxHash?: string;
  unlockedPayload?: unknown;
};

const timeline: TimelineEvent[] = [];
const attempts: PurchaseAttempt[] = [];
const chat: Array<{ role: "user" | "assistant"; content: string; at: string }> = [];

export function pushEvent(e: Omit<TimelineEvent, "id" | "at"> & { id?: string; at?: string }) {
  const event: TimelineEvent = {
    id: e.id ?? `evt_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
    at: e.at ?? new Date().toISOString(),
    type: e.type,
    title: e.title,
    detail: e.detail,
  };
  timeline.unshift(event);
  if (timeline.length > 100) timeline.pop();
  return event;
}

export function addAttempt(a: PurchaseAttempt) {
  attempts.unshift(a);
  if (attempts.length > 50) attempts.pop();
  return a;
}

export function updateAttempt(id: string, patch: Partial<PurchaseAttempt>) {
  const i = attempts.findIndex((x) => x.id === id);
  if (i >= 0) attempts[i] = { ...attempts[i], ...patch };
  return attempts[i];
}

export function getState() {
  return {
    timeline: [...timeline],
    attempts: [...attempts],
    chat: [...chat],
  };
}

export function pushChat(role: "user" | "assistant", content: string) {
  chat.push({ role, content, at: new Date().toISOString() });
  if (chat.length > 40) chat.shift();
}
