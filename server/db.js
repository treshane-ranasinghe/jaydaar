const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { DATA_DIR } = require('./config');

const db = new DatabaseSync(path.join(DATA_DIR, 'jaydaar.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS orders (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    number          TEXT NOT NULL UNIQUE,
    token           TEXT NOT NULL,
    status          TEXT NOT NULL,
    payment_method  TEXT NOT NULL CHECK (payment_method IN ('cod', 'bank')),
    payment_status  TEXT NOT NULL,
    customer_name   TEXT NOT NULL,
    phone           TEXT NOT NULL,
    email           TEXT,
    address         TEXT NOT NULL,
    city            TEXT NOT NULL,
    district        TEXT NOT NULL,
    notes           TEXT,
    subtotal        INTEGER NOT NULL,
    delivery_fee    INTEGER NOT NULL,
    total           INTEGER NOT NULL,
    slip_file       TEXT,
    slip_mime       TEXT,
    slip_uploaded_at TEXT,
    admin_note      TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id  TEXT NOT NULL,
    name        TEXT NOT NULL,
    image       TEXT,
    size        TEXT NOT NULL,
    color       TEXT NOT NULL,
    qty         INTEGER NOT NULL,
    unit_price  INTEGER NOT NULL,
    line_total  INTEGER NOT NULL
  );

  -- Timeline of what happened to an order. "public" events are shown to the customer.
  CREATE TABLE IF NOT EXISTS order_events (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id  INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    at        TEXT NOT NULL DEFAULT (datetime('now')),
    actor     TEXT NOT NULL,
    message   TEXT NOT NULL,
    public    INTEGER NOT NULL DEFAULT 1
  );

  CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
  CREATE INDEX IF NOT EXISTS idx_events_order ON order_events(order_id);
`);

function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (err) { db.exec('ROLLBACK'); throw err; }
}

module.exports = { db, transaction };
