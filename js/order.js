(() => {
  'use strict';

  const $ = (s, c = document) => c.querySelector(s);
  const money = n => CURRENCY + Number(n).toLocaleString('en-US');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const when = s => new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z')
    .toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const params = new URLSearchParams(location.search);
  const number = params.get('n'), token = params.get('t');
  const api = `/api/orders/${encodeURIComponent(number || '')}?t=${encodeURIComponent(token || '')}`;
  let whatsapp = '94725490944';

  function fail(msg) {
    $('#odLoading').hidden = true;
    const a = $('#odAlert');
    a.innerHTML = msg;
    a.hidden = false;
  }

  if (!number || !token) {
    fail('This order link is incomplete. Please use the link from your confirmation, or <a href="https://wa.me/94725490944" target="_blank" rel="noopener">message us on WhatsApp</a>.');
    return;
  }

  fetch('/api/config').then(r => r.json()).then(c => { whatsapp = c.whatsapp || whatsapp; updateHelp(); }).catch(() => {});
  function updateHelp() {
    $('#helpLink').href = `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hi Jaydaar, I have a question about order ${number}.`)}`;
  }
  updateHelp();

  async function load() {
    try {
      const res = await fetch(api, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'We couldn’t load this order.');
      render(body);
    } catch (err) {
      fail(esc(err.message === 'Failed to fetch' ? 'We couldn’t reach the store. Please check your connection and refresh.' : err.message));
    }
  }

  /* ---------- Rendering ---------- */
  function steps(o) {
    const list = [['placed', 'Order placed']];
    if (o.paymentMethod === 'bank') list.push(['paid', 'Payment verified']);
    list.push(['confirmed', 'Confirmed'], ['shipped', 'Shipped'], ['delivered', o.paymentMethod === 'cod' ? 'Delivered & paid' : 'Delivered']);
    const reached = {
      placed: true,
      paid: o.paymentStatus === 'paid',
      confirmed: ['confirmed', 'shipped', 'delivered'].includes(o.status),
      shipped: ['shipped', 'delivered'].includes(o.status),
      delivered: o.status === 'delivered',
    };
    const current = list.find(([k]) => !reached[k])?.[0];
    return list.map(([k, label]) => `<li class="${reached[k] ? 'is-done' : ''} ${k === current && o.status !== 'cancelled' ? 'is-current' : ''}"><span></span>${label}</li>`).join('');
  }

  function headline(o) {
    const first = esc(o.customer.name.split(' ')[0]);
    if (o.status === 'cancelled') return ['This order was cancelled', 'If you have any questions, message us on WhatsApp — we’re happy to help.'];
    if (o.status === 'delivered') return [`Delivered — enjoy, ${first}!`, 'Thank you for shopping with Jaydaar.'];
    if (o.status === 'shipped') return ['Your order is on its way', 'Keep your phone nearby — our courier will call before delivery.'];
    if (o.paymentMethod === 'bank' && o.paymentStatus !== 'paid') {
      return [`Thank you, ${first}`, 'Your order is reserved. Complete your bank transfer and upload the slip below to confirm it.'];
    }
    return [`Thank you, ${first}`, o.status === 'confirmed'
      ? 'Your order is confirmed and being prepared.'
      : 'We’ve received your order and will call you shortly to confirm it.'];
  }

  function bankBlock(o) {
    const b = o.bank;
    const rows = [['Bank', b.bankName], ['Account name', b.accountName], ['Account number', b.accountNumber], ['Branch', b.branch], ['Amount', money(o.total)], ['Reference', o.number]];
    const details = `<dl class="co-bank">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}${['Account number', 'Reference', 'Amount'].includes(k) ? ` <button type="button" class="co-copy" data-copy="${esc(k === 'Amount' ? o.total : v)}">Copy</button>` : ''}</dd>`).join('')}</dl>`;

    const rejection = o.paymentStatus === 'rejected'
      ? [...o.timeline].reverse().find(e => e.message.startsWith('We couldn’t verify'))?.message : null;

    const status = {
      awaiting_transfer: '<p class="od-pay-status">Waiting for your transfer.</p>',
      slip_submitted: '<p class="od-pay-status od-pay-status--ok">✓ Slip received — we’re verifying your payment. This usually takes a few hours during business days.</p>',
      rejected: `<p class="od-pay-status od-pay-status--err">${esc(rejection || 'We couldn’t verify your slip. Please upload a new one.')}</p>`,
      paid: '<p class="od-pay-status od-pay-status--ok">✓ Payment received — thank you!</p>',
    }[o.paymentStatus] || '';

    const uploader = o.canUploadSlip ? `
      <form class="od-upload" id="slipForm">
        <label class="od-drop" id="slipDrop">
          <input type="file" name="slip" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf" required />
          <span class="od-drop__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg></span>
          <span class="od-drop__text" id="slipName">${o.slipUploaded ? 'Upload a different slip' : 'Tap to upload your payment slip'}</span>
          <span class="od-drop__hint">Photo or PDF · up to 5 MB</span>
        </label>
        <button class="btn btn--dark btn--block" type="submit" disabled><span>Upload slip</span></button>
      </form>` : '';

    return `<h2>Bank transfer</h2>${status}${o.paymentStatus === 'paid' ? '' : details}${uploader}`;
  }

  function codBlock(o) {
    const s = o.paymentStatus === 'paid'
      ? '<p class="od-pay-status od-pay-status--ok">✓ Paid on delivery — thank you!</p>'
      : `<p class="od-cod-amount">${money(o.total)}</p><p>Please keep this amount ready in cash for our courier. We’ll call <strong>${esc(o.customer.phone)}</strong> before delivery.</p>`;
    return `<h2>Cash on delivery</h2>${s}`;
  }

  function render(o) {
    $('#odLoading').hidden = true;
    $('#odContent').hidden = false;
    document.body.classList.toggle('is-cancelled', o.status === 'cancelled');

    const [title, lead] = headline(o);
    $('#odNumber').textContent = `Order ${o.number}`;
    $('#odTitle').innerHTML = title;
    $('#odLead').textContent = lead;
    $('#odSteps').innerHTML = o.status === 'cancelled' ? '' : steps(o);
    $('#odSteps').hidden = o.status === 'cancelled';

    $('#odPayment').innerHTML = o.paymentMethod === 'bank' ? bankBlock(o) : codBlock(o);
    $('#odItems').innerHTML = o.items.map(i => `
      <li>
        <span class="co-thumb"><img src="${esc(i.image)}" alt="" /><b>${i.qty}</b></span>
        <span class="co-item-info"><strong>${esc(i.name)}</strong><small>${esc(i.size)} · ${esc(i.color)}</small></span>
        <span>${money(i.lineTotal)}</span>
      </li>`).join('');
    $('#odSubtotal').textContent = money(o.subtotal);
    $('#odDelivery').textContent = o.deliveryFee ? money(o.deliveryFee) : 'Free';
    $('#odTotal').textContent = money(o.total);
    $('#odAddress').innerHTML = `<strong>${esc(o.customer.name)}</strong><br>${esc(o.customer.address).replace(/\n/g, '<br>')}<br>${esc(o.customer.city)}, ${esc(o.customer.district)}<br>${esc(o.customer.phone)}`;
    $('#odTimeline').innerHTML = [...o.timeline].reverse().map(e => `<li><small>${esc(when(e.at))}</small><p>${esc(e.message)}</p></li>`).join('');

    bindUpload();
  }

  /* ---------- Slip upload ---------- */
  function bindUpload() {
    const form = $('#slipForm');
    if (!form) return;
    const input = form.elements.slip, button = form.querySelector('button');
    const drop = $('#slipDrop');

    input.addEventListener('change', () => {
      const f = input.files[0];
      button.disabled = !f;
      $('#slipName').textContent = f ? f.name : 'Tap to upload your payment slip';
      drop.classList.toggle('has-file', !!f);
    });
    ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, () => drop.classList.remove('is-over')));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      if (e.dataTransfer.files.length) { input.files = e.dataTransfer.files; input.dispatchEvent(new Event('change')); }
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const f = input.files[0];
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) { alert('That file is over 5 MB — please upload a smaller photo or PDF.'); return; }
      button.disabled = true;
      button.firstElementChild.textContent = 'Uploading…';
      const data = new FormData();
      data.append('slip', f);
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(number)}/slip?t=${encodeURIComponent(token)}`, { method: 'POST', body: data });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Upload failed. Please try again.');
        render(body);
        $('#odPayment').scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (err) {
        alert(err.message === 'Failed to fetch' ? 'We couldn’t reach the store. Please check your connection and try again.' : err.message);
        button.disabled = false;
        button.firstElementChild.textContent = 'Upload slip';
      }
    });
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('.co-copy');
    if (!b) return;
    navigator.clipboard?.writeText(b.dataset.copy).then(() => { b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1500); });
  });

  load();
})();
