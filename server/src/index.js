import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import './db.js';
import { csrf, loadUser, adminGate } from './lib/auth.js';
import { errorHandler, HttpError } from './lib/http.js';
import { PUBLIC_DIR } from './lib/uploads.js';
import publicRoutes from './routes/public.js';
import { dealerOnboardingApi, adminDealerVerification, adminLegal } from './routes/legal.js';
import accountRoutes from './routes/account.js';
import orderRoutes, { razorpayWebhook } from './routes/orders.js';
import adminRoutes from './routes/admin.js';
import { publicCrm, adminCrm } from './routes/crm.js';
import { publicSupport, adminSupport } from './routes/support.js';
import { publicAi, adminAi } from './routes/ai.js';
import { dealerApi, adminDealers } from './routes/dealer.js';
import { adminTracking, courierWebhook } from './routes/tracking.js';
import { dealerProductApi, adminDealerProducts } from './routes/dealerProducts.js';
import { adminPricing } from './routes/pricing.js';
import { startDealerSweep } from './lib/dealers.js';
import { clearCatalogue } from './lib/recommend.js';
import { startCrmJob } from './lib/crm.js';
import { startBackupJob } from './lib/backup.js';
import { sitemap, robots, renderIndex } from './seo.js';
import { startReminderJob } from './lib/reminders.js';
import { startLegalJob } from './lib/compliance.js';

const app = express();
app.set('trust proxy', 1); // behind Nginx / Render / Railway TLS terminator
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        // Razorpay checkout, Meta Pixel and Google Analytics 4 (loaded only when their IDs are set in Admin)
        'script-src': ["'self'", 'https://checkout.razorpay.com', 'https://connect.facebook.net', 'https://www.googletagmanager.com'],
        'frame-src': ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com'],
        'connect-src': ["'self'", 'https://lumberjack.razorpay.com', 'https://api.razorpay.com', 'https://www.facebook.com', 'https://connect.facebook.net',
          'https://www.google-analytics.com', 'https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://www.googletagmanager.com'],
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'frame-ancestors': ["'none'"], // nobody can put the site in a frame (clickjacking)
        'form-action': ["'self'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'upgrade-insecure-requests': config.isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    frameguard: { action: 'deny' },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  })
);
app.use(compression());

// Force HTTPS in production (TLS terminated at the proxy).
if (config.isProd) {
  app.use((req, res, next) => (req.secure ? next() : res.redirect(301, `https://${req.headers.host}${req.originalUrl}`)));
}

// Dev CORS for the Vite dev server (in production the API and site share an origin).
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && config.corsOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token, X-Order-Token');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.set('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Webhook needs the raw body for signature verification — mount before JSON parser.
app.post('/api/payments/webhook/razorpay', (req, res, next) => { res.on('finish', clearCatalogue); next(); }, express.raw({ type: 'application/json', limit: '1mb' }), razorpayWebhook);

app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

// ---- rate limits --------------------------------------------------------------
const limiter = (windowMin, max, message, skip) =>
  rateLimit({ windowMs: windowMin * 60e3, max, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: message }, skip });
const readsOnly = (req) => req.method === 'GET';
app.use('/api/', limiter(1, 300, 'Too many requests. Please slow down.'));
// Sign-in throttling per IP (failed attempts only); each account also locks itself after 5 wrong tries (lib/security.js).
const authLimiter = (max) => rateLimit({ windowMs: 15 * 60e3, max, standardHeaders: 'draft-7', legacyHeaders: false, skipSuccessfulRequests: true, message: { error: 'Too many sign-in attempts. Try again in 15 minutes.' } });
app.use(['/api/auth/login', '/api/auth/register'], authLimiter(20));
app.use(['/api/auth/register/otp', '/api/auth/password/forgot', '/api/auth/password/reset', '/api/account/email/otp', '/api/dealer/password/forgot', '/api/dealer/password/reset'], limiter(10, 15, 'Too many code requests. Please wait a few minutes.'));
app.use(['/api/admin/login', '/api/admin/login/2fa'], authLimiter(10));
app.use(['/api/dealer/login', '/api/dealer/me/password'], authLimiter(10));
app.use(['/api/dealer/register'], authLimiter(10));
app.use('/api/dealer/onboarding/sign', limiter(10, 20, 'Too many signing attempts. Please wait a few minutes.'));
app.use('/api/dealer/onboarding/documents', limiter(10, 60, 'Too many uploads. Please wait a few minutes.', readsOnly));
app.use('/api/dealer/products', limiter(10, 60, 'Too many product updates. Please wait a few minutes.', readsOnly));
app.use(['/api/account/password', '/api/admin/me/password', '/api/admin/me/2fa/enable', '/api/admin/me/2fa/disable'], authLimiter(10));
app.use('/api/orders', limiter(10, 30, 'Too many order attempts. Please wait a few minutes.', readsOnly));
app.use('/api/orders/track', limiter(10, 20, 'Too many tracking lookups. Please wait a few minutes.'));
app.use('/api/events', limiter(1, 120, 'Too many events.'));
app.use('/api/webhooks/courier', limiter(1, 120, 'Too many webhook calls.'));
app.use('/api/subscribe', limiter(10, 20, 'Too many requests. Please wait a few minutes.'));
app.use('/api/assistant', limiter(1, 30, 'Too many questions. Please wait a minute.'));
app.use('/api/support/tickets', limiter(10, 30, 'Too many requests. Please wait a few minutes.', readsOnly));
app.use('/api/checkout/session', limiter(10, 40, 'Too many requests. Please wait a few minutes.'));

