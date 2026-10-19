/** Where each tab of a phone page was read to, per browser tab (sessionStorage). */

const PREFIX = "vibe:tab-scroll:";

export function scrollMemoryKey(pageKey: string): string {
  return PREFIX + pageKey;
}

/** Only whole, non-negative numbers survive; anything else is no memory. */
export function parseScrollMemory(raw: string | null): Record<string, number> {
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, number> = {};
    for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
      if (typeof n === "number" && Number.isFinite(n) && n >= 0) out[k] = Math.round(n);
    }
    return out;
  } catch {
    return {};
  }
}

export function readScrollMemory(key: string): Record<string, number> {
  try {
    return parseScrollMemory(window.sessionStorage.getItem(key));
  } catch {
    return {};
  }
}

export function writeScrollMemory(key: string, map: Record<string, number>): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(map));
  } catch {
    // Private mode or a full store: the page still works, it just forgets.
  }
}
