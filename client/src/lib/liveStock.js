/**
 * Real-time stock on product pages: asks the server for the current stock of the
 * given products every 20 s while the page is visible (and when the shopper
 * returns to the tab), so "Only 2 left" / "Sold out" stays true.
 */
import { useEffect, useState } from 'react';
import { api } from './api.js';

export function useLiveStock(ids) {
  const key = (ids || []).filter(Boolean).join(',');
  const [stock, setStock] = useState({});
  useEffect(() => {
    if (!key) return undefined;
    let live = true;
    const load = () => { if (!document.hidden) api.get(`/stock?ids=${key}`).then((r) => live && setStock(r.items || {})).catch(() => {}); };
    const t = setInterval(load, 20000);
    document.addEventListener('visibilitychange', load);
    return () => { live = false; clearInterval(t); document.removeEventListener('visibilitychange', load); };
  }, [key]);
  return stock;
}
