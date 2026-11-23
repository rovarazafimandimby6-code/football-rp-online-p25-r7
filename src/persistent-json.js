export function readJsonWithBackup(storage, key, normalize) {
  if (!storage?.getItem) return null;
  for (const candidate of [key, `${key}.backup`]) {
    try {
      const raw = storage.getItem(candidate);
      if (!raw) continue;
      const value = normalize(JSON.parse(raw));
      if (value === null || value === undefined) continue;
      if (candidate !== key) { try { storage.setItem(key, JSON.stringify(value)); } catch (_) {} }
      return value;
    } catch (_) {}
  }
  return null;
}

export function writeJsonWithBackup(storage, key, value, normalize) {
  if (!storage?.setItem) return false;
  const normalized = normalize(value);
  if (normalized === null || normalized === undefined) return false;
  try {
    const current = storage.getItem?.(key);
    if (current) {
      try { if (normalize(JSON.parse(current)) !== null) storage.setItem(`${key}.backup`, current); } catch (_) {}
    }
    storage.setItem(key, JSON.stringify(normalized));
    return true;
  } catch (_) { return false; }
}
