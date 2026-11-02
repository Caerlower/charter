import { Contract, JsonRpcProvider, Wallet, id } from "ethers";
import { config } from "../config.js";

const VAULT_ABI = [
  "function credit(address agent, uint128 amount)",
  "function fund(address agent, uint128 amount)",
  "function setPolicy(address agent, uint128 maxPerPayment, uint128 dailyCap, uint128 totalCap, uint64 expiresAt, bool frozen)",
  "function setMerchantAllowed(address agent, address merchant, bool allowed)",
  "function checkAuthorization(address agent, address merchant, uint128 amount) view returns (bool ok, string reason)",
  "function authorize(address agent, address merchant, uint128 amount, bytes32 mandateId) returns (uint128 remainingBalance)",
  "function recordSettlement(address agent, address merchant, uint128 amount, bytes32 mandateId, bytes32 paymentRef, bytes32 settleTxHash) returns (uint256 receiptId)",
  "function getAgent(address agent) view returns (uint128 balance, uint128 spentTotal, uint128 spentToday, uint64 dayStart, (uint128 maxPerPayment, uint128 dailyCap, uint128 totalCap, uint64 expiresAt, bool frozen, bool exists) policy)",
  "function merchantAllowed(address agent, address merchant) view returns (bool)",
  "function receiptCount() view returns (uint256)",
  "function getReceipt(uint256 id) view returns (address agent, address merchant, uint128 amount, bytes32 mandateId, bytes32 paymentRef, bytes32 settleTxHash, uint64 timestamp)",
  "function operators(address) view returns (bool)",
  "function owner() view returns (address)",
  "event PaymentAuthorized(address indexed agent, address indexed merchant, uint128 amount, bytes32 indexed mandateId, uint128 remainingBalance)",
  "event PaymentBlocked(address indexed agent, address indexed merchant, uint128 amount, bytes32 mandateId, string reason)",
  "event SettlementRecorded(uint256 indexed receiptId, address indexed agent, address indexed merchant, uint128 amount, bytes32 mandateId, bytes32 paymentRef)",
];

export type AgentView = {
  balance: string;
  spentTotal: string;
  spentToday: string;
  dayStart: number;
  policy: {
    maxPerPayment: string;
    dailyCap: string;
    totalCap: string;
    expiresAt: number;
    frozen: boolean;
    exists: boolean;
  };
};

/** In-memory vault when no VAULT_ADDRESS is configured. */
class MemoryVault {
  balance = 0n;
  spentTotal = 0n;
  spentToday = 0n;
  dayStart = 0;
  frozen = false;
  expiresAt = 0;
  maxPerPayment = 0n;
  dailyCap = 0n;
  totalCap = 0n;
  exists = false;
  merchants = new Set<string>();
  mandates = new Set<string>();
  receipts: Array<{
    agent: string;
    merchant: string;
    amount: bigint;
    mandateId: string;
    paymentRef: string;
    settleTxHash: string;
    timestamp: number;
  }> = [];

  private todayBucket() {
    const ts = Math.floor(Date.now() / 1000);
    return ts - (ts % 86400);
  }

  private ensureDay() {
    const today = this.todayBucket();
    if (this.dayStart !== today) {
      this.dayStart = today;
      this.spentToday = 0n;
    }
  }

  credit(amount: bigint) {
    this.ensureDay();
    this.balance += amount;
    this.exists = true;
  }

  setPolicy(p: {
    maxPerPayment: bigint;
    dailyCap: bigint;
    totalCap: bigint;
    expiresAt: number;
    frozen: boolean;
  }) {
    this.maxPerPayment = p.maxPerPayment;
    this.dailyCap = p.dailyCap;
    this.totalCap = p.totalCap;
    this.expiresAt = p.expiresAt;
    this.frozen = p.frozen;
    this.exists = true;
  }

  setMerchant(merchant: string, allowed: boolean) {
    const m = merchant.toLowerCase();
    if (allowed) this.merchants.add(m);
    else this.merchants.delete(m);
    this.exists = true;
  }

