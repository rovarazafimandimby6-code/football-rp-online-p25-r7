const MAX_CLOCK_SKEW_SECONDS = 300;
function toHex(bytes) { return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, "0")).join(""); }
function parseSignature(value) {
  if (typeof value !== "string" || value.length > 160) return null;
  const match = value.match(/^t=(\d{10}),v1=([a-f0-9]{64})$/i);
  return match ? { timestamp: Number(match[1]), signature: match[2].toLowerCase() } : null;
}
/** Verify timestamped HMAC-SHA256 over the exact raw request body. */
export async function verifyCareerIngestSignature(secret, rawBody, header, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof secret !== "string" || secret.length < 32 || typeof rawBody !== "string") return false;
  const parsed = parseSignature(header);
  if (!parsed || !Number.isSafeInteger(nowSeconds) || Math.abs(nowSeconds - parsed.timestamp) > MAX_CLOCK_SKEW_SECONDS) return false;
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(parsed.timestamp + "." + rawBody));
    const expected = toHex(digest);
    let difference = 0;
    for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ parsed.signature.charCodeAt(index);
    return difference === 0;
  } catch { return false; }
}
