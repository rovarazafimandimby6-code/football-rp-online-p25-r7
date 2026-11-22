/** Conservative render policy for entry-level Android devices. */
export function chooseRenderProfile({ hardwareConcurrency = 4, deviceMemory = 2, pixelRatio = 1 } = {}) {
  const cores = Number.isFinite(hardwareConcurrency) ? hardwareConcurrency : 4;
  const memory = Number.isFinite(deviceMemory) ? deviceMemory : 2;
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  const lowEnd = cores <= 4 || memory <= 3;
  return {
    tier: lowEnd ? 'low' : 'standard',
    pixelRatio: Math.min(ratio, lowEnd ? 1.05 : 1.5),
    shadows: !lowEnd,
    antialias: !lowEnd,
    targetFps: lowEnd ? 30 : 60
  };
}

/** Resolves explicit quality or device-adaptive automatic quality. */
export function resolveRenderProfile(level = 'auto', device = {}) {
  const detected = chooseRenderProfile(device);
  const ratio = Number.isFinite(device.pixelRatio) && device.pixelRatio > 0 ? device.pixelRatio : 1;
  if (level === 'auto') {
    return detected.tier === 'low'
      ? { ...detected, quality: 'low' }
      : { ...detected, quality: 'medium', pixelRatio: Math.min(ratio, 1.35), shadows: false };
  }
  if (level === 'low') return { ...detected, quality: 'low', pixelRatio: Math.min(ratio, 1.0), shadows: false, antialias: false, targetFps: 30 };
  if (level === 'high') return { ...detected, quality: 'high', pixelRatio: Math.min(ratio, detected.tier === 'low' ? 1.1 : 1.5), shadows: detected.tier !== 'low', antialias: detected.tier !== 'low', targetFps: detected.tier === 'low' ? 30 : 60 };
  return { ...detected, quality: 'medium', pixelRatio: Math.min(ratio, detected.tier === 'low' ? 1.05 : 1.35), shadows: false, antialias: false };
}
