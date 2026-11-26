/**
 * Thin localStorage wrapper. All saved data lives under a single namespaced key per
 * slice (e.g. "wikiliminal:player"), as JSON, with a `version` field so later phases
 * can detect and migrate old saves instead of silently misreading them.
 *
 * localStorage can throw (private browsing, quota exceeded, disabled storage), so every
 * call is wrapped; a failed save or load should never crash the game, just skip silently.
 */
const PREFIX = 'wikiliminal:';

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
}

export function saveJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // storage unavailable or full: progress just won't persist this session
  }
}

export function clearAll(): void {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith(PREFIX))
      .forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}
