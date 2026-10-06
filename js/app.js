(() => {
  'use strict';

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const money = n => CURRENCY + n.toLocaleString('en-US');
  const pad = n => String(n).padStart(2, '0');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const CATEGORY = { saree: 'Sarees', sets: 'Sets & Co-ords', dresses: 'Dresses', men: 'Men' };
  const findProduct = id => PRODUCTS.find(p => p.id === id);

  const store = {
    get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
    set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* storage unavailable */ } }
  };

  /* ---------- Broken image fallback ---------- */
  document.addEventListener('error', e => {
    const img = e.target;
    if (img.tagName === 'IMG') { img.classList.add('img-fallback'); img.parentElement?.classList.add('img-wrap-fallback'); }
  }, true);

  /* ---------- Split text ---------- */
  $$('[data-split]').forEach(word => {
    const text = word.textContent;
    const accent = word.classList.contains('word--accent');
    word.textContent = '';
    // accent word is revealed as one unit so its gradient stays continuous
    const parts = accent ? [text] : [...text];
    parts.forEach(ch => {
      const mask = document.createElement('span');
      mask.className = 'char-mask';
      const c = document.createElement('span');
      c.className = 'char' + (accent ? ' accent-fill' : '');
      c.textContent = ch;
      mask.appendChild(c);
      word.appendChild(mask);
    });
  });
  $$('.hero__title .char').forEach((c, i) => { c.style.transitionDelay = (0.15 + i * 0.035) + 's'; });

  /* ---------- Preloader ---------- */
  const start = performance.now();
  const finishLoading = () => {
    const wait = Math.max(0, 2700 - (performance.now() - start));
    setTimeout(() => {
      $('#preloader').classList.add('is-done');
      setTimeout(() => {
        document.body.classList.remove('is-loading');
        document.body.classList.add('is-ready');
        heroStarted = true;
      }, 900); // start the hero intro as the curtain lifts
    }, reduceMotion ? 0 : wait);
  };
  let loaded = false;
  const onceLoaded = () => { if (!loaded) { loaded = true; finishLoading(); } };
  window.addEventListener('load', onceLoaded);
  setTimeout(onceLoaded, 4000); // don't let slow images hold the page hostage

  /* ---------- Custom cursor ---------- */
  const cursor = $('.cursor');
  if (finePointer && !reduceMotion) {
    const dot = $('.cursor__dot'), ring = $('.cursor__ring'), label = $('.cursor__label');
    let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
    addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; dot.style.transform = `translate(${mx}px, ${my}px)`; });
    (function loop() {
      rx += (mx - rx) * 0.16; ry += (my - ry) * 0.16;
      ring.style.transform = `translate(${rx}px, ${ry}px)`;
      requestAnimationFrame(loop);
    })();
    document.addEventListener('mouseover', e => {
      const labelled = e.target.closest('[data-cursor]');
      const inner = e.target.closest('button, a');
      // a button inside a labelled area (wishlist, sizes) gets the plain hover ring
      const useLabel = labelled && !(inner && labelled.contains(inner) && inner !== labelled);
      const hoverable = e.target.closest('a, button, [data-hover]');
      cursor.classList.toggle('has-label', !!useLabel);
      cursor.classList.toggle('is-hover', !!hoverable && !useLabel);
      if (useLabel) label.textContent = labelled.dataset.cursor;
    });
    document.addEventListener('mouseleave', () => { cursor.style.opacity = 0; });
    document.addEventListener('mouseenter', () => { cursor.style.opacity = 1; });
  } else {
    cursor.remove();
  }

  /* ---------- Magnetic buttons ---------- */
  if (finePointer && !reduceMotion) {
    $$('.magnetic').forEach(btn => {
      btn.addEventListener('mousemove', e => {
        const r = btn.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
        btn.style.transform = `translate(${x * 0.25}px, ${y * 0.35}px)`;
      });
      btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
    });
  }

  /* ---------- Nav ---------- */
  const nav = $('#nav');
  let lastY = 0;
  const onNavScroll = () => {
    const y = scrollY;
    nav.classList.toggle('is-scrolled', y > 40);
    const menuOpen = $('#mmenu').classList.contains('is-open');
    nav.classList.toggle('is-hidden', !menuOpen && y > 700 && y > lastY + 4);
    if (y < lastY - 4) nav.classList.remove('is-hidden');
    lastY = y;
  };

  const burger = $('#burger'), mmenu = $('#mmenu');
  const toggleMenu = open => {
    burger.classList.toggle('is-open', open);
    mmenu.classList.toggle('is-open', open);
    document.body.classList.toggle('no-scroll', open);
  };
  burger.addEventListener('click', () => toggleMenu(!mmenu.classList.contains('is-open')));
  $$('#mmenu a').forEach(a => a.addEventListener('click', () => toggleMenu(false)));

  /* ==========================================================
     HERO — one look at a time; the sky takes its colours
     ========================================================== */
  const hero = $('#hero'), frame = $('#heroFrame'), heroIndex = $('#heroIndex');
  const HERO_DUR = 6500;
  let heroCurrent = 0, heroElapsed = 0, heroPaused = false, heroStarted = false, heroVisible = true;

  frame.innerHTML = PRODUCTS.map((p, i) => `
    <div class="hero__slide${i === 0 ? ' is-active' : ''}">
      <img src="${p.images[0]}" alt="${p.name}" ${i > 1 ? 'loading="lazy"' : ''} />
    </div>`).join('');
  $('#heroTotal').textContent = pad(PRODUCTS.length);
  heroIndex.innerHTML = PRODUCTS.map((p, i) => `
    <li><button class="${i === 0 ? 'is-active' : ''}" style="--sw:${p.colors[0].hex}" aria-label="${p.name}" data-look="${i}">${pad(i + 1)}<i></i><b></b></button></li>`).join('');
  const slides = $$('.hero__slide', frame), dots = $$('button', heroIndex);

  const swapText = (el, text) => { el.innerHTML = `<span class="swap">${text}</span>`; };
  function paintSky(el, p) {
    el.style.setProperty('--a1', p.sky[0]);
    el.style.setProperty('--a2', p.sky[1]);
    el.style.setProperty('--a3', p.sky[2]);
  }
  function setNextThumb() {
    const next = PRODUCTS[(heroCurrent + 1) % PRODUCTS.length];
    $('#heroNextImg').innerHTML = `<img src="${next.images[0]}" alt="" />`;
    $('#heroNext').setAttribute('aria-label', `Next look: ${next.name}`);
  }
  function setLook(i, initial = false) {
    i = (i + PRODUCTS.length) % PRODUCTS.length;
    if (i === heroCurrent && !initial) return;
    const p = PRODUCTS[i];
    if (!initial) {
      slides.forEach((s, n) => {
        s.classList.toggle('is-prev', n === heroCurrent);
        s.classList.toggle('is-active', n === i);
      });
    }
    heroCurrent = i;
    heroElapsed = 0;
    dots.forEach((d, n) => { d.classList.toggle('is-active', n === i); d.style.setProperty('--p', 0); });
    paintSky(hero, p);
    swapText($('#heroNum'), pad(i + 1));
    swapText($('#heroName'), p.name);
    swapText($('#heroTone'), p.colors[0].name);
    $('#heroPrice').textContent = money(p.price);
    setNextThumb();
    announceLook();
  }
  // the WebGL layer (hero-gl.js) listens for this to play its transitions
  const announceLook = () => hero.dispatchEvent(new CustomEvent('hero:look', { detail: { index: heroCurrent } }));
  setLook(0, true);

  heroIndex.addEventListener('click', e => {
    const b = e.target.closest('[data-look]');
    if (b) setLook(+b.dataset.look);
  });
  $('#heroNext').addEventListener('click', () => setLook(heroCurrent + 1));
  frame.addEventListener('click', () => openModal(PRODUCTS[heroCurrent]));
  $('#heroNow').addEventListener('click', () => openModal(PRODUCTS[heroCurrent]));
  const stage = $('#heroStage');
  stage.addEventListener('mouseenter', () => { heroPaused = true; });
  stage.addEventListener('mouseleave', () => { heroPaused = false; });
  new IntersectionObserver(([en]) => { heroVisible = en.isIntersecting; }).observe(hero);

  // autoplay with a progress line on the active look
  let heroLast = performance.now();
  (function heroLoop(now) {
    const dt = Math.min(now - heroLast, 100);
    heroLast = now;
    const modalOpen = document.body.classList.contains('no-scroll');
    if (heroStarted && !reduceMotion && !heroPaused && heroVisible && !modalOpen && !document.hidden) {
      heroElapsed += dt;
      dots[heroCurrent].style.setProperty('--p', Math.min(1, heroElapsed / HERO_DUR));
      if (heroElapsed >= HERO_DUR) setLook(heroCurrent + 1);
    }
    requestAnimationFrame(heroLoop);
  })(heroLast);

  // swipe between looks on touch screens
  let touchX = null;
  stage.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', e => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) setLook(heroCurrent + (dx < 0 ? 1 : -1));
    touchX = null;
  });

  // the stage leans gently toward the pointer
  if (finePointer && !reduceMotion) {
    let tx = 0, ty = 0, cx = 0, cy = 0;
    hero.addEventListener('mousemove', e => {
      tx = (e.clientX / innerWidth - 0.5) * 2;
      ty = (e.clientY / innerHeight - 0.5) * 2;
    });
    hero.addEventListener('mouseleave', () => { tx = ty = 0; });
    const nextCard = $('#heroNext'), badge = $('.hero__badge');
    (function loop() {
      cx += (tx - cx) * 0.06; cy += (ty - cy) * 0.06;
      if (heroVisible) {
        stage.style.translate = `${cx * -10}px ${cy * -8}px`;
        nextCard.style.translate = `${cx * -22}px ${cy * -18}px`;
        badge.style.translate = `${cx * 16}px ${cy * 12}px`;
      }
      requestAnimationFrame(loop);
    })();
  }

  /* ==========================================================
     COLOUR STORY — horizontal scroll, the room changes colour
     ========================================================== */
  const cstory = $('#colour-story'), csTrack = $('#csTrack');
  csTrack.innerHTML = PRODUCTS.map((p, i) => {
    const [first, ...rest] = p.name.split(' ');
    return `
      <article class="cs${i === 0 ? ' is-active' : ''}">
        <span class="cs__num" aria-hidden="true">${pad(i + 1)}</span>
        <figure class="cs__front" data-product="${p.id}" data-cursor="View"><img src="${p.images[0]}" alt="${p.name}" loading="lazy" /></figure>
        <div class="cs__side">
          <figure class="cs__detail"><img src="${p.images[1] || p.images[0]}" alt="" loading="lazy" /></figure>
          <div class="cs__text">
            <span class="cs__look">Look ${pad(i + 1)} — ${p.colors[0].name}</span>
            <h3 class="cs__name">${first}</h3>
            <p class="cs__tag">${rest.join(' ')} · ${p.tagline}</p>
            <div class="cs__meta"><span class="cs__sw"><i style="background:${p.sky[0]}"></i><i style="background:${p.sky[1]}"></i></span><span class="cs__price">${money(p.price)}</span></div>
            <button class="btn btn--outline-light" data-product="${p.id}" data-hover><span>Shop the look</span></button>
          </div>
        </div>
      </article>`;
  }).join('');
  $('#csTotal').textContent = pad(PRODUCTS.length);
  const panels = $$('.cs', csTrack), csIntro = $('.cstory__intro');
  const cs = { dist: 0, centers: [], active: -1 };
  paintSky(cstory, PRODUCTS[0]);

  function measureStory() {
    csTrack.style.transform = 'none';
    cs.dist = Math.max(0, csTrack.scrollWidth - innerWidth);
    cs.centers = panels.map(el => el.offsetLeft + el.offsetWidth / 2);
    cstory.style.height = (innerHeight + cs.dist) + 'px';
    updateStory();
  }
  function updateStory() {
    const r = cstory.getBoundingClientRect();
    const total = cstory.offsetHeight - innerHeight;
    const p = total > 0 ? clamp(-r.top / total, 0, 1) : 0;
    const x = -p * cs.dist;
    csTrack.style.transform = `translate3d(${x}px,0,0)`;
    $('#csProgress').style.transform = `scaleX(${p})`;
    // the intro steps aside before the looks slide underneath it
    const away = clamp(-x / (innerWidth * 0.22), 0, 1);
    csIntro.style.opacity = 1 - away;
    csIntro.style.translate = `${-away * 60}px 0`;
    // the panel nearest the middle of the screen sets the light
    const mid = innerWidth * (innerWidth > 960 ? 0.58 : 0.5) - x;
    let best = 0;
    cs.centers.forEach((c, i) => { if (Math.abs(c - mid) < Math.abs(cs.centers[best] - mid)) best = i; });
    if (best !== cs.active) {
      cs.active = best;
      panels.forEach((el, i) => el.classList.toggle('is-active', i === best));
      paintSky(cstory, PRODUCTS[best]);
      $('#csNum').textContent = pad(best + 1);
    }
  }

  /* ---------- Scroll-driven effects ---------- */
  const storyImg = $('.story__img--main img');
  const onScroll = () => {
    onNavScroll();
    updateStory();
    if (reduceMotion) return;
    const vh = innerHeight;
    const sr = storyImg.getBoundingClientRect();
    if (sr.bottom > 0 && sr.top < vh) {
      const p = (sr.top + sr.height / 2 - vh / 2) / vh;
      storyImg.style.transform = `scale(1.15) translateY(${p * 60}px)`;
    }
  };

  let ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { onScroll(); ticking = false; });
  }, { passive: true });
  let resizeTimer;
  addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(measureStory, 120); });
  addEventListener('load', measureStory);
  document.fonts?.ready.then(measureStory);

  /* ---------- In Motion: reels play only while on screen ---------- */
  const reelIO = new IntersectionObserver(entries => {
    entries.forEach(en => {
      const v = en.target;
      if (en.isIntersecting && !reduceMotion) v.play().catch(() => {});
      else v.pause();
    });
  }, { threshold: 0.35 });
  $$('.reel video').forEach(v => reelIO.observe(v));

  /* ---------- Reveal on scroll ---------- */
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  $$('.reveal').forEach(el => io.observe(el));

  /* ==========================================================
     PRODUCTS
     ========================================================== */
  const grid = $('#products');
  let wishlist = new Set(store.get('jd-wish', []).filter(findProduct));

  const heartSVG = '<svg viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-9.3-9.3C1.4 7.8 3.6 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.6 3.3 4.3 6.7-1.8 4.7-9.3 9.3-9.3 9.3Z"/></svg>';
  const plusSVG = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';

  function cardHTML(p, i) {
    const badge = p.badge ? `<span class="card__badge">${p.badge}</span>` : '';
    return `
      <article class="card${p.featured ? ' card--feature' : ''}" data-id="${p.id}" data-cat="${p.category}" style="transition-delay:${(i % 4) * 0.08}s">
        <div class="card__media" data-cursor="View">
          <div class="card__photo">
            <img class="main" src="${p.images[0]}" alt="${p.name}" loading="lazy" decoding="async" />
            ${p.images[1] ? `<img class="alt" src="${p.images[1]}" alt="" loading="lazy" decoding="async" />` : ''}
          </div>
          ${badge}
          <button class="card__wish ${wishlist.has(p.id) ? 'is-active' : ''}" aria-label="Save ${p.name} to wishlist">${heartSVG}</button>
          <div class="card__quick">
            <p>Quick add — select size</p>
            <div class="card__sizes">${p.sizes.map(s => `<button data-size="${s}">${s}</button>`).join('')}</div>
          </div>
          <button class="card__add-mobile" aria-label="Add ${p.name} to bag">${plusSVG}</button>
        </div>
        <div class="card__body">
          <div>
            <div class="card__cat">${CATEGORY[p.category]}</div>
            <h3 class="card__name">${p.name}</h3>
            <p class="card__tag">${p.tagline}</p>
            <div class="card__colors">${p.colors.map(c => `<i style="background:${c.hex}" title="${c.name}"></i>`).join('')}</div>
          </div>
          <div class="card__price">${money(p.price)}</div>
        </div>
      </article>`;
  }
  const promoHTML = `
    <aside class="promo">
      <div class="promo__sky" aria-hidden="true"></div>
      <p class="eyebrow"><span class="line"></span> The Batik Story</p>
      <h3>Every piece<br/>is drawn in <em>wax.</em></h3>
      <p>Golden waves, turmeric hearts, lotus and fern — follow the collection colour by colour.</p>
      <a href="#colour-story" class="btn btn--light" data-hover><span>The Colour Story</span></a>
    </aside>`;

  const cardIO = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('is-in'); cardIO.unobserve(en.target); } });
  }, { threshold: 0.1 });

  function renderProducts(filter = 'all') {
    const list = PRODUCTS.filter(p => filter === 'all' || p.category === filter);
    // on the full grid, a featured piece + an editorial tile fill whole rows
    list.forEach((p, i) => { p.featured = filter === 'all' && i === 0; });
    grid.innerHTML = list.map(cardHTML).join('') + (filter === 'all' ? promoHTML : '');
    $$('.card, .promo', grid).forEach(c => cardIO.observe(c));
    if (finePointer && !reduceMotion) bindTilt();
  }

  function bindTilt() {
    $$('.card__media', grid).forEach(m => {
      m.addEventListener('mousemove', e => {
        const r = m.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        m.style.transform = `perspective(900px) rotateY(${x * 5}deg) rotateX(${-y * 5}deg)`;
      });
      m.addEventListener('mouseleave', () => {
        m.style.transition = 'transform .8s cubic-bezier(.22,1,.36,1)';
        m.style.transform = '';
        setTimeout(() => { m.style.transition = ''; }, 800);
      });
    });
  }

  renderProducts();

  // Filters with sliding pill
  const filters = $('#filters'), pill = $('#filterPill');
  const movePill = btn => {
    pill.style.width = btn.offsetWidth + 'px';
    pill.style.height = btn.offsetHeight + 'px';
    pill.style.transform = `translate(${btn.offsetLeft}px, ${btn.offsetTop}px)`;
  };
  const setFilter = f => {
    const btn = $(`.filter[data-filter="${f}"]`, filters);
    if (!btn || btn.classList.contains('is-active')) return;
    $$('.filter', filters).forEach(b => b.classList.toggle('is-active', b === btn));
    movePill(btn);
    $$('.card, .promo', grid).forEach(c => c.classList.add('is-out'));
    setTimeout(() => renderProducts(f), reduceMotion ? 0 : 320);
  };
  filters.addEventListener('click', e => { const b = e.target.closest('.filter'); if (b) setFilter(b.dataset.filter); });
  requestAnimationFrame(() => movePill($('.filter.is-active', filters)));
  addEventListener('resize', () => movePill($('.filter.is-active', filters)));
  document.fonts?.ready.then(() => movePill($('.filter.is-active', filters)));
  $$('[data-filter-link]').forEach(a => a.addEventListener('click', () => setFilter(a.dataset.filterLink)));

  // Card interactions (delegated)
  grid.addEventListener('click', e => {
    const card = e.target.closest('.card');
    if (!card) return;
    const p = findProduct(card.dataset.id);
    const img = $('img.main', card);

    const wish = e.target.closest('.card__wish');
    if (wish) { toggleWish(p.id, wish); return; }

    const sizeBtn = e.target.closest('[data-size]');
    if (sizeBtn) { addToCart(p, sizeBtn.dataset.size, p.colors[0].name, 1, img); return; }

    if (e.target.closest('.card__add-mobile') || e.target.closest('.card__media') || e.target.closest('.card__name')) {
      openModal(p);
    }
  });

  // anything tagged with a product (colour story, details) opens its quick view
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-product]');
    if (!el) return;
    const p = findProduct(el.dataset.product);
    if (p) openModal(p);
  });

  /* ---------- Wishlist ---------- */
  const wishCount = $('#wishCount');
  const renderWish = () => {
    wishCount.textContent = wishlist.size;
    wishCount.classList.toggle('is-visible', wishlist.size > 0);
  };
  function toggleWish(id, btn) {
    const p = findProduct(id);
    if (wishlist.has(id)) { wishlist.delete(id); btn.classList.remove('is-active'); }
    else { wishlist.add(id); btn.classList.add('is-active'); toast(p.images[0], 'Saved to wishlist', p.name); }
    store.set('jd-wish', [...wishlist]);
    renderWish();
  }
  renderWish();
  $('#wishBtn').addEventListener('click', () => {
    toast(null, `${wishlist.size} saved ${wishlist.size === 1 ? 'piece' : 'pieces'}`, 'Wishlist page coming soon');
  });
  $('#searchBtn').addEventListener('click', () => toast(null, 'Search', 'Coming soon'));

  /* ---------- Quick view modal ---------- */
  const modal = $('#modal');
  const m = { product: null, size: null, color: null, qty: 1 };

  function openModal(p) {
    Object.assign(m, { product: p, size: null, color: p.colors[0].name, qty: 1 });
    paintSky($('.modal__panel', modal), p);
    $('#mImg').src = p.images[0];
    $('#mImg').alt = p.name;
    $('#mThumbs').innerHTML = p.images.length < 2 ? '' : p.images.map((src, i) => `<button class="${i === 0 ? 'is-active' : ''}" data-src="${src}" aria-label="View ${i + 1}"><img src="${src}" alt="" /></button>`).join('');
    $('#mCat').innerHTML = `<span class="line"></span> ${CATEGORY[p.category]}`;
    $('#mName').textContent = p.name;
    $('#mTagline').textContent = p.tagline;
    $('#mPrice').textContent = money(p.price);
    $('#mDesc').textContent = p.desc;
    $('#mColorName').textContent = m.color;
    $('#mColors').innerHTML = p.colors.map((c, i) => `<button class="${i === 0 ? 'is-active' : ''}" style="background:${c.hex}" data-color="${c.name}" aria-label="${c.name}"></button>`).join('');
    $('#mSizes').innerHTML = p.sizes.map(s => `<button data-size="${s}">${s}</button>`).join('');
    $('#mQty').textContent = 1;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
  }
  function closeModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    if (!cartEl.classList.contains('is-open')) document.body.classList.remove('no-scroll');
  }
  modal.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) return closeModal();
    const thumb = e.target.closest('#mThumbs button');
    if (thumb) {
      $$('#mThumbs button').forEach(b => b.classList.toggle('is-active', b === thumb));
      const big = $('#mImg');
      big.style.opacity = 0;
      setTimeout(() => { big.src = thumb.dataset.src; big.style.opacity = 1; }, 200);
    }
    const sw = e.target.closest('#mColors button');
    if (sw) {
      m.color = sw.dataset.color;
      $$('#mColors button').forEach(b => b.classList.toggle('is-active', b === sw));
      $('#mColorName').textContent = m.color;
    }
    const sz = e.target.closest('#mSizes button');
    if (sz) {
      m.size = sz.dataset.size;
      $$('#mSizes button').forEach(b => b.classList.toggle('is-active', b === sz));
    }
  });
  $('#mMinus').addEventListener('click', () => { m.qty = Math.max(1, m.qty - 1); $('#mQty').textContent = m.qty; });
  $('#mPlus').addEventListener('click', () => { m.qty = Math.min(10, m.qty + 1); $('#mQty').textContent = m.qty; });
  $('#mAdd').addEventListener('click', () => {
    if (!m.size) {
      const s = $('#mSizes');
      s.classList.remove('shake'); void s.offsetWidth; s.classList.add('shake');
      toast(null, 'Please select a size', m.product.name);
      return;
    }
    addToCart(m.product, m.size, m.color, m.qty, $('#mImg'));
    closeModal();
  });

  /* ---------- Bag ---------- */
  const cartEl = $('#cart'), overlay = $('#overlay');
  let cart = store.get('jd-cart', []).filter(i => findProduct(i.id));

  const openCart = () => {
    cartEl.classList.add('is-open'); overlay.classList.add('is-open');
    document.body.classList.add('no-scroll');
  };
  const closeCart = () => {
    cartEl.classList.remove('is-open'); overlay.classList.remove('is-open');
    if (!modal.classList.contains('is-open')) document.body.classList.remove('no-scroll');
  };
  $('#cartBtn').addEventListener('click', openCart);
  $('#cartClose').addEventListener('click', closeCart);
  overlay.addEventListener('click', closeCart);
  $('#emptyShop').addEventListener('click', closeCart);
  addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (modal.classList.contains('is-open')) closeModal();
    else if (cartEl.classList.contains('is-open')) closeCart();
    else if (mmenu.classList.contains('is-open')) toggleMenu(false);
  });

  function addToCart(p, size, color, qty, sourceImg) {
    const key = `${p.id}|${size}|${color}`;
    const existing = cart.find(i => i.key === key);
    if (existing) existing.qty = Math.min(10, existing.qty + qty);
    else cart.push({ key, id: p.id, size, color, qty });
    saveCart();
    flyToCart(sourceImg, p.images[0], () => {
      renderCart();
      const btn = $('#cartBtn');
      btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump');
    });
    toast(p.images[0], 'Added to bag', `${p.name} · ${size}`);
  }

  function flyToCart(sourceImg, src, done) {
    const target = $('#cartBtn').getBoundingClientRect();
    const from = sourceImg?.getBoundingClientRect();
    if (reduceMotion || !from || !from.width || !Element.prototype.animate) { done(); return; }
    const clone = document.createElement('img');
    clone.src = src; clone.className = 'fly';
    const w = Math.min(from.width, 220), h = w * 1.4;
    const sx = from.left + from.width / 2 - w / 2, sy = from.top + from.height / 2 - h / 2;
    Object.assign(clone.style, { left: sx + 'px', top: sy + 'px', width: w + 'px', height: h + 'px' });
    document.body.appendChild(clone);
    const dx = target.left + target.width / 2 - (sx + w / 2);
    const dy = target.top + target.height / 2 - (sy + h / 2);
    const anim = clone.animate([
      { transform: 'translate(0,0) scale(1) rotate(0)', opacity: 1, borderRadius: '14px' },
      { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 80}px) scale(.6) rotate(-8deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(.08) rotate(10deg)`, opacity: 0.3, borderRadius: '50%' }
    ], { duration: 950, easing: 'cubic-bezier(.65,0,.35,1)' });
    anim.onfinish = () => { clone.remove(); done(); };
  }

  function saveCart() { store.set('jd-cart', cart.map(({ key, id, size, color, qty }) => ({ key, id, size, color, qty }))); }

  function renderCart() {
    const count = cart.reduce((s, i) => s + i.qty, 0);
    const subtotal = cart.reduce((s, i) => s + findProduct(i.id).price * i.qty, 0);

    const badge = $('#cartCount');
    badge.textContent = count;
    badge.classList.toggle('is-visible', count > 0);
    $('#cartHeadCount').textContent = `(${count})`;
    cartEl.classList.toggle('is-empty', count === 0);

    $('#cartItems').innerHTML = cart.map(i => {
      const p = findProduct(i.id);
      return `
        <div class="citem" data-key="${i.key}">
          <img src="${p.images[0]}" alt="${p.name}" />
          <div>
            <div class="citem__top">
              <div><div class="citem__name">${p.name}</div><div class="citem__meta">${i.color} · ${i.size}</div></div>
              <strong>${money(p.price * i.qty)}</strong>
            </div>
            <div class="citem__bottom">
              <div class="qty"><button data-act="dec" aria-label="Decrease">−</button><span>${i.qty}</span><button data-act="inc" aria-label="Increase">+</button></div>
              <button class="citem__remove" data-act="remove">Remove</button>
            </div>
          </div>
        </div>`;
    }).join('');

    $('#cartSubtotal').textContent = money(subtotal);
    const left = FREE_SHIP - subtotal;
    $('#shipText').innerHTML = left > 0
      ? `You're <b>${money(left)}</b> away from complimentary delivery`
      : `✦ You've unlocked <b>complimentary delivery</b>`;
    $('#shipBar').style.width = Math.min(100, (subtotal / FREE_SHIP) * 100) + '%';
    $('#cartShipping').textContent = left > 0 ? 'Calculated at checkout' : 'Complimentary';
  }

  $('#cartItems').addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const row = btn.closest('.citem');
    const item = cart.find(i => i.key === row.dataset.key);
    const act = btn.dataset.act;
    if (act === 'inc') item.qty = Math.min(10, item.qty + 1);
    if (act === 'dec') item.qty -= 1;
    if (act === 'remove' || item.qty < 1) {
      cart = cart.filter(i => i !== item);
      saveCart();
      row.classList.add('is-removing');
      setTimeout(renderCart, reduceMotion ? 0 : 450);
      return;
    }
    saveCart();
    renderCart();
  });

  $('#checkoutBtn').addEventListener('click', () => {
    if (!cart.length) return;
    location.href = 'checkout.html';
  });

  renderCart();

  /* ---------- Toast ---------- */
  const toastEl = $('#toast');
  let toastTimer;
  function toast(img, title, text) {
    const ti = $('#toastImg');
    ti.style.display = img ? '' : 'none';
    if (img) ti.src = img;
    $('#toastTitle').textContent = title;
    $('#toastText').textContent = text;
    toastEl.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-show'), 2800);
  }

  /* ---------- Newsletter ---------- */
  $('#newsForm').addEventListener('submit', e => {
    e.preventDefault();
    e.target.reset();
    toast(null, 'Welcome to the Jaydaar Circle', 'Your 10% code: JAYDAAR10');
  });

  measureStory();
  onScroll();
})();
