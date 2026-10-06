const crypto = require('node:crypto');
const { db, transaction } = require('./db');
const catalog = require('./catalog');
const config = require('./config');

/* ---------- Labels ---------- */
const STATUS = {
  pending: 'New order',
  confirmed: 'Confirmed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};
const PAYMENT = {
  cod_pending: 'Pay on delivery',
  awaiting_transfer: 'Awaiting transfer',
  slip_submitted: 'Slip to review',
  rejected: 'Slip rejected',
  paid: 'Paid',
};
const METHOD = { cod: 'Cash on Delivery', bank: 'Bank Transfer' };

const DISTRICTS = [
  'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo', 'Galle', 'Gampaha', 'Hambantota',
  'Jaffna', 'Kalutara', 'Kandy', 'Kegalle', 'Kilinochchi', 'Kurunegala', 'Mannar', 'Matale',
  'Matara', 'Monaragala', 'Mullaitivu', 'Nuwara Eliya', 'Polonnaruwa', 'Puttalam', 'Ratnapura',
  'Trincomalee', 'Vavuniya',
];

class OrderError extends Error {
  constructor(message, status = 400, fields) { super(message); this.status = status; this.fields = fields; }
}

/* ---------- Validation ---------- */
const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanBlock = (v, max) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);

function normalisePhone(raw) {
  const digits = String(raw ?? '').replace(/[\s\-()]/g, '');
  if (/^\+?\d{9,15}$/.test(digits)) return digits;
  return null;
}

function validateCustomer(body) {
  const c = body?.customer || {};
  const out = {
    name: clean(c.name, 80),
    phone: normalisePhone(c.phone),
    email: clean(c.email, 120),
    address: cleanBlock(c.address, 300),
    city: clean(c.city, 60),
    district: clean(c.district, 40),
    notes: cleanBlock(c.notes, 500),
  };
  const fields = {};
  if (out.name.length < 2) fields.name = 'Please enter your full name.';
  if (!out.phone) fields.phone = 'Please enter a valid phone number.';
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) fields.email = 'Please enter a valid email or leave it blank.';
  if (out.address.length < 5) fields.address = 'Please enter your delivery address.';
  if (out.city.length < 2) fields.city = 'Please enter your city.';
  if (!DISTRICTS.includes(out.district)) fields.district = 'Please choose your district.';
  if (Object.keys(fields).length) throw new OrderError('Please check the highlighted fields.', 422, fields);
  return out;
}

// Prices every line from the catalogue; the browser only says what and how many.
function priceItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw new OrderError('Your bag is empty.');
  if (rawItems.length > 50) throw new OrderError('Too many items in one order.');
  const { products } = catalog.get();
  const merged = new Map();
  for (const raw of rawItems) {
    const product = products.get(String(raw?.id));
    if (!product) throw new OrderError('One of the items in your bag is no longer available. Please refresh and try again.');
    const size = String(raw.size);
    if (!product.sizes.includes(size)) throw new OrderError(`Size ${size} isn't available for ${product.name}.`);
    const color = product.colors.find(c => c.name === raw.color)?.name || product.colors[0].name;
    const qty = Math.floor(Number(raw.qty));
    if (!(qty >= 1 && qty <= 10)) throw new OrderError(`Please choose between 1 and 10 of ${product.name}.`);
    const key = `${product.id}|${size}|${color}`;
    const line = merged.get(key) || { product, size, color, qty: 0 };
    line.qty = Math.min(10, line.qty + qty);
    merged.set(key, line);
  }
  return [...merged.values()].map(({ product, size, color, qty }) => ({
    productId: product.id,
    name: product.name,
    image: product.images[0],
    size, color, qty,
    unitPrice: product.price,
    lineTotal: product.price * qty,
  }));
}

function totalsFor(items) {
  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  const deliveryFee = subtotal >= catalog.get().freeShip ? 0 : config.deliveryFee;
  return { subtotal, deliveryFee, total: subtotal + deliveryFee };
}

/* ---------- Helpers ---------- */
function newOrderNumber() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alike characters
  for (;;) {
    const bytes = crypto.randomBytes(4);
    const suffix = [...bytes].map(b => alphabet[b % alphabet.length]).join('');
    const number = `JD-${ymd}-${suffix}`;
    if (!db.prepare('SELECT 1 FROM orders WHERE number = ?').get(number)) return number;
  }
}

function addEvent(orderId, message, { actor = 'system', isPublic = true } = {}) {
  db.prepare('INSERT INTO order_events (order_id, actor, message, public) VALUES (?, ?, ?, ?)')
    .run(orderId, actor, message, isPublic ? 1 : 0);
}

