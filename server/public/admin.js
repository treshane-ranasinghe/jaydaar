// Small enhancements for the admin pages (kept external for the Content-Security-Policy).
document.addEventListener('click', e => {
  const row = e.target.closest('tr[data-href]');
  if (row && !e.target.closest('a')) location.href = row.dataset.href;
});
document.addEventListener('submit', e => {
  const b = e.submitter;
  if (b && b.dataset.confirm && !confirm(b.dataset.confirm)) { e.preventDefault(); return; }
  if (b && e.target.method === 'post') { b.disabled = true; b.textContent = 'Saving…'; }
});
