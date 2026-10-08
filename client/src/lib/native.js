/**
 * Bridges to the Utsav Ghar iPhone / Android app (Capacitor, see /mobile).
 * The app loads this same website; when it runs inside the app, Capacitor
 * injects window.Capacitor with the native plugins. On the normal website
 * every helper falls back to plain browser behaviour.
 */
const cap = () => (typeof window !== 'undefined' ? window.Capacitor : null);
export const plugin = (name) => cap()?.Plugins?.[name] || null;

export const isApp = () => !!cap()?.isNativePlatform?.();
export const appPlatform = () => (isApp() ? cap().getPlatform() : 'web'); // 'ios' | 'android' | 'web'
export const isIOS = () => appPlatform() === 'ios' || (typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent));

/** Open a link outside the app: web pages in the in-app browser sheet, other schemes (upi:, tel:) in their apps. */
export async function openExternal(url) {
  if (isApp()) {
    try {
      if (/^https?:/i.test(url) && plugin('Browser')) { await plugin('Browser').open({ url }); return true; }
      if (plugin('AppLauncher')) { const r = await plugin('AppLauncher').openUrl({ url }); if (r?.completed !== false) return true; }
    } catch { /* fall through */ }
  }
  if (/^https?:/i.test(url)) window.open(url, '_blank', 'noopener');
  else window.location.href = url;
  return true;
}

export async function haptic(style = 'LIGHT') {
  try { await plugin('Haptics')?.impact({ style }); } catch { /* not in app */ }
}

/** Share a product link (native share sheet in the app and on phones; copies the link elsewhere). */
export async function shareLink({ title, text, url }) {
  try {
    if (isApp() && plugin('Share')) { await plugin('Share').share({ title, text, url, dialogTitle: 'Share' }); return 'shared'; }
    if (navigator.share) { await navigator.share({ title, text, url }); return 'shared'; }
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch (e) {
    return e?.name === 'AbortError' || /cancel/i.test(e?.message || '') ? 'cancelled' : 'failed';
  }
}

/**
 * iPhones have no system chooser for upi:// links, so each UPI app is opened
 * by its own link. Android shows its own chooser for upi://.
 */
export function upiAppLinks(upiUrl) {
  const q = upiUrl.split('?')[1] || '';
  return [
    { name: 'Google Pay', url: `gpay://upi/pay?${q}` },
    { name: 'PhonePe', url: `phonepe://pay?${q}` },
    { name: 'Paytm', url: `paytmmp://pay?${q}` },
    { name: 'Other UPI app', url: upiUrl },
  ];
}

/** One-time app setup: status bar, Android back button, deep links, external links. */
export function initApp(navigate) {
  if (!isApp()) return () => {};
  document.documentElement.classList.add('is-app', `is-app-${appPlatform()}`);
  const offs = [];
  const App = plugin('App');
  try { plugin('StatusBar')?.setStyle({ style: 'DARK' }); } catch { /* ignore */ }
  if (App) {
    // Android hardware back: go back in the store, or leave the app from the home page.
    App.addListener('backButton', ({ canGoBack }) => { if (canGoBack && window.location.pathname !== '/') window.history.back(); else App.exitApp(); }).then((h) => offs.push(h));
    // Links like https://www.utsavghar.in/shop/... opened from WhatsApp or Instagram.
    App.addListener('appUrlOpen', ({ url }) => {
      try { const u = new URL(url); if (/utsavghar\.in$/i.test(u.hostname)) navigate(u.pathname + u.search + u.hash); } catch { /* ignore */ }
    }).then((h) => offs.push(h));
  }
  // Links to other sites (Instagram, YouTube…) open in the in-app browser instead of replacing the store.
  const onClick = (e) => {
    const a = e.target.closest?.('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!/^(https?:|upi:|tel:|mailto:|whatsapp:)/i.test(href)) return;
    try { if (/^https?:/i.test(href) && new URL(href).hostname === window.location.hostname) return; } catch { return; }
    e.preventDefault();
    openExternal(href);
  };
  document.addEventListener('click', onClick);
  return () => { document.removeEventListener('click', onClick); offs.forEach((h) => h.remove?.()); };
}