// Browser features the site may use: microphone only for voice shopping on our own pages.
app.use((req, res, next) => {
  res.set('Permissions-Policy', 'microphone=(self), camera=(), geolocation=(), payment=(self "https://checkout.razorpay.com" "https://api.razorpay.com"), usb=(), interest-cohort=()');
  next();
});
// security.txt: tells researchers how to report a problem responsibly.
app.get(['/.well-known/security.txt', '/security.txt'], (req, res) => {
  res.type('text/plain').send(`Contact: mailto:${process.env.SECURITY_EMAIL || 'security@utsavghar.in'}\nExpires: ${new Date(Date.now() + 365 * 864e5).toISOString()}\nPreferred-Languages: en, hi\nCanonical: ${config.publicUrl}/.well-known/security.txt\n`);
});
app.use(csrf);
app.use(loadUser);

app.get('/api/health', (req, res) => res.json({ ok: true }));
// writes that can change price or stock refresh the catalogue snapshot as soon as they finish
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && /^\/(admin|orders|checkout|payments|webhooks|razorpay|cart\/reserve|dealer)/.test(req.path)) res.on('finish', clearCatalogue);
  next();
});
app.use('/api', publicRoutes);
app.use('/api', publicCrm);
app.use('/api', publicSupport);
app.use('/api', publicAi);
app.use('/api', dealerOnboardingApi);
app.use('/api', dealerApi);
app.use('/api', dealerProductApi);
app.use('/api', courierWebhook);
app.use('/api', accountRoutes);
app.use('/api', orderRoutes);
app.use('/api/admin', adminGate);
app.use('/api/admin', (req, res, next) => (/^\/(crm|subscribers)(\/|$)/.test(req.path) ? adminCrm(req, res, next) : next()));
app.use('/api/admin', (req, res, next) => (/^\/support(\/|$)/.test(req.path) ? adminSupport(req, res, next) : next()));
app.use('/api/admin', (req, res, next) => (/^\/ai(\/|$)/.test(req.path) ? adminAi(req, res, next) : next()));
app.use('/api/admin', (req, res, next) => (/^\/(dealers|dealer-orders|dealers-settings)(\/|$)|^\/orders\/\d+\/dealer$/.test(req.path) ? adminDealers(req, res, next) : next()));
app.use('/api/admin', (req, res, next) => (/^\/tracking(\/|$)/.test(req.path) ? adminTracking(req, res, next) : next()));
app.use('/api/admin', (req, res, next) => (/^\/dealer-products/.test(req.path) ? adminDealerProducts(req, res, next) : next()));
app.use('/api/admin', (req, res, next) => (/^\/pricing(\/|$)/.test(req.path) ? adminPricing(req, res, next) : next()));
app.use('/api/admin', (req, res, next) => (/^\/dealer-verification(\/|$)/.test(req.path) ? adminDealerVerification(req, res, next) : next()));
app.use('/api/admin', (req, res, next) => (/^\/legal(\/|$)/.test(req.path) ? adminLegal(req, res, next) : next()));
app.use('/api/admin', adminRoutes);
app.use('/api', (req, res, next) => next(new HttpError(404, 'Not found')));

// Public uploads (product images, QR). Payment screenshots are NOT here.
app.use('/uploads', express.static(PUBLIC_DIR, { maxAge: '30d', immutable: true, fallthrough: false }));

app.get('/sitemap.xml', sitemap);
// App links: let www.utsavghar.in pages open inside the Utsav Ghar iPhone / Android app.
// Set APPLE_TEAM_ID and ANDROID_SHA256_CERT (comma-separated) in .env once the apps are signed.
app.get(['/.well-known/apple-app-site-association', '/apple-app-site-association'], (req, res) => {
  const team = process.env.APPLE_TEAM_ID;
  if (!team) return res.status(404).end();
  res.type('application/json').send(JSON.stringify({ applinks: { details: [{ appIDs: [`${team}.${process.env.APP_ID || 'in.utsavghar.app'}`], components: [{ '/': '/admin*', exclude: true }, { '/': '/*' }] }] } }));
});
app.get('/.well-known/assetlinks.json', (req, res) => {
  const certs = (process.env.ANDROID_SHA256_CERT || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!certs.length) return res.status(404).end();
  res.json([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: process.env.APP_ID || 'in.utsavghar.app', sha256_cert_fingerprints: certs } }]);
});
app.get('/robots.txt', robots);

// Serve the built React app with long-lived caching for hashed assets.
if (fs.existsSync(config.clientDist)) {
  app.use('/assets', express.static(path.join(config.clientDist, 'assets'), { maxAge: '1y', immutable: true }));
  app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
  app.get('*', renderIndex);
}

app.use(errorHandler);

startReminderJob();
startCrmJob();
startDealerSweep();
startLegalJob();
startBackupJob();

app.listen(config.port, () => {
  console.log(`🪔 Utsav Ghar API running on http://localhost:${config.port}`);
  if (config.testMode) console.warn('⚠️  TEST MODE is ON: one-time codes are shown on screen. Never use this for real customers.');
});

export default app;
