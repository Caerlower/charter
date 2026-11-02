import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import type { Charter, VendorOffer } from "./types.js";
import { saveOffer } from "./store.js";

export function searchVendorOffers(charter: Charter, category: "hotel" | "flight"): VendorOffer[] {
  const city = charter.constraints.city || "Tokyo";
  const nights = charter.constraints.nights || 3;
  const budget = Number(charter.budgetUsdc);
  const maxPay = Number(charter.maxPerPaymentUsdc);
  const results: VendorOffer[] = [];

  if (category === "hotel") {
    const capsuleTotal = Math.min(maxPay * 0.85, budget * 0.55, Math.max(90, 55 * nights));
    const nestTotal = Math.max(maxPay * 1.2, capsuleTotal * 1.5);
    results.push(
      makeOffer(charter, {
        category: "hotel",
        vendorAgent: "HotelAgent",
        merchantId: "CapsulePrime",
        merchantName: "Capsule Prime",
        title: `${city} · Capsule Prime (${nights} nights)`,
        description: `Budget capsule · ${charter.constraints.checkIn} → ${charter.constraints.checkOut}`,
        amount: capsuleTotal.toFixed(2),
        meta: {
          city,
          nights,
          checkIn: charter.constraints.checkIn,
          checkOut: charter.constraints.checkOut,
          neighborhood: "Central",
          perNightUsdc: Math.round(capsuleTotal / nights),
        },
      }),
      makeOffer(charter, {
        category: "hotel",
        vendorAgent: "HotelAgent",
        merchantId: "ShibuyaNest",
        merchantName: "Shibuya Nest Hotels",
        title: `${city} · Nest Stay (${nights} nights)`,
        description: `Boutique stay · ${charter.constraints.checkIn} → ${charter.constraints.checkOut}`,
        amount: nestTotal.toFixed(2),
        meta: {
          city,
          nights,
          checkIn: charter.constraints.checkIn,
          checkOut: charter.constraints.checkOut,
          neighborhood: "Center",
          perNightUsdc: Math.round(nestTotal / nights),
        },
      }),
    );
  }

  if (category === "flight") {
    const economy = Math.min(maxPay * 0.9, budget * 0.45, 220);
    const premium = Math.max(maxPay * 1.5, budget * 1.2, 920);
    results.push(
      makeOffer(charter, {
        category: "flight",
        vendorAgent: "FlightAgent",
        merchantId: "SkyBridge",
        merchantName: "SkyBridge Air",
        title: `Round-trip to ${city}`,
        description: `Economy · outbound ${charter.constraints.checkIn} · return ${charter.constraints.checkOut}`,
        amount: economy.toFixed(2),
        meta: {
          city,
          cabin: "economy",
          outbound: charter.constraints.checkIn,
          inbound: charter.constraints.checkOut,
        },
      }),
      makeOffer(charter, {
        category: "flight",
        vendorAgent: "FlightAgent",
        merchantId: "PacificHop",
        merchantName: "Pacific Hop",
        title: `Premium economy to ${city}`,
        description: `Premium economy · over max / merchant deny path`,
        amount: premium.toFixed(2),
        meta: {
          city,
          cabin: "premium",
          outbound: charter.constraints.checkIn,
          inbound: charter.constraints.checkOut,
        },
      }),
    );
  }

  return results.map(saveOffer);
}

function makeOffer(
  charter: Charter,
  input: {
    category: "hotel" | "flight";
    vendorAgent: string;
    merchantId: string;
    merchantName: string;
    title: string;
    description: string;
    amount: string;
    meta: Record<string, string | number>;
  },
): VendorOffer {
  return {
    offerId: `offer_${randomUUID().slice(0, 10)}`,
    charterId: charter.id,
    category: input.category,
    vendorAgent: input.vendorAgent,
    merchantId: input.merchantId,
    merchantName: input.merchantName,
    title: input.title,
    description: input.description,
    amount: input.amount,
    currency: "USD",
    payTo: config.payToAddress,
    token: config.usdc,
    chainId: config.chainId,
    meta: input.meta,
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    status: "open",
  };
}
