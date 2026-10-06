// Loads the storefront catalogue (js/data.js) so prices have a single source of truth.
// The server always prices orders from this file, never from what the browser sends.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DATA_FILE = path.join(__dirname, '..', 'js', 'data.js');

function load() {
  const ctx = vm.createContext({});
  const source = fs.readFileSync(DATA_FILE, 'utf8') +
    '\n;globalThis.__catalog = { PRODUCTS, CURRENCY, FREE_SHIP };';
  vm.runInContext(source, ctx, { filename: 'js/data.js' });
  const { PRODUCTS, CURRENCY, FREE_SHIP } = ctx.__catalog;
  return {
    currency: CURRENCY,
    freeShip: FREE_SHIP,
    products: new Map(PRODUCTS.map(p => [p.id, p])),
  };
}

let catalog = load();
// Pick up price edits without restarting the server.
fs.watchFile(DATA_FILE, { interval: 2000 }, () => {
  try { catalog = load(); console.log('Catalogue reloaded from js/data.js'); }
  catch (err) { console.error('Could not reload js/data.js:', err.message); }
}).unref(); // don't keep the process alive just for this

module.exports = { get: () => catalog };
