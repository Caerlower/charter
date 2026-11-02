import { createHmac, createPrivateKey, randomUUID, sign as cryptoSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { cartHash } from "./canonical.js";
import { config } from "../config.js";

function loadMerchantKey() {
  if (config.merchantPrivateKeyPem) {
    return createPrivateKey(config.merchantPrivateKeyPem);
  }
  if (config.merchantPrivateKeyPath) {
    const pem = readFileSync(config.merchantPrivateKeyPath, "utf8");
    return createPrivateKey(pem);
  }
  return null;
}

/** ES256K merchant_authorization JWT; mock signature when no PEM is configured. */
export function signMerchantJwt(contentsObj: object): string {
  const hash = cartHash(contentsObj);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256K", typ: "JWT" };
  const payload = {
    iss: config.merchantName,
    sub: config.merchantName,
    aud: "HashkeyMerchant",
    iat: now,
    exp: now + 3600,
    jti: `JWT-${now}-${randomUUID().replace(/-/g, "").slice(0, 8)}`,
    cart_hash: hash,
  };

  const b64Header = Buffer.from(JSON.stringify(header)).toString("base64url");
  const b64Payload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const dataToSign = `${b64Header}.${b64Payload}`;

  const key = loadMerchantKey();
  if (!key) {
    // Deterministic mock signature when no PEM is configured
    const sig = Buffer.from(`mock-es256k:${hash}`).toString("base64url");
    return `${dataToSign}.${sig}`;
  }

  const signature = cryptoSign("sha256", Buffer.from(dataToSign), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  return `${dataToSign}.${signature.toString("base64url")}`;
}

export function buildHs256Jwt(payload: object, keyBytes: Buffer): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  );
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", keyBytes)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}
