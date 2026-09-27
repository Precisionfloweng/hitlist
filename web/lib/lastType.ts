// Remembers the equipment type last picked (Equipment checklist <-> Rules), per browser.
const KEY = "hitlist:lastType";

export function saveLastType(key: string) {
  try { window.localStorage.setItem(KEY, key); } catch { /* storage blocked: just don't remember */ }
}

export function loadLastType(): string | null {
  try { return window.localStorage.getItem(KEY); } catch { return null; }
}