  check(merchant: string, amount: bigint): { ok: boolean; reason: string } {
    this.ensureDay();
    if (!this.exists) return { ok: false, reason: "agent_not_configured" };
    if (this.frozen) return { ok: false, reason: "agent_frozen" };
    if (this.expiresAt && Math.floor(Date.now() / 1000) > this.expiresAt)
      return { ok: false, reason: "policy_expired" };
    if (!this.merchants.has(merchant.toLowerCase()))
      return { ok: false, reason: "merchant_not_allowed" };
    if (this.maxPerPayment && amount > this.maxPerPayment)
      return { ok: false, reason: "exceeds_max_per_payment" };
    if (this.balance < amount) return { ok: false, reason: "insufficient_balance" };
    if (this.dailyCap && this.spentToday + amount > this.dailyCap)
      return { ok: false, reason: "exceeds_daily_cap" };
    if (this.totalCap && this.spentTotal + amount > this.totalCap)
      return { ok: false, reason: "exceeds_total_cap" };
    return { ok: true, reason: "" };
  }

  authorize(merchant: string, amount: bigint, mandateId: string) {
    if (this.mandates.has(mandateId)) throw new Error("mandate_already_used");
    const { ok, reason } = this.check(merchant, amount);
    if (!ok) throw Object.assign(new Error(reason), { code: reason });
    this.ensureDay();
    this.balance -= amount;
    this.spentToday += amount;
    this.spentTotal += amount;
    this.mandates.add(mandateId);
    return this.balance;
  }

  recordSettlement(input: {
    agent: string;
    merchant: string;
    amount: bigint;
    mandateId: string;
    paymentRef: string;
    settleTxHash: string;
  }) {
    this.receipts.push({ ...input, timestamp: Math.floor(Date.now() / 1000) });
    return this.receipts.length - 1;
  }

  view(): AgentView {
    this.ensureDay();
    return {
      balance: this.balance.toString(),
      spentTotal: this.spentTotal.toString(),
      spentToday: this.spentToday.toString(),
      dayStart: this.dayStart,
      policy: {
        maxPerPayment: this.maxPerPayment.toString(),
        dailyCap: this.dailyCap.toString(),
        totalCap: this.totalCap.toString(),
        expiresAt: this.expiresAt,
        frozen: this.frozen,
        exists: this.exists,
      },
    };
  }
}

const memory = new MemoryVault();

function provider() {
  return new JsonRpcProvider(config.vaultRpcUrl);
}

function ownerSigner() {
  return new Wallet(config.ownerPrivateKey, provider());
}

function operatorSigner() {
  // Defaults to owner key when a separate operator key is not configured
  return new Wallet(config.ownerPrivateKey, provider());
}

function onChain() {
  if (!config.vaultAddress) return null;
  return new Contract(config.vaultAddress, VAULT_ABI, provider());
}

export function usdcToUnits(amount: string | number): bigint {
  return BigInt(Math.round(Number(amount) * 1e6));
}

