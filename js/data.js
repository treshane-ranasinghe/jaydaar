// Product catalogue — the server prices every order from this file.
// Prices marked "placeholder" are not confirmed yet — update them to your real prices.
const CURRENCY = 'Rs ';
const FREE_SHIP = 15000;
const IMG = (name, count) => Array.from({ length: count }, (_, i) => `assets/images/${name}-${i + 1}.jpg`);
const FREE_SIZE = ['Free Size'];
const SIZES = ['XS', 'S', 'M', 'L', 'XL'];

// `sky` tints the ambient light around a piece: [main glow, second glow, deep backdrop]
const PRODUCTS = [
  {
    id: 'ranwan-wave-saree', name: 'Ranwan Wave Batik Saree', category: 'saree', price: 14500, // placeholder price
    images: IMG('ranwan-wave-saree', 3),
    colors: [{ name: 'Black / Gold', hex: '#d4c22e' }],
    sky: ['#d9c53a', '#efe6b0', '#16140c'],
    sizes: FREE_SIZE, badge: 'Signature',
    tagline: 'Gold waves on midnight cotton',
    desc: 'A sweeping pallu of gold and white batik waves, crackled by hand, falling against deep black cotton. The pleats are scattered with gold and ivory dashes so the saree moves like light on water.'
  },
  {
    id: 'kaha-hearts-saree', name: 'Kaha Hearts Batik Saree', category: 'saree', price: 13900, // placeholder price
    images: IMG('kaha-hearts-saree', 2),
    colors: [{ name: 'Turmeric / Maroon', hex: '#e9a12c' }],
    sky: ['#eaa22f', '#a3262a', '#2a0f0a'],
    sizes: FREE_SIZE, badge: 'New',
    tagline: 'Turmeric pallu, maroon pleats',
    desc: 'Warm turmeric cotton crackled with black veins and dotted with hand-waxed hearts and clubs, paired with maroon pleats that carry the same motifs in gold.'
  },
  {
    id: 'kalu-drape-set', name: 'Kalu Batik Drape Set', category: 'sets', price: 11500, // placeholder price
    images: IMG('kalu-drape-set', 3),
    colors: [{ name: 'Ash / Black / Red', hex: '#2a2626' }],
    sky: ['#c23a2c', '#d8d2d0', '#141112'],
    sizes: SIZES, badge: 'New',
    tagline: 'Crackle blouse & draped skirt',
    desc: 'A cropped V-neck blouse in ash-white batik crackle, with a black draped skirt finished at the waist in a patchwork of red, black and batik squares.'
  },
  {
    id: 'nila-saree', name: 'Nila Batik Saree', category: 'saree', price: 13500, // placeholder price
    images: IMG('nila-saree', 3),
    colors: [{ name: 'Sky Blue / White', hex: '#3fb3e3' }],
    sky: ['#41b4e4', '#d6eef8', '#0b2a3a'],
    sizes: FREE_SIZE,
    tagline: 'Oversized white blooms on sky blue',
    desc: 'Bold white petals painted large across a sky-blue pallu, softening into a clean blue drape with a white batik border at the hem.'
  },
  {
    id: 'rathu-mal-saree', name: 'Rathu Mal Batik Saree', category: 'saree', price: 13500, // placeholder price
    images: IMG('rathu-mal-saree', 3),
    colors: [{ name: 'Scarlet / White', hex: '#d42a2a' }],
    sky: ['#d9302c', '#f4c9c2', '#2e0a0a'],
    sizes: FREE_SIZE,
    tagline: 'White daisies on scarlet',
    desc: 'Scarlet cotton scattered with white batik daisies and trailing stems, finished with a bold striped border along the pallu.'
  },
  {
    id: 'nelum-puff-sleeve-saree', name: 'Nelum Puff-Sleeve Saree', category: 'saree', price: 15500, // placeholder price
    images: IMG('nelum-puff-sleeve-saree', 2),
    colors: [{ name: 'Lilac / Indigo', hex: '#9d8fd0' }],
    sky: ['#9a8ad2', '#cfd8f0', '#1b1630'],
    sizes: SIZES,
    tagline: 'Lotus batik with puffed sleeves',
    desc: 'Lilac and indigo batik with large lotus blooms, styled with a dramatic puff-sleeve jacket for weddings, poruwa ceremonies and festive days.'
  },
  {
    id: 'vana-kurta-set', name: 'Vana Leaf Kurta Set', category: 'sets', price: 9800, // placeholder price
    images: IMG('vana-kurta-set', 4),
    colors: [{ name: 'Emerald / Sage', hex: '#1f5a48' }],
    sky: ['#2a7a5e', '#c9d8b4', '#0b1f18'],
    sizes: SIZES,
    tagline: 'Emerald fern kurta, sage trousers',
    desc: 'A flowing emerald kurta printed with sweeping fern leaves, with a soft V neckline and full sleeves, worn over relaxed sage batik trousers.'
  },
  {
    id: 'kola-leaf-coord', name: 'Kola Leaf Co-ord', category: 'sets', price: 8900, // placeholder price
    images: IMG('kola-leaf-coord', 3),
    colors: [{ name: 'Sage / Forest', hex: '#a7b48a' }],
    sky: ['#9fb07e', '#e3e7cf', '#1a2214'],
    sizes: SIZES,
    tagline: 'Sleeveless top & wide trousers',
    desc: 'A sleeveless sage top hand-painted with forest-green leaves, matched with wide-leg trousers in a soft batik wash — easy, breathable, made for warm days.'
  },
  {
    id: 'ira-sunset-mini', name: 'Ira Sunset Mini Dress', category: 'dresses', price: 7500, // placeholder price
    images: IMG('ira-sunset-mini', 4),
    colors: [{ name: 'Sunset Orange', hex: '#d8501f' }],
    sky: ['#e0571f', '#f2b64a', '#2e100a'],
    sizes: SIZES,
    tagline: 'Fire-toned batik, tie back',
    desc: 'Flame orange and deep red batik in a strappy mini with a gathered skirt and an open lace-up tie back. Light, swingy and made for evenings out.'
  },
  {
    id: 'raja-sarong', name: 'Raja Batik Sarong', category: 'men', price: 6500, // placeholder price
    images: IMG('raja-sarong', 2),
    colors: [{ name: 'Black / Crimson', hex: '#1b1515' }],
    sky: ['#8c2a2a', '#d8d2c8', '#120e0e'],
    sizes: FREE_SIZE,
    tagline: 'Black sarong, crimson batik hem',
    desc: 'A classic black cotton sarong finished with a deep border of crimson and white batik crackle. Pair it with a crisp white shirt for an effortless festive look.'
  }
];
