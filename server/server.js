const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');

const config = require('./config');
const catalog = require('./catalog');
const orders = require('./orders');
const auth = require('./auth');
const views = require('./views/admin');

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

/* ---------- Storefront (only public folders are served) ---------- */
const send = file => (req, res) => res.sendFile(path.join(config.ROOT, file));
app.get(['/', '/index.html'], send('index.html'));
app.get('/checkout', send('checkout.html'));
app.get('/checkout.html', send('checkout.html'));
app.get('/order', send('order.html'));
app.get('/order.html', send('order.html'));
for (const dir of ['css', 'js', 'assets']) {
  app.use(`/${dir}`, express.static(path.join(config.ROOT, dir), { maxAge: '1h', index: false }));
}

/* ---------- Customer API ---------- */
const api = express.Router();
api.use(express.json({ limit: '50kb' }));

api.get('/config', (req, res) => {
  const { currency, freeShip } = catalog.get();
  res.json({
    currency, freeShip,
    deliveryFee: config.deliveryFee,
    districts: orders.DISTRICTS,
    bank: config.bank,
    whatsapp: config.whatsapp,
  });
});

api.post('/orders',
  auth.rateLimit({ windowMs: 10 * 60e3, max: 10, message: 'Too many orders from this connection. Please try again in a few minutes.' }),
  (req, res) => {
    const { number, token } = orders.createOrder(req.body);
    console.log(`New order ${number} (${req.body.paymentMethod})`);
    res.status(201).json({ number, token, url: `/order?n=${encodeURIComponent(number)}&t=${encodeURIComponent(token)}` });
  });

api.get('/orders/:number', (req, res) => {
  const order = orders.findForCustomer(req.params.number, req.query.t);
  res.setHeader('Cache-Control', 'no-store');
  res.json(orders.publicView(order));
});

const SLIP_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic', 'image/heif': '.heif', 'application/pdf': '.pdf' };
const upload = multer({
  storage: multer.diskStorage({
    destination: config.UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + SLIP_TYPES[file.mimetype]),
  }),
  limits: { fileSize: config.maxSlipBytes, files: 1 },
  fileFilter: (req, file, cb) => cb(SLIP_TYPES[file.mimetype] ? null : new orders.OrderError('Please upload a photo (JPG, PNG, HEIC) or a PDF of your slip.', 415), !!SLIP_TYPES[file.mimetype]),
});

api.post('/orders/:number/slip',
  auth.rateLimit({ windowMs: 10 * 60e3, max: 20, message: 'Too many uploads. Please try again in a few minutes.' }),
  (req, res, next) => {
    // Check the order before accepting a file onto disk.
    try { req.order = orders.findForCustomer(req.params.number, req.query.t); next(); }
    catch (err) { next(err); }
  },
  upload.single('slip'),
  (req, res) => {
    if (!req.file) throw new orders.OrderError('Please choose your payment slip to upload.');
    let previous;
    try { previous = orders.attachSlip(req.order, req.file); }
    catch (err) { fs.rm(req.file.path, { force: true }, () => {}); throw err; }
    if (previous) fs.rm(path.join(config.UPLOAD_DIR, path.basename(previous)), { force: true }, () => {});
    console.log(`Slip uploaded for ${req.order.number}`);
    res.json(orders.publicView(orders.findForCustomer(req.params.number, req.query.t)));
  });

app.use('/api', api);

/* ---------- Admin ---------- */
const admin = express.Router();
admin.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
    "script-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
  ].join('; '));
  next();
});
admin.use('/assets', express.static(path.join(__dirname, 'public'), { index: false }));
admin.use(express.urlencoded({ extended: false, limit: '20kb' }));

const safeNext = n => (typeof n === 'string' && /^\/admin(\/|\?|$)/.test(n) ? n : '/admin');

admin.get('/login', (req, res) => {
  if (auth.isAuthed(req)) return res.redirect(safeNext(req.query.next));
  res.send(views.loginPage({ next: safeNext(req.query.next), configured: !!config.adminPassword }));
});

