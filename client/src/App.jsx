import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { initApp } from './lib/native.js';
import { AppProviders, useStore } from './state/store.jsx';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Shop from './pages/Shop.jsx';
import Product from './pages/Product.jsx';
import Cart from './pages/Cart.jsx';
import { CategoriesPage } from './components/AppShell.jsx';
import { Spinner } from './components/ui.jsx';
const UserManual = lazy(() => import('./components/UserManual.jsx'));

// Code-split everything that isn't on the main shopping path.
const Checkout = lazy(() => import('./pages/Checkout.jsx'));
const Order = lazy(() => import('./pages/Order.jsx'));
const Track = lazy(() => import('./pages/Track.jsx'));
const Account = lazy(() => import('./pages/Account.jsx'));
const AuthPage = lazy(() => import('./pages/Account.jsx').then((m) => ({ default: m.AuthPage })));
const ForgotPassword = lazy(() => import('./pages/Account.jsx').then((m) => ({ default: m.ForgotPassword })));
const HelpPage = lazy(() => import('./pages/Help.jsx').then((m) => ({ default: m.HelpPage })));
const TicketPage = lazy(() => import('./pages/Help.jsx').then((m) => ({ default: m.TicketPage })));
const GoPage = lazy(() => import('./pages/Messages.jsx').then((m) => ({ default: m.GoPage })));
const PreferencesPage = lazy(() => import('./pages/Messages.jsx').then((m) => ({ default: m.PreferencesPage })));
const OffersPage = lazy(() => import('./pages/Account.jsx').then((m) => ({ default: m.OffersPage })));
const InfoPage = lazy(() => import('./pages/Info.jsx').then((m) => ({ default: m.InfoPage })));
const PoliciesPage = lazy(() => import('./pages/Info.jsx').then((m) => ({ default: m.PoliciesPage })));
const PolicyPage = lazy(() => import('./pages/Info.jsx').then((m) => ({ default: m.PolicyPage })));
const Contact = lazy(() => import('./pages/Info.jsx').then((m) => ({ default: m.Contact })));
const NotFound = lazy(() => import('./pages/Info.jsx').then((m) => ({ default: m.NotFound })));
const SegmentPage = lazy(() => import('./pages/Section.jsx').then((m) => ({ default: m.SegmentPage })));
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));
const DealerApp = lazy(() => import('./dealer/DealerApp.jsx'));

// The preview runs inside viewers that lock down the page address (sandboxed frames),
// where address-bar routing crashes. So the demo keeps its route in memory and only
// mirrors it to the #hash when the browser allows it.
const ANCHORS = { dealer: '/dealer', admin: '/admin', profit: '/admin/profit', products: '/admin/products', newproduct: '/admin/products/new', orders: '/admin/orders', photos: '/admin/photos', marketing: '/admin/marketing' };
function startPath() {
  try {
    if (typeof window !== 'undefined' && window.__UG_START__) return window.__UG_START__; // e.g. a preview that opens straight into the dealer app
    const h = decodeURIComponent(window.location.hash || '').replace(/^#/, '');
    if (ANCHORS[h]) return ANCHORS[h];
    // The preview always opens on the main page (a remembered #/admin… from last time is ignored);
    // shared links like #/shop/... still work.
    return h.startsWith('/') && !/^\/(admin|dealer)(\/|$)/.test(h) ? h : '/';
  } catch { return '/'; }
}
function HashSync() {
  const loc = useLocation();
  useEffect(() => {
    try {
      const h = `#${loc.pathname}${loc.search}`;
      if (window.location.hash !== h) window.history.replaceState(null, '', h);
    } catch { /* locked-down frame: keep the route in memory only */ }
  }, [loc.pathname, loc.search]);
  return null;
}
function DemoRouter({ children }) {
  return <MemoryRouter initialEntries={[startPath()]}><HashSync />{children}</MemoryRouter>;
}
const Router = __DEMO__ ? DemoRouter : BrowserRouter;

/** Native app hooks (back button, deep links, external links) when running inside the Utsav Ghar app. */
function NativeBridge() {
  const navigate = useNavigate();
  useEffect(() => initApp(navigate), [navigate]);
  return null;
}
/** A test deployment says so on every page, so nobody mistakes it for the real shop. */
function TestModeBanner() {
  const { settings } = useStore();
  if (!settings?.test_mode) return null;
  return <div className="testmode" role="note"><b>TEST MODE</b><span className="testmode__long"> — test website. Codes are shown on screen, payments and messages are not real, and data may be reset. Do not enter real personal or payment details.</span><span className="testmode__short"> — not a real shop. Do not enter real personal or payment details.</span></div>;
}
const Wait = () => <div className="container center pad"><Spinner /></div>;

export default function App() {
  return (
    <Router>
      <NativeBridge />
      <AppProviders>
        <TestModeBanner />
        <Suspense fallback={<Wait />}>
          <Routes>
            <Route path="/admin/*" element={<AdminApp />} />
            <Route path="/dealer/*" element={<DealerApp />} />
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="shop" element={<Shop />} />
              <Route path="shop/:category" element={<Shop />} />
              <Route path="shop/:category/:slug" element={<Product />} />
              <Route path="s/:segment" element={<SegmentPage />} />
              <Route path="categories" element={<CategoriesPage />} />
              <Route path="cart" element={<Cart />} />
              <Route path="checkout" element={<Checkout />} />
              <Route path="order/:number" element={<Order />} />
              <Route path="track" element={<Track />} />
              <Route path="offers" element={<OffersPage />} />
              <Route path="login" element={<AuthPage mode="login" />} />
              <Route path="register" element={<AuthPage mode="register" />} />
              <Route path="forgot-password" element={<ForgotPassword />} />
              <Route path="account" element={<Account />} />
              <Route path="account/:tab" element={<Account />} />
              <Route path="contact" element={<Contact />} />
              <Route path="help" element={<HelpPage />} />
              <Route path="help/requests/:number" element={<TicketPage />} />
              <Route path="help/manual" element={<Suspense fallback={<Spinner />}><UserManual kind="customer" /></Suspense>} />
              <Route path="go/:code" element={<GoPage />} />
              <Route path="go/:code/:slug" element={<GoPage />} />
              <Route path="preferences/:token" element={<PreferencesPage />} />
              <Route path="policies" element={<PoliciesPage />} />
              <Route path="policies/:kind" element={<PolicyPage />} />
              {['about', 'faq', 'shipping', 'returns', 'privacy', 'terms'].map((p) => <Route key={p} path={p} element={<InfoPage page={p} />} />)}
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </AppProviders>
    </Router>
  );
}
