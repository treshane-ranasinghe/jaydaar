(() => {
  'use strict';

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const money = n => CURRENCY + Number(n).toLocaleString('en-US');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, f) { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };

  const form = $('#coForm');
  const alertBox = $('#coAlert');
  let config = { deliveryFee: 400, freeShip: FREE_SHIP, districts: [], bank: null };

  const cart = store.get('jd-cart', [])
    .map(i => ({ ...i, product: PRODUCTS.find(p => p.id === i.id) }))
    .filter(i => i.product && i.qty > 0);

  if (!cart.length) { $('#coEmpty').hidden = false; return; }
  $('#coGrid').hidden = false;
  $('#summaryToggle').hidden = false;

  /* ---------- Summary ---------- */
  function totals() {
    const subtotal = cart.reduce((s, i) => s + i.product.price * i.qty, 0);
    const delivery = subtotal >= config.freeShip ? 0 : config.deliveryFee;
    return { subtotal, delivery, total: subtotal + delivery };
  }

  function renderSummary() {
    $('#coItems').innerHTML = cart.map(i => `
      <li>
        <span class="co-thumb"><img src="${esc(i.product.images[0])}" alt="" /><b>${i.qty}</b></span>
        <span class="co-item-info"><strong>${esc(i.product.name)}</strong><small>${esc(i.size)} · ${esc(i.color)}</small></span>
        <span>${money(i.product.price * i.qty)}</span>
      </li>`).join('');
    const t = totals();
    $('#sumSubtotal').textContent = money(t.subtotal);
    $('#sumDelivery').textContent = t.delivery ? money(t.delivery) : 'Free';
    $('#sumTotal').textContent = money(t.total);
    $('#toggleTotal').textContent = money(t.total);
    $$('.js-total').forEach(el => { el.textContent = money(t.total); });
    const left = config.freeShip - t.subtotal;
    $('#freeNote').textContent = left > 0 ? `Add ${money(left)} more for complimentary delivery.` : '✦ You’ve unlocked complimentary delivery.';
  }

  $('#summaryToggle').addEventListener('click', e => {
    const open = $('#coSummary').classList.toggle('is-open');
    e.currentTarget.setAttribute('aria-expanded', open);
    e.currentTarget.firstElementChild.textContent = open ? 'Hide order summary' : 'Show order summary';
  });

  /* ---------- Config from the server ---------- */
  function renderBank() {
    if (!config.bank) return;
    const rows = [['Bank', config.bank.bankName], ['Account name', config.bank.accountName], ['Account number', config.bank.accountNumber], ['Branch', config.bank.branch]];
    $('#bankDetails').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}${k === 'Account number' ? ` <button type="button" class="co-copy" data-copy="${esc(v)}">Copy</button>` : ''}</dd>`).join('');
  }

  function renderDistricts() {
    const select = form.elements.district;
    select.innerHTML = '<option value="">Choose district</option>' + config.districts.map(d => `<option>${esc(d)}</option>`).join('');
  }

  fetch('/api/config')
    .then(r => { if (!r.ok) throw new Error(); return r.json(); })
    .then(c => { config = c; renderSummary(); renderBank(); renderDistricts(); restoreDraft(); })
    .catch(() => showAlert('Checkout is offline right now — the store server isn’t running. Please try again shortly.'));

  renderSummary();

  /* ---------- Payment choice ---------- */
  form.addEventListener('change', e => {
    if (e.target.name !== 'paymentMethod') return;
    $('#codPanel').hidden = e.target.value !== 'cod';
    $('#bankPanel').hidden = e.target.value !== 'bank';
    clearError('paymentMethod');
  });

  document.addEventListener('click', e => {
    const b = e.target.closest('.co-copy');
    if (!b) return;
    navigator.clipboard?.writeText(b.dataset.copy).then(() => { b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1500); });
  });

  /* ---------- Keep what they've typed if they leave and come back ---------- */
  const DRAFT_FIELDS = ['name', 'phone', 'email', 'address', 'city', 'district', 'notes'];
  function restoreDraft() {
    const d = store.get('jd-checkout', {});
    DRAFT_FIELDS.forEach(k => { if (d[k] && !form.elements[k].value) form.elements[k].value = d[k]; });
  }
  form.addEventListener('input', () => {
    store.set('jd-checkout', Object.fromEntries(DRAFT_FIELDS.map(k => [k, form.elements[k].value])));
  });

  /* ---------- Errors ---------- */
  function showAlert(msg) { alertBox.textContent = msg; alertBox.hidden = false; alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  function clearError(name) {
    const el = $(`.co-err[data-for="${name}"]`);
    if (el) el.textContent = '';
    form.elements[name]?.closest?.('.co-field')?.classList.remove('has-error');
  }
  function setErrors(fields) {
    Object.entries(fields).forEach(([name, msg]) => {
      const el = $(`.co-err[data-for="${name}"]`);
      if (el) el.textContent = msg;
      const input = form.elements[name];
      (input?.closest?.('.co-field'))?.classList.add('has-error');
    });
    const first = Object.keys(fields)[0];
    const target = form.elements[first];
    (target?.focus ? target : target?.[0])?.focus?.();
  }
  form.addEventListener('input', e => { if (e.target.name) clearError(e.target.name); });

  function validate(data) {
    const f = {};
    if (data.customer.name.trim().length < 2) f.name = 'Please enter your full name.';
    if (!/^\+?\d{9,15}$/.test(data.customer.phone.replace(/[\s\-()]/g, ''))) f.phone = 'Please enter a valid phone number.';
    if (data.customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.customer.email)) f.email = 'Please enter a valid email or leave it blank.';
    if (data.customer.address.trim().length < 5) f.address = 'Please enter your delivery address.';
    if (data.customer.city.trim().length < 2) f.city = 'Please enter your city.';
    if (!data.customer.district) f.district = 'Please choose your district.';
    if (!data.paymentMethod) f.paymentMethod = 'Please choose how you’d like to pay.';
    return f;
  }

  /* ---------- Submit ---------- */
  let submitting = false;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (submitting) return;
    alertBox.hidden = true;
    const data = {
      customer: Object.fromEntries(DRAFT_FIELDS.map(k => [k, form.elements[k].value])),
      paymentMethod: form.elements.paymentMethod.value,
      items: cart.map(i => ({ id: i.id, size: i.size, color: i.color, qty: i.qty })),
    };
    [...DRAFT_FIELDS, 'paymentMethod'].forEach(clearError);
    const errors = validate(data);
    if (Object.keys(errors).length) { setErrors(errors); return; }

    submitting = true;
    const buttons = $$('.co-submit');
    buttons.forEach(b => { b.disabled = true; b.firstElementChild.textContent = 'Placing order…'; });
    try {
      const res = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.fields) setErrors(body.fields);
        throw new Error(body.error || 'We couldn’t place your order. Please try again.');
      }
      // Remember the order so the customer can find it again, then empty the bag.
      const recent = store.get('jd-orders', []).filter(o => o.number !== body.number);
      store.set('jd-orders', [{ number: body.number, token: body.token, at: Date.now() }, ...recent].slice(0, 10));
      store.set('jd-cart', []);
      try { localStorage.removeItem('jd-checkout'); } catch { /* ignore */ }
      location.href = body.url;
    } catch (err) {
      showAlert(err.message === 'Failed to fetch' ? 'We couldn’t reach the store. Please check your connection and try again.' : err.message);
      submitting = false;
      buttons.forEach(b => { b.disabled = false; b.firstElementChild.textContent = 'Place order'; });
    }
  });
})();
