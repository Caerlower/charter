import { createHash } from "node:crypto";

/** Recursively sort object keys (lexicographic) per RFC 8785-style canonical JSON. */
export function sortKeys(val: unknown): unknown {
  if (val === null || typeof val !== "object") return val;
  if (Array.isArray(val)) return val.map(sortKeys);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(val as object).sort()) {
    sorted[key] = sortKeys((val as Record<string, unknown>)[key]);
  }
  return sorted;
}

export function cartHash(contentsObj: object): string {
  const canonical = JSON.stringify(sortKeys(contentsObj));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function bodyHash(bodyStr: string): string {
  return createHash("sha256").update(bodyStr, "utf8").digest("hex");
}

export function sha256CanonicalJson(obj: object): string {
  return cartHash(obj);
}
