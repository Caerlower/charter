import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { bodyHash } from "./canonical.js";

export function buildHmacHeaders(opts: {
  method: string;
  path: string;
  query?: string;
  body?: string;
  appKey: string;
  appSecret: string;
}): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomUUID().replace(/-/g, "");
  const hash = opts.body ? bodyHash(opts.body) : "";
  const message = [
    opts.method.toUpperCase(),
    opts.path,
    opts.query ?? "",
    hash,
    timestamp,
    nonce,
  ].join("\n");

  const signature = createHmac("sha256", opts.appSecret)
    .update(message, "utf8")
    .digest("hex");

  return {
    "X-App-Key": opts.appKey,
    "X-Timestamp": timestamp,
    "X-Nonce": nonce,
    "X-Signature": signature,
  };
}

export function verifyWebhookSignature(
  signatureHeader: string,
  rawBody: Buffer | string,
  appSecret: string,
): boolean {
  let ts: string | null = null;
  let received: string | null = null;

  for (const part of signatureHeader.split(",")) {
    if (part.startsWith("t=")) ts = part.slice(2);
    else if (part.startsWith("v1=")) received = part.slice(3);
  }
  if (!ts || !received) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(ts, 10)) > 300) return false;

  const message = `${ts}.${typeof rawBody === "string" ? rawBody : rawBody.toString("utf8")}`;
  const expected = createHmac("sha256", appSecret)
    .update(message, "utf8")
    .digest("hex");

  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
  } catch {
    return false;
  }
}