export function unitsToUsdc(units: bigint | string): string {
  const n = BigInt(units);
  const whole = n / 1_000_000n;
  const frac = (n % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

export function mandateIdBytes32(cartMandateId: string): string {
  return id(cartMandateId);
}

export function toBytes32(hexOrString: string): string {
  if (hexOrString.startsWith("0x") && hexOrString.length === 66) return hexOrString;
  return id(hexOrString);
}

export async function getAgentView(agent = config.agentAddress): Promise<AgentView> {
  const c = onChain();
  if (!c) return memory.view();
  const [balance, spentTotal, spentToday, dayStart, policy] = await c.getAgent(agent);
  return {
    balance: balance.toString(),
    spentTotal: spentTotal.toString(),
    spentToday: spentToday.toString(),
    dayStart: Number(dayStart),
    policy: {
      maxPerPayment: policy.maxPerPayment.toString(),
      dailyCap: policy.dailyCap.toString(),
      totalCap: policy.totalCap.toString(),
      expiresAt: Number(policy.expiresAt),
      frozen: policy.frozen,
      exists: policy.exists,
    },
  };
}

export async function isMerchantAllowed(merchant: string, agent = config.agentAddress) {
  const c = onChain();
  if (!c) return memory.merchants.has(merchant.toLowerCase());
  return Boolean(await c.merchantAllowed(agent, merchant));
}

export async function checkAuthorization(merchant: string, amountUnits: bigint, agent = config.agentAddress) {
  const c = onChain();
  if (!c) return memory.check(merchant, amountUnits);
  const [ok, reason] = await c.checkAuthorization(agent, merchant, amountUnits);
  return { ok: Boolean(ok), reason: String(reason) };
}

export async function authorizeOnChain(
  merchant: string,
  amountUnits: bigint,
  mandateId: string,
  agent = config.agentAddress,
) {
  const c = onChain();
  if (!c) {
    const remaining = memory.authorize(merchant, amountUnits, mandateId);
    return { remaining, txHash: `0xmem_${mandateId.slice(2, 10)}`, mode: "memory" as const };
  }
  const connected = c.connect(operatorSigner()) as Contract;
  const tx = await connected.authorize(agent, merchant, amountUnits, mandateIdBytes32(mandateId));
  const receipt = await tx.wait();
  return { remaining: 0n, txHash: receipt.hash as string, mode: "chain" as const };
}

export async function recordSettlementOnChain(input: {
  agent?: string;
  merchant: string;
  amountUnits: bigint;
  mandateId: string;
  paymentRef: string;
  settleTxHash: string;
}) {
  const agent = input.agent ?? config.agentAddress;
  const c = onChain();
  if (!c) {
    const id_ = memory.recordSettlement({
      agent,
      merchant: input.merchant,
      amount: input.amountUnits,
      mandateId: input.mandateId,
      paymentRef: input.paymentRef,
      settleTxHash: input.settleTxHash,
    });
    return { receiptId: id_, txHash: `0xmem_rcpt_${id_}`, mode: "memory" as const };
  }
  const connected = c.connect(operatorSigner()) as Contract;
  const tx = await connected.recordSettlement(
    agent,
    input.merchant,
    input.amountUnits,
    mandateIdBytes32(input.mandateId),
    toBytes32(input.paymentRef),
    toBytes32(input.settleTxHash),
  );
  const receipt = await tx.wait();
  return { receiptId: 0, txHash: receipt.hash as string, mode: "chain" as const };
}

export async function creditAgent(amountUsdc: number, agent = config.agentAddress) {
  const units = usdcToUnits(amountUsdc);
  const c = onChain();
  if (!c) {
    memory.credit(units);
    return { mode: "memory" as const, txHash: null };
  }
  const connected = c.connect(ownerSigner()) as Contract;
  const tx = await connected.credit(agent, units);
  const receipt = await tx.wait();
  return { mode: "chain" as const, txHash: receipt.hash as string };
}

export async function setPolicyOnChain(
  policy: {
    maxPerPayment: number;
    dailyCap: number;
    totalCap: number;
    expiresAt: number;
    frozen: boolean;
  },
  agent = config.agentAddress,
) {
  const c = onChain();
  const packed = {
    maxPerPayment: usdcToUnits(policy.maxPerPayment),
    dailyCap: usdcToUnits(policy.dailyCap),
    totalCap: usdcToUnits(policy.totalCap),
    expiresAt: policy.expiresAt,
    frozen: policy.frozen,
  };
  if (!c) {
    memory.setPolicy(packed);
    return { mode: "memory" as const, txHash: null };
  }
  const connected = c.connect(ownerSigner()) as Contract;
  const tx = await connected.setPolicy(
    agent,
    packed.maxPerPayment,
    packed.dailyCap,
    packed.totalCap,
    packed.expiresAt,
    packed.frozen,
  );
  const receipt = await tx.wait();
  return { mode: "chain" as const, txHash: receipt.hash as string };
}

export async function setMerchantOnChain(
  merchant: string,
  allowed: boolean,
  agent = config.agentAddress,
) {
  const c = onChain();
  if (!c) {
    memory.setMerchant(merchant, allowed);
    return { mode: "memory" as const, txHash: null };
  }
  const connected = c.connect(ownerSigner()) as Contract;
  const tx = await connected.setMerchantAllowed(agent, merchant, allowed);
  const receipt = await tx.wait();
  return { mode: "chain" as const, txHash: receipt.hash as string };
}

export function getMemoryReceipts() {
  return memory.receipts.map((r, i) => ({
    id: i,
    ...r,
    amount: r.amount.toString(),
  }));
}

export function vaultMode() {
  return config.vaultAddress ? "chain" : "memory";
}
