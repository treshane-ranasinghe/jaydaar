// Server-rendered admin pages. Every dynamic value goes through esc().
const { STATUS, PAYMENT, METHOD } = require('../orders');
const catalog = require('../catalog');
const config = require('../config');

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => esc(catalog.get().currency + Number(n || 0).toLocaleString('en-US'));
const when = iso => {
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  return esc(d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }));
};

const statusPill = s => `<span class="pill pill--${esc(s)}">${esc(STATUS[s] || s)}</span>`;
const payPill = s => `<span class="pill pill--pay-${esc(s)}">${esc(PAYMENT[s] || s)}</span>`;

function layout(title, body, { flash, error, authed = true } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${esc(title)} · Jaydaar Admin</title>
  <link rel="icon" type="image/png" href="/assets/brand/favicon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Allura&family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/admin/assets/admin.css" />
  <script src="/admin/assets/admin.js" defer></script>
</head>
<body>
  ${authed ? `
  <header class="top">
    <a class="brand" href="/admin">Jaydaar <span>Admin</span></a>
    <nav>
      <a href="/admin">Orders</a>
      <a href="/" target="_blank" rel="noopener">View store ↗</a>
      <form method="post" action="/admin/logout"><button class="link">Sign out</button></form>
    </nav>
  </header>` : ''}
  <main class="wrap">
    ${flash ? `<div class="flash flash--ok" role="status">${esc(flash)}</div>` : ''}
    ${error ? `<div class="flash flash--err" role="alert">${esc(error)}</div>` : ''}
    ${body}
  </main>
</body>
</html>`;
}

function loginPage({ error, next = '/admin', configured }) {
  return layout('Sign in', `
    <section class="login">
      <h1>Jaydaar <em>Admin</em></h1>
      <p class="muted">Orders, payments and deliveries.</p>
      ${configured ? `
      <form method="post" action="/admin/login" class="card">
        <input type="hidden" name="next" value="${esc(next)}" />
        <label>Password<input type="password" name="password" autocomplete="current-password" required autofocus /></label>
        <button class="btn btn--dark">Sign in</button>
      </form>` : `
      <div class="card">
        <p><strong>Admin password not set.</strong></p>
        <p class="muted">Add <code>ADMIN_PASSWORD=your-long-password</code> to the <code>.env</code> file in the project folder, then restart the server.</p>
      </div>`}
    </section>`, { error, authed: false });
}

const FILTER_TABS = [
  ['action', 'Needs action'], ['review', 'Slips to review'], ['awaiting', 'Awaiting transfer'],
  ['ship', 'To ship'], ['shipped', 'Shipped'], ['cod', 'Cash on Delivery'], ['bank', 'Bank Transfer'],
  ['done', 'Completed'], ['all', 'All'],
];

function listPage({ orders, stats, filter, q, flash }) {
  const rows = orders.map(o => `
    <tr data-href="/admin/orders/${o.id}">
      <td><a href="/admin/orders/${o.id}"><strong>${esc(o.number)}</strong></a><div class="muted small">${when(o.created_at)}</div></td>
      <td>${esc(o.customer_name)}<div class="muted small">${esc(o.phone)} · ${esc(o.city)}</div></td>
      <td>${esc(METHOD[o.payment_method])}<div>${payPill(o.payment_status)}</div></td>
      <td>${statusPill(o.status)}</td>
      <td class="num">${money(o.total)}<div class="muted small">${o.item_count} item${o.item_count === 1 ? '' : 's'}</div></td>
    </tr>`).join('');

  return layout('Orders', `
    ${config.bankIsPlaceholder ? `<div class="flash flash--warn">Your bank details are still placeholders. Add BANK_NAME, BANK_ACCOUNT_NAME, BANK_ACCOUNT_NUMBER and BANK_BRANCH to <code>.env</code> so customers transfer to the right account.</div>` : ''}
    <section class="stats">
      <a class="stat" href="/admin?filter=action"><span>New orders</span><strong>${stats.newOrders}</strong></a>
      <a class="stat ${stats.slipsToReview ? 'stat--alert' : ''}" href="/admin?filter=review"><span>Slips to review</span><strong>${stats.slipsToReview}</strong></a>
      <a class="stat" href="/admin?filter=ship"><span>To ship</span><strong>${stats.toShip}</strong></a>
      <div class="stat"><span>COD to collect</span><strong>${money(stats.codOutstanding)}</strong></div>
      <div class="stat"><span>Paid revenue</span><strong>${money(stats.paidRevenue)}</strong></div>
    </section>

    <section class="toolbar">
      <nav class="tabs">${FILTER_TABS.map(([k, label]) => `<a href="/admin?filter=${k}${q ? `&q=${encodeURIComponent(q)}` : ''}" class="${k === filter ? 'is-active' : ''}">${esc(label)}</a>`).join('')}</nav>
      <form class="search" method="get" action="/admin">
        <input type="hidden" name="filter" value="${esc(filter)}" />
        <input type="search" name="q" value="${esc(q)}" placeholder="Search order no., name or phone" />
      </form>
    </section>

    <div class="card table-card">
      ${orders.length ? `
      <table class="orders">
        <thead><tr><th>Order</th><th>Customer</th><th>Payment</th><th>Status</th><th class="num">Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>` : `<p class="empty">No orders here${q ? ` matching “${esc(q)}”` : ''}.</p>`}
    </div>`, { flash });
}

const ACTION_UI = {
  verify_payment: o => `
    <form method="post" action="/admin/orders/${o.id}/action" class="action">
      <input type="hidden" name="action" value="verify_payment" />
      <button class="btn btn--dark" ${o.payment_status === 'slip_submitted' ? '' : 'data-confirm="No slip has been uploaded. Mark this order as paid anyway?"'}>Verify payment received</button>
    </form>`,
  reject_slip: o => `
    <form method="post" action="/admin/orders/${o.id}/action" class="action action--stack">
      <input type="hidden" name="action" value="reject_slip" />
      <input name="reason" placeholder="Reason, e.g. amount doesn’t match" required maxlength="300" />
      <button class="btn btn--ghost">Reject slip</button>
    </form>`,
  confirm: o => `
    <form method="post" action="/admin/orders/${o.id}/action" class="action">
      <input type="hidden" name="action" value="confirm" />
      <button class="btn btn--dark">Confirm order</button>
    </form>`,
  ship: o => `
    <form method="post" action="/admin/orders/${o.id}/action" class="action action--stack">
      <input type="hidden" name="action" value="ship" />
      <input name="tracking" placeholder="Courier / tracking no. (optional)" maxlength="120" />
      <button class="btn btn--dark">Mark as shipped</button>
    </form>`,
  deliver: o => `
    <form method="post" action="/admin/orders/${o.id}/action" class="action">
      <input type="hidden" name="action" value="deliver" />
      <button class="btn btn--dark">${o.payment_method === 'cod' ? `Delivered — cash collected (${money(o.total)})` : 'Mark as delivered'}</button>
    </form>`,
  cancel: o => `
    <details class="action action--danger">
      <summary>Cancel order</summary>
      <form method="post" action="/admin/orders/${o.id}/action" class="action--stack">
        <input type="hidden" name="action" value="cancel" />
        <input name="reason" placeholder="Reason (shown to the customer)" maxlength="300" />
        <button class="btn btn--danger" data-confirm="Cancel this order?">Cancel order</button>
      </form>
    </details>`,
};

function detailPage(o, { flash, error } = {}) {
  const slip = o.slip_file ? (o.slip_mime === 'application/pdf'
    ? `<a class="slip slip--pdf" href="/admin/orders/${o.id}/slip" target="_blank" rel="noopener">Open PDF slip ↗</a>`
    : `<a class="slip" href="/admin/orders/${o.id}/slip" target="_blank" rel="noopener"><img src="/admin/orders/${o.id}/slip" alt="Payment slip" /></a>`)
    : `<p class="muted">No slip uploaded yet.</p>`;

  const items = o.items.map(i => `
    <li>
      <img src="/${esc(i.image)}" alt="" />
      <div><strong>${esc(i.name)}</strong><div class="muted small">${esc(i.size)} · ${esc(i.color)} · ${money(i.unit_price)} × ${i.qty}</div></div>
      <span class="num">${money(i.line_total)}</span>
    </li>`).join('');

  const timeline = o.events.map(e => `
    <li class="${e.public ? '' : 'is-private'}">
      <span class="muted small">${when(e.at)} · ${esc(e.actor)}${e.public ? '' : ' · internal'}</span>
      <p>${esc(e.message)}</p>
    </li>`).join('');

  const tel = o.phone.replace(/[^\d+]/g, '');
  const wa = tel.replace(/^\+/, '').replace(/^0/, '94');

  return layout(o.number, `
    <a class="back" href="/admin">← All orders</a>
    <header class="order-head">
      <div>
        <h1>${esc(o.number)}</h1>
        <p class="muted">Placed ${when(o.created_at)} · ${esc(METHOD[o.payment_method])}</p>
      </div>
      <div class="pills">${statusPill(o.status)} ${payPill(o.payment_status)}</div>
    </header>

    <div class="grid">
      <div class="col">
        <section class="card">
          <h2>Next step</h2>
          ${o.actions.length ? `<div class="actions">${o.actions.map(a => ACTION_UI[a](o)).join('')}</div>` : `<p class="muted">Nothing left to do — this order is ${esc(STATUS[o.status].toLowerCase())}.</p>`}
        </section>

        ${o.payment_method === 'bank' ? `
        <section class="card">
          <h2>Bank transfer</h2>
          <dl class="kv">
            <dt>Amount due</dt><dd><strong>${money(o.total)}</strong></dd>
            <dt>Reference</dt><dd>${esc(o.number)}</dd>
            <dt>Slip uploaded</dt><dd>${o.slip_uploaded_at ? when(o.slip_uploaded_at) : '—'}</dd>
          </dl>
          ${slip}
          <p class="muted small">Check that the amount and reference match before verifying.</p>
        </section>` : `
        <section class="card">
          <h2>Cash on delivery</h2>
          <dl class="kv">
            <dt>Collect on delivery</dt><dd><strong>${money(o.total)}</strong></dd>
            <dt>Cash received</dt><dd>${o.payment_status === 'paid' ? 'Yes' : 'Not yet'}</dd>
          </dl>
        </section>`}

        <section class="card">
          <h2>Items</h2>
          <ul class="items">${items}</ul>
          <dl class="kv totals">
            <dt>Subtotal</dt><dd>${money(o.subtotal)}</dd>
            <dt>Delivery</dt><dd>${o.delivery_fee ? money(o.delivery_fee) : 'Free'}</dd>
            <dt><strong>Total</strong></dt><dd><strong>${money(o.total)}</strong></dd>
          </dl>
        </section>
      </div>

      <div class="col">
        <section class="card">
          <h2>Customer</h2>
          <p><strong>${esc(o.customer_name)}</strong></p>
          <p><a href="tel:${esc(tel)}">${esc(o.phone)}</a> · <a href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">WhatsApp ↗</a></p>
          ${o.email ? `<p><a href="mailto:${esc(o.email)}">${esc(o.email)}</a></p>` : ''}
          <p class="address">${esc(o.address)}<br />${esc(o.city)}, ${esc(o.district)}</p>
          ${o.notes ? `<p class="note"><span class="muted small">Customer note</span><br />${esc(o.notes)}</p>` : ''}
        </section>

        <section class="card">
          <h2>Internal note</h2>
          <form method="post" action="/admin/orders/${o.id}/action" class="action--stack">
            <input type="hidden" name="action" value="note" />
            <textarea name="reason" rows="3" maxlength="2000" placeholder="Only visible to admins">${esc(o.admin_note)}</textarea>
            <button class="btn btn--ghost">Save note</button>
          </form>
        </section>

        <section class="card">
          <h2>Timeline</h2>
          <ul class="timeline">${timeline}</ul>
        </section>
      </div>
    </div>
`, { flash, error });
}

function notFoundPage() {
  return layout('Not found', `<section class="card"><h1>Order not found</h1><p><a href="/admin">Back to orders</a></p></section>`);
}

module.exports = { loginPage, listPage, detailPage, notFoundPage, esc };
