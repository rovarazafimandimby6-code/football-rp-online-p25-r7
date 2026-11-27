/** Small render scheduler: game simulation may update every RAF while GPU rendering is capped. */
export class RenderFramePacer {
  constructor(targetFps = 30) {
    this.lastFrameAt = null;
    this.setTargetFps(targetFps);
  }

  setTargetFps(value) {
    const fps = Number(value);
    this.targetFps = Number.isFinite(fps) ? Math.max(15, Math.min(120, fps)) : 30;
    this.intervalMs = 1000 / this.targetFps;
    this.lastFrameAt = null;
    return this.targetFps;
  }

  shouldRender(nowMs) {
    if (!Number.isFinite(nowMs)) return true;
    if (this.lastFrameAt === null || nowMs < this.lastFrameAt) {
      // A reset/backward clock must not stall rendering until the old timestamp is reached.
      this.lastFrameAt = nowMs;
      return true;
    }
    const elapsed = nowMs - this.lastFrameAt;
    if (elapsed < this.intervalMs - 0.5) return false;
    // Keep the cadence stable without attempting to render multiple catch-up frames.
    this.lastFrameAt = nowMs;
    return true;
  }

  reset() {
    this.lastFrameAt = null;
  }
}
