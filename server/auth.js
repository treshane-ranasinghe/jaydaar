const crypto = require('node:crypto');
const config = require('./config');

const COOKIE = 'em_admin';
const SESSION_HOURS = 12;

const sign = value => crypto.createHmac('sha256', config.sessionSecret).update(value).digest('base64url');
const sha = v => crypto.createHash('sha256').update(String(v)).digest();

function passwordMatches(input) {
  if (!config.adminPassword) return false;
  return crypto.timingSafeEqual(sha(input), sha(config.adminPassword));
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function setSession(res) {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_HOURS * 3600e3 })).toString('base64url');
  const value = `${payload}.${sign(payload)}`;
  res.setHeader('Set-Cookie', `${COOKIE}=${value}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}${config.cookieSecure ? '; Secure' : ''}`);
}

function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0${config.cookieSecure ? '; Secure' : ''}`);
}

function isAuthed(req) {
  const raw = readCookie(req, COOKIE);
  if (!raw || !raw.includes('.')) return false;
  const [payload, sig] = raw.split('.');
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now(); }
  catch { return false; }
}

function requireAdmin(req, res, next) {
  if (isAuthed(req)) return next();
  if (req.method === 'GET') return res.redirect(`/admin/login?next=${encodeURIComponent(req.originalUrl)}`);
  res.status(401).send('Please sign in again.');
}

// Admin forms must come from this site (on top of the SameSite=Strict cookie).
function sameOrigin(req, res, next) {
  const origin = req.headers.origin || req.headers.referer;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) return res.status(403).send('Cross-site request blocked.');
    } catch { return res.status(403).send('Cross-site request blocked.'); }
  }
  next();
}

/* Simple in-memory rate limiter (per IP). */
function rateLimit({ windowMs, max, message }) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, windowMs).unref();
  return (req, res, next) => {
    const now = Date.now();
    const entry = hits.get(req.ip) || { count: 0, reset: now + windowMs };
    if (entry.reset < now) { entry.count = 0; entry.reset = now + windowMs; }
    entry.count++;
    hits.set(req.ip, entry);
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.reset - now) / 1000));
      return req.originalUrl.startsWith('/api/') ? res.status(429).json({ error: message }) : res.status(429).send(message);
    }
    next();
  };
}

module.exports = { passwordMatches, setSession, clearSession, isAuthed, requireAdmin, sameOrigin, rateLimit };
