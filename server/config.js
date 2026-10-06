const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* .env is optional */ }

const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Signing secret for admin sessions: from the environment, or generated once and kept on disk.
function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const file = path.join(DATA_DIR, '.session-secret');
  try { return fs.readFileSync(file, 'utf8').trim(); } catch { /* first run */ }
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

const env = (key, fallback) => (process.env[key] ?? '').trim() || fallback;
const bool = key => /^(1|true|yes)$/i.test(process.env[key] || '');

const bank = {
  bankName: env('BANK_NAME', 'Your Bank'),
  accountName: env('BANK_ACCOUNT_NAME', 'Jaydaar'),
  accountNumber: env('BANK_ACCOUNT_NUMBER', '000000000000'),
  branch: env('BANK_BRANCH', 'Your Branch'),
};

module.exports = {
  ROOT,
  DATA_DIR,
  UPLOAD_DIR,
  port: Number(env('PORT', '3000')),
  adminPassword: env('ADMIN_PASSWORD', ''),
  sessionSecret: sessionSecret(),
  deliveryFee: Math.max(0, Number(env('DELIVERY_FEE', '400')) || 0),
  bank,
  bankIsPlaceholder: bank.accountNumber === '000000000000' || bank.bankName === 'Your Bank',
  whatsapp: env('WHATSAPP_NUMBER', '94725490944'),
  cookieSecure: bool('COOKIE_SECURE'),
  trustProxy: bool('TRUST_PROXY'),
  maxSlipBytes: 5 * 1024 * 1024,
};
