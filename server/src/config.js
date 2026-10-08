import 'dotenv/config';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isProd = process.env.NODE_ENV === 'production';

function secret(name) {
  const v = process.env[name];
  if (v && v.length >= 32) return v;
  if (isProd) {
    console.error(`FATAL: ${name} must be set to a random string of 32+ characters in production.`);
    process.exit(1);
  }
  return crypto.randomBytes(32).toString('hex'); // dev only — sessions reset on restart
}

export const config = {
  isProd,
  root,
  port: Number(process.env.PORT || 4000),
  // Sign-up needs a one-time code sent to the mobile/email (SIGNUP_OTP=off to switch off, e.g. before SMS/email is set up)
  signupOtp: !/^(off|0|false|no)$/i.test(process.env.SIGNUP_OTP || 'on'),
  // TEST MODE (for a test deployment without SMS / email providers): one-time codes are shown on screen and
  // every page shows a "TEST MODE" banner. Never switch it on for real customers.
  testMode: /^(on|1|true|yes)$/i.test(process.env.TEST_MODE || ''),
  publicUrl: (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173').replace(/\/$/, ''),
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map((s) => s.trim()),
  dbPath: path.resolve(root, process.env.DB_PATH || 'data/utsav-ghar.db'),
  uploadDir: path.resolve(root, process.env.UPLOAD_DIR || 'uploads'),
  clientDist: path.resolve(root, '../client/dist'),
  jwtSecret: secret('JWT_SECRET'),
  adminJwtSecret: secret('ADMIN_JWT_SECRET'),
  // Payment gateway secrets live ONLY in environment variables — never in the DB,
  // never in API responses, never in frontend code.
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },
  // Server-side conversion reporting (secrets only here, never in the DB or browser)
  meta: {
    capiToken: process.env.META_CAPI_TOKEN || '',
    testEventCode: process.env.META_TEST_EVENT_CODE || '',
  },
  ga4: { apiSecret: process.env.GA4_API_SECRET || '' },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'Utsav Ghar <orders@utsavghar.in>',
  },
  whatsapp: {
    // e.g. Meta Cloud API / Gupshup / MSG91 — see src/lib/notify.js
    token: process.env.WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    // Approved marketing template for picks & festival alerts (see README → Customer messages)
    marketingTemplate: process.env.WHATSAPP_MARKETING_TEMPLATE || '',
    templateLang: process.env.WHATSAPP_TEMPLATE_LANG || 'en',
  },
  seedAdmin: {
    email: process.env.ADMIN_EMAIL || 'admin@utsavghar.in',
    password: process.env.ADMIN_PASSWORD || 'ChangeMe@2026',
  },
};
// Codes are returned to the browser only in development or in TEST MODE.
config.showTestCodes = !config.isProd || config.testMode;
