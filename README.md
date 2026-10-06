# Jaydaar

Women's clothing storefront with a **Cash on Delivery** and **Bank Transfer** checkout, plus an admin dashboard for managing orders.

## Run it

Requires **Node.js 22.13 or newer** (uses the built-in SQLite database).

```bash
npm install
cp .env.example .env     # then edit .env — at least set ADMIN_PASSWORD and your BANK_* details
npm start
```

- Store: http://localhost:3000
- Admin: http://localhost:3000/admin

> The site must be opened through the server (not by double-clicking `index.html`) for checkout to work.

## How orders work

| | Cash on Delivery | Bank Transfer |
|---|---|---|
| Customer places order | Status **New order**, payment **Pay on delivery** | Status **New order**, payment **Awaiting transfer** — bank details are shown |
| Payment | Collected by courier | Customer uploads a slip on their order page → **Slip to review** |
| Admin | **Confirm order** → **Mark as shipped** → **Delivered — cash collected** | **Verify payment** (auto-confirms) or **Reject slip** with a reason → ship → deliver |

Customers get a private order link (saved in their browser) showing live status, payment instructions and updates.
Prices are always recalculated on the server from `js/data.js`, so totals can't be changed in the browser.

## Where things live

- `js/data.js` — products and prices (the server reloads it automatically when you save)
- `.env` — admin password, delivery fee, bank details, WhatsApp number
- `server/data/jaydaar.db` — orders database (back this file up)
- `server/uploads/` — payment slips (private; only visible in the admin)

## Going live

Host on any service that runs Node.js (e.g. Render, Railway, a VPS) — static hosting alone won't run checkout.
Serve over HTTPS and set `COOKIE_SECURE=true` (and `TRUST_PROXY=true` behind a proxy). Keep `server/data` and
`server/uploads` on persistent storage.
