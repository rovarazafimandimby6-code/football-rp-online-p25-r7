import { createHmac } from "node:crypto";

/** Sends authoritative finalized match events to the authenticated Cloudflare D1 relay. */
export class CareerSyncService {
  constructor(queue, {
    url = process.env.P27_CAREER_SYNC_URL || "",
    secret = process.env.P27_MATCH_INGEST_SECRET || "",
    fetchImpl = globalThis.fetch,
    now = () => Date.now(),
    intervalMs = 15_000,
    batchSize = 25,
  } = {}) {
    this.queue = queue;
    this.url = String(url || "").trim();
    this.secret = String(secret || "");
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.intervalMs = Math.max(5_000, Math.min(5 * 60_000, Number(intervalMs) || 15_000));
    this.batchSize = Math.max(1, Math.min(100, Number(batchSize) || 25));
    this.timer = null;
    this.running = false;
  }

  get configured() {
    if (typeof this.fetchImpl !== "function" || this.secret.length < 32 || !this.url) return false;
    try {
      const url = new URL(this.url);
      return url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1";
    } catch { return false; }
  }

  signature(rawBody, timestamp) {
    const digest = createHmac("sha256", this.secret).update(timestamp + "." + rawBody).digest("hex");
    return "t=" + timestamp + ",v1=" + digest;
  }

  async flush() {
    if (!this.configured) return { disabled: true, sent: 0, failed: 0 };
    if (this.running) return { skipped: true, sent: 0, failed: 0 };
    this.running = true;
    let sent = 0, failed = 0;
    try {
      const pending = this.queue.listDue({ limit: this.batchSize, now: this.now() });
      for (const item of pending) {
        const rawBody = JSON.stringify({ accountId: item.accountId, playerId: item.playerId, match: item.payload });
        const timestamp = Math.floor(this.now() / 1000);
        try {
          const response = await this.fetchImpl(this.url, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-p27-signature": this.signature(rawBody, timestamp),
            },
            body: rawBody,
            signal: AbortSignal.timeout(10_000),
          });
          let acknowledgement = null;
          try { acknowledgement = await response.json(); } catch {}
          if (response.ok && acknowledgement?.accepted === true) {
            this.queue.acknowledge(item.accountId, item.matchId);
            sent++;
          } else {
            this.queue.markAttempt(item.accountId, item.matchId);
            failed++;
          }
        } catch {
          this.queue.markAttempt(item.accountId, item.matchId);
          failed++;
        }
      }
      return { sent, failed, remaining: this.queue.pendingCount };
    } finally {
      this.running = false;
    }
  }

  start() {
    if (this.timer || !this.configured) return false;
    this.timer = setInterval(() => { this.flush().catch(() => {}); }, this.intervalMs);
    this.timer.unref?.();
    this.flush().catch(() => {});
    return true;
  }

  stop() {
    if (!this.timer) return false;
    clearInterval(this.timer);
    this.timer = null;
    return true;
  }
}