function touch(orderId, fields) {
  const keys = Object.keys(fields);
  const sets = keys.map(k => `${k} = ?`).concat("updated_at = datetime('now')").join(', ');
  db.prepare(`UPDATE orders SET ${sets} WHERE id = ?`).run(...keys.map(k => fields[k]), orderId);
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* ---------- Customer actions ---------- */
function createOrder(body) {
  const method = body?.paymentMethod;
  if (!['cod', 'bank'].includes(method)) throw new OrderError('Please choose a payment method.', 422, { paymentMethod: 'Please choose a payment method.' });
  const customer = validateCustomer(body);
  const items = priceItems(body?.items);
  const totals = totalsFor(items);

  return transaction(() => {
    const number = newOrderNumber();
    const token = crypto.randomBytes(18).toString('base64url');
    const paymentStatus = method === 'cod' ? 'cod_pending' : 'awaiting_transfer';
    const { lastInsertRowid: id } = db.prepare(`
      INSERT INTO orders (number, token, status, payment_method, payment_status,
        customer_name, phone, email, address, city, district, notes, subtotal, delivery_fee, total)
      VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(number, token, method, paymentStatus, customer.name, customer.phone, customer.email || null,
      customer.address, customer.city, customer.district, customer.notes || null,
      totals.subtotal, totals.deliveryFee, totals.total);

    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, name, image, size, color, qty, unit_price, line_total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const i of items) insertItem.run(id, i.productId, i.name, i.image, i.size, i.color, i.qty, i.unitPrice, i.lineTotal);

    addEvent(id, method === 'cod'
      ? 'Order placed — paying by cash on delivery.'
      : 'Order placed — waiting for your bank transfer.', { actor: 'customer' });
    return { number, token };
  });
}

function findForCustomer(number, token) {
  const order = db.prepare('SELECT * FROM orders WHERE number = ?').get(String(number || ''));
  if (!order || !safeEqual(order.token, token || '')) throw new OrderError('Order not found.', 404);
  return order;
}

function canUploadSlip(order) {
  return order.payment_method === 'bank' && order.status !== 'cancelled' &&
    ['awaiting_transfer', 'slip_submitted', 'rejected'].includes(order.payment_status);
}

function attachSlip(order, file) {
  if (!canUploadSlip(order)) throw new OrderError('A payment slip can no longer be uploaded for this order.', 409);
  const replaced = order.payment_status === 'slip_submitted';
  touch(order.id, {
    slip_file: file.filename,
    slip_mime: file.mimetype,
    slip_uploaded_at: new Date().toISOString(),
    payment_status: 'slip_submitted',
  });
  addEvent(order.id, replaced ? 'A new payment slip was uploaded.' : 'Payment slip received — we’ll verify it shortly.', { actor: 'customer' });
  return order.slip_file; // previous file, so the caller can delete it
}

function publicView(order) {
  const items = db.prepare('SELECT name, image, size, color, qty, unit_price, line_total FROM order_items WHERE order_id = ? ORDER BY id').all(order.id);
  const events = db.prepare('SELECT at, message FROM order_events WHERE order_id = ? AND public = 1 ORDER BY id').all(order.id);
  return {
    number: order.number,
    createdAt: order.created_at,
    status: order.status,
    statusLabel: STATUS[order.status],
    paymentMethod: order.payment_method,
    paymentMethodLabel: METHOD[order.payment_method],
    paymentStatus: order.payment_status,
    paymentStatusLabel: PAYMENT[order.payment_status],
    customer: { name: order.customer_name, phone: order.phone, address: order.address, city: order.city, district: order.district },
    items: items.map(i => ({ name: i.name, image: i.image, size: i.size, color: i.color, qty: i.qty, unitPrice: i.unit_price, lineTotal: i.line_total })),
    subtotal: order.subtotal,
    deliveryFee: order.delivery_fee,
    total: order.total,
    slipUploaded: !!order.slip_file,
    canUploadSlip: canUploadSlip(order),
    timeline: events,
    bank: order.payment_method === 'bank' ? config.bank : null,
  };
}

/* ---------- Admin ---------- */
// Which buttons the admin sees for an order, given its status and payment state.
function adminActions(o) {
  const a = [];
  if (o.status === 'cancelled' || o.status === 'delivered') return a;
  if (o.payment_method === 'bank' && o.payment_status !== 'paid') {
    a.push('verify_payment');
    if (o.payment_status === 'slip_submitted') a.push('reject_slip');
  }
  if (o.status === 'pending' && (o.payment_method === 'cod' || o.payment_status === 'paid')) a.push('confirm');
  if (o.status === 'confirmed') a.push('ship');
  if (o.status === 'shipped') a.push('deliver');
  if (o.status === 'pending' || o.status === 'confirmed') a.push('cancel');
  return a;
}

function runAdminAction(id, action, { reason = '', tracking = '' } = {}) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) throw new OrderError('Order not found.', 404);
  if (action === 'note') {
    touch(id, { admin_note: cleanBlock(reason, 2000) || null });
    return 'Note saved.';
  }
  if (!adminActions(order).includes(action)) throw new OrderError('That action isn’t available for this order any more.', 409);
  reason = clean(reason, 300);
  tracking = clean(tracking, 120);

  return transaction(() => {
    switch (action) {
      case 'verify_payment':
        touch(id, { payment_status: 'paid', status: order.status === 'pending' ? 'confirmed' : order.status });
        addEvent(id, 'Payment received — thank you!', { actor: 'admin' });
        if (order.status === 'pending') addEvent(id, 'Order confirmed and being prepared.', { actor: 'admin' });
        return 'Payment verified and order confirmed.';
      case 'reject_slip':
        if (!reason) throw new OrderError('Please give a reason so the customer knows what to fix.', 422);
        touch(id, { payment_status: 'rejected' });
        addEvent(id, `We couldn’t verify your payment slip: ${reason} Please upload a new one.`, { actor: 'admin' });
        return 'Slip rejected — the customer can upload a new one.';
      case 'confirm':
        touch(id, { status: 'confirmed' });
        addEvent(id, 'Order confirmed and being prepared.', { actor: 'admin' });
        return 'Order confirmed.';
      case 'ship':
        touch(id, { status: 'shipped' });
        addEvent(id, tracking ? `Your order is on its way. Tracking: ${tracking}` : 'Your order is on its way.', { actor: 'admin' });
        return 'Marked as shipped.';
      case 'deliver':
        touch(id, { status: 'delivered', payment_status: 'paid' });
        addEvent(id, order.payment_method === 'cod' ? 'Delivered and paid on delivery.' : 'Delivered. Enjoy your Jaydaar pieces!', { actor: 'admin' });
        if (order.payment_method === 'cod') addEvent(id, `Cash collected: ${catalog.get().currency}${order.total.toLocaleString('en-US')}`, { actor: 'admin', isPublic: false });
        return order.payment_method === 'cod' ? 'Marked as delivered — cash collected.' : 'Marked as delivered.';
      case 'cancel':
        touch(id, { status: 'cancelled' });
        addEvent(id, reason ? `Order cancelled: ${reason}` : 'Order cancelled.', { actor: 'admin' });
        return 'Order cancelled.';
      default:
        throw new OrderError('Unknown action.');
    }
  });
}

const FILTERS = {
  action: "(o.status = 'pending' OR o.payment_status = 'slip_submitted' OR o.status = 'confirmed')",
  review: "o.payment_status = 'slip_submitted'",
  awaiting: "o.payment_status IN ('awaiting_transfer', 'rejected') AND o.status != 'cancelled'",
  ship: "o.status = 'confirmed'",
  shipped: "o.status = 'shipped'",
  cod: "o.payment_method = 'cod'",
  bank: "o.payment_method = 'bank'",
  done: "o.status IN ('delivered', 'cancelled')",
  all: '1 = 1',
};

function listOrders({ filter = 'action', q = '' } = {}) {
  const where = [FILTERS[filter] || FILTERS.action];
  const params = [];
  q = clean(q, 80);
  if (q) {
    where.push('(o.number LIKE ? OR o.customer_name LIKE ? OR o.phone LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q.replace(/[\s\-]/g, '')}%`);
  }
  return db.prepare(`
    SELECT o.*, (SELECT SUM(qty) FROM order_items WHERE order_id = o.id) AS item_count
    FROM orders o WHERE ${where.join(' AND ')}
    ORDER BY o.created_at DESC, o.id DESC LIMIT 300
  `).all(...params);
}

function stats() {
  const one = sql => db.prepare(sql).get();
  return {
    newOrders: one("SELECT COUNT(*) n FROM orders WHERE status = 'pending'").n,
    slipsToReview: one("SELECT COUNT(*) n FROM orders WHERE payment_status = 'slip_submitted'").n,
    toShip: one("SELECT COUNT(*) n FROM orders WHERE status = 'confirmed'").n,
    paidRevenue: one("SELECT COALESCE(SUM(total), 0) n FROM orders WHERE payment_status = 'paid' AND status != 'cancelled'").n,
    codOutstanding: one("SELECT COALESCE(SUM(total), 0) n FROM orders WHERE payment_method = 'cod' AND payment_status != 'paid' AND status NOT IN ('cancelled')").n,
  };
}

function getAdminOrder(id) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return null;
  order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(id);
  order.events = db.prepare('SELECT * FROM order_events WHERE order_id = ? ORDER BY id DESC').all(id);
  order.actions = adminActions(order);
  return order;
}

module.exports = {
  STATUS, PAYMENT, METHOD, DISTRICTS, OrderError,
  createOrder, findForCustomer, attachSlip, publicView,
  listOrders, stats, getAdminOrder, runAdminAction,
};