admin.post('/login', auth.sameOrigin,
  auth.rateLimit({ windowMs: 15 * 60e3, max: 8, message: 'Too many sign-in attempts. Please wait 15 minutes.' }),
  (req, res) => {
    if (!auth.passwordMatches(req.body.password || '')) {
      return res.status(401).send(views.loginPage({ error: 'That password isn’t right.', next: safeNext(req.body.next), configured: !!config.adminPassword }));
    }
    auth.setSession(res);
    res.redirect(safeNext(req.body.next));
  });

admin.post('/logout', auth.sameOrigin, (req, res) => { auth.clearSession(res); res.redirect('/admin/login'); });

admin.use(auth.requireAdmin);

const FLASH = {
  verify_payment: 'Payment verified and order confirmed.',
  reject_slip: 'Slip rejected — the customer can upload a new one.',
  confirm: 'Order confirmed.',
  ship: 'Marked as shipped.',
  deliver: 'Marked as delivered.',
  cancel: 'Order cancelled.',
  note: 'Note saved.',
};

admin.get('/', (req, res) => {
  const filter = typeof req.query.filter === 'string' ? req.query.filter : 'action';
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  res.send(views.listPage({ orders: orders.listOrders({ filter, q }), stats: orders.stats(), filter, q }));
});

admin.get('/orders/:id', (req, res) => {
  const order = orders.getAdminOrder(Number(req.params.id));
  if (!order) return res.status(404).send(views.notFoundPage());
  res.send(views.detailPage(order, { flash: FLASH[req.query.done] }));
});

admin.post('/orders/:id/action', auth.sameOrigin, (req, res) => {
  const id = Number(req.params.id);
  const action = String(req.body.action || '');
  try {
    orders.runAdminAction(id, action, { reason: req.body.reason, tracking: req.body.tracking });
    res.redirect(303, `/admin/orders/${id}?done=${encodeURIComponent(action)}`);
  } catch (err) {
    if (!(err instanceof orders.OrderError)) throw err;
    const order = orders.getAdminOrder(id);
    if (!order) return res.status(404).send(views.notFoundPage());
    res.status(err.status).send(views.detailPage(order, { error: err.message }));
  }
});

admin.get('/orders/:id/slip', (req, res) => {
  const order = orders.getAdminOrder(Number(req.params.id));
  if (!order || !order.slip_file) return res.status(404).send('No slip.');
  res.setHeader('Content-Type', order.slip_mime);
  res.setHeader('Content-Disposition', `inline; filename="${order.number}-slip${path.extname(order.slip_file)}"`);
  res.sendFile(path.join(config.UPLOAD_DIR, path.basename(order.slip_file)));
});

app.use('/admin', admin);

/* ---------- Errors ---------- */
app.use((req, res) => res.status(404).send('Not found'));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  let status = err.status || 500;
  let message = err.message;
  if (err instanceof multer.MulterError) {
    status = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'That file is too large — please upload a slip under 5 MB.' : 'Upload failed. Please try again.';
  } else if (err.type === 'entity.parse.failed') {
    status = 400; message = 'Invalid request.';
  } else if (!(err instanceof orders.OrderError)) {
    console.error(err);
    message = 'Something went wrong on our side. Please try again.';
  }
  if (req.path.startsWith('/api/')) return res.status(status).json({ error: message, fields: err.fields });
  res.status(status).send(views.esc(message));
});

app.listen(config.port, () => {
  console.log(`\nJaydaar is running at http://localhost:${config.port}`);
  console.log(`Admin dashboard:      http://localhost:${config.port}/admin`);
  if (!config.adminPassword) console.log('⚠  ADMIN_PASSWORD is not set — add it to .env to enable the admin dashboard.');
  if (config.bankIsPlaceholder) console.log('⚠  Bank details are placeholders — set the BANK_* values in .env.');
});
