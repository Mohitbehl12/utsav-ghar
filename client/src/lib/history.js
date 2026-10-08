/**
 * Per-visitor browsing memory kept in this browser only: recently viewed
 * products (for "Recently viewed" and personal picks) and "Save for later".
 */
const read = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };
const V = 'ug_viewed';
const S = 'ug_saved';

export const viewedIds = () => read(V, []);
export function recordView(id) {
  const n = Number(id);
  if (!n) return;
  write(V, [n, ...viewedIds().filter((x) => x !== n)].slice(0, 30));
}
export const clearViewed = () => write(V, []);

export const savedItems = () => read(S, []);
export const setSavedItems = (list) => write(S, list.slice(0, 50));
