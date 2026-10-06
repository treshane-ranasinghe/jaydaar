// Signature motion layer: smooth scroll, velocity marquee, manifesto, reveals.
(() => {
  'use strict';

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------- Preloader counter ---------- */
  const countEl = $('#loadCount'), lineEl = $('#loadLine');
  if (countEl) {
    const t0 = performance.now(), dur = reduce ? 1 : 2500;
    const tick = now => {
      const p = clamp((now - t0) / dur, 0, 1);
      const e = 1 - Math.pow(1 - p, 3);
      countEl.textContent = Math.round(e * 100);
      lineEl.style.transform = `scaleX(${e})`;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /* ---------- Remove the loader once its curtain has lifted ---------- */
  const preloader = $('#preloader');
  if (preloader) {
    const done = new MutationObserver(() => {
      if (!preloader.classList.contains('is-done')) return;
      done.disconnect();
      setTimeout(() => preloader.remove(), 2000); // after the curtain transition
    });
    done.observe(preloader, { attributes: true, attributeFilter: ['class'] });
  }

  /* ---------- Smooth scroll ---------- */
  let lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new Lenis({ lerp: 0.085, smoothWheel: true });
    const raf = t => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);

    // pause while the preloader, bag, modal or menu lock the page
    const sync = () => {
      const locked = document.body.classList.contains('is-loading') || document.body.classList.contains('no-scroll');
      locked ? lenis.stop() : lenis.start();
    };
    new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    sync();

    document.addEventListener('click', e => {
      const a = e.target.closest('a[href^="#"]');
      const id = a?.getAttribute('href');
      if (!id || id.length < 2) return;
      const target = id === '#top' ? 0 : document.querySelector(id);
      if (target === null) return;
      e.preventDefault();
      lenis.start();
      lenis.scrollTo(target, { duration: 1.6 });
    });
  }

  /* ---------- Word splitting (keeps <em>, <br> and pills intact) ---------- */
  function splitWords(root, wrap) {
    const units = [];
    [...root.childNodes].forEach(node => {
      if (node.nodeType === 3) {
        const frag = document.createDocumentFragment();
        node.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
          const el = wrap(part);
          units.push(el);
          frag.appendChild(el);
        });
        node.replaceWith(frag);
      } else if (node.nodeType === 1 && node.tagName !== 'BR') {
        if (node.classList.contains('pill')) units.push(node);
        else units.push(...splitWords(node, wrap));
      }
    });
    return units;
  }

  /* ---------- Headings rise word by word ---------- */
  const headIO = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('is-split-in'); headIO.unobserve(en.target); } });
  }, { threshold: 0.3 });
  $$('.section-head h2, .story__text h2, .newsletter__card h2, .cstory__intro h2').forEach(h => {
    const words = splitWords(h, text => {
      const outer = document.createElement('span'); outer.className = 'sw';
      const inner = document.createElement('span'); inner.className = 'swi'; inner.textContent = text;
      outer.appendChild(inner);
      return outer;
    });
    words.forEach((w, i) => { w.firstChild.style.transitionDelay = (i * 0.07) + 's'; });
    h.classList.add('split');
    if (reduce) h.classList.add('is-split-in'); else headIO.observe(h);
  });

  /* ---------- Manifesto ---------- */
  const manifesto = $('#manifestoText');
  const mUnits = manifesto ? splitWords(manifesto, text => {
    const s = document.createElement('span'); s.className = 'mw'; s.textContent = text; return s;
  }) : [];
  let lastLit = -1;
  function updateManifesto(vh, y) {
    const top = layout.manTop - y, h = layout.manH; // cached position, no layout read
    if (top + h < -vh || top > vh * 2) return;
    const p = clamp((vh * 0.82 - top) / (h + vh * 0.15), 0, 1);
    const lit = Math.round(p * mUnits.length);
    if (lit === lastLit) return;
    lastLit = lit;
    mUnits.forEach((u, i) => u.classList.toggle('is-lit', i < lit));
  }
  if (reduce) mUnits.forEach(u => u.classList.add('is-lit'));

  /* ---------- Nav links roll ---------- */
  $$('.nav__links a').forEach(a => {
    const t = a.textContent.trim();
    a.innerHTML = `<span class="roll"><span>${t}</span><span aria-hidden="true">${t}</span></span>`;
  });

  /* ---------- Footer wordmark ---------- */
  const big = $('.footer__big');
  if (big) {
    const word = big.textContent.trim();
    big.setAttribute('aria-label', word);
    big.innerHTML = [...word].map((ch, i) => `<span class="fbl" aria-hidden="true" style="transition-delay:${i * 0.05}s">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
    const fIO = new IntersectionObserver(([en]) => { if (en.isIntersecting) { big.classList.add('is-in'); fIO.disconnect(); } }, { threshold: 0.3 });
    fIO.observe(big);
    // let the per-letter hover colour respond instantly after the entrance
    big.addEventListener('transitionend', () => $$('.fbl', big).forEach(l => { l.style.transitionDelay = '0s'; }), { once: true });
  }

  /* ---------- Product card light ---------- */
  if (fine) {
    document.addEventListener('mousemove', e => {
      const m = e.target.closest && e.target.closest('.card__media');
      if (!m) return;
      const r = m.getBoundingClientRect();
      m.style.setProperty('--sx', (e.clientX - r.left) + 'px');
      m.style.setProperty('--sy', (e.clientY - r.top) + 'px');
    });
  }

  /* ---------- Velocity marquee ---------- */
  // always flows left; scrolling only adds a burst of speed and a lean
  const track = $('.marquee__track');
  const MARQUEE_SPEED = reduce ? 28 : 55; // px per second, independent of refresh rate
  let half = 0, mx = 0;
  const measure = () => { if (track) half = (track.scrollWidth + 32) / 2; };
  measure();
  addEventListener('resize', measure);
  document.fonts?.ready.then(measure);

  /* ---------- Nav turns light over dark sections ---------- */
  const nav = $('#nav');
  const darkZones = $$('.cstory, .footer');
  const heroContent = $('.hero__content'), heroStage = $('.hero__stage');

  /* ---------- Cached layout ----------
     Section positions are measured only when the page size changes, so the
     frame loop never reads layout after writing styles (no forced reflows). */
  const layout = { max: 0, zones: [], manTop: 0, manH: 0, mqTop: 0, mqH: 0 };
  const marqueeSection = track && track.parentElement;
  function measureLayout() {
    const sy = scrollY;
    const abs = el => { const r = el.getBoundingClientRect(); return [r.top + sy, r.height]; };
    layout.max = document.documentElement.scrollHeight - innerHeight;
    layout.zones = darkZones.map(z => { const [t, h] = abs(z); return [t, t + h]; });
    if (manifesto) [layout.manTop, layout.manH] = abs(manifesto);
    if (marqueeSection) [layout.mqTop, layout.mqH] = abs(marqueeSection);
    measure();
    prevY = -1; // force a refresh on the next frame
  }
  let measureQueued = false;
  const queueMeasure = () => {
    if (measureQueued) return;
    measureQueued = true;
    requestAnimationFrame(() => { measureQueued = false; measureLayout(); });
  };
  addEventListener('resize', queueMeasure);
  addEventListener('load', queueMeasure);
  if (window.ResizeObserver) new ResizeObserver(queueMeasure).observe(document.body);

  /* ---------- Main loop ---------- */
  const bar = $('#scrollProgress');
  let lastY = scrollY, prevY = -1, vel = 0, lastT = performance.now(), heroParked = false;
  measureLayout();

  (function loop(now = performance.now()) {
    // read phase: only cheap values, never layout
    const y = scrollY, vh = innerHeight;
    const dt = Math.min((now - lastT) / 1000, 0.05); // cap so a background tab doesn't jump
    lastT = now;
    vel += ((y - lastY) - vel) * 0.12;
    lastY = y;

    // write phase
    if (y !== prevY) {
      prevY = y;
      bar.style.transform = `scaleX(${layout.max > 0 ? clamp(y / layout.max, 0, 1) : 0})`;
      const navLine = y + 60;
      nav.classList.toggle('nav--dark', layout.zones.some(([t, b]) => t < navLine && b > navLine));

      if (!reduce && document.body.classList.contains('is-ready')) {
        if (y < vh * 1.3) {
          heroParked = false;
          heroContent.style.transform = `translate3d(0,${y * 0.2}px,0)`;
          heroContent.style.opacity = clamp(1 - y / (vh * 0.85), 0, 1);
          if (innerWidth > 960) heroStage.style.transform = `translate3d(0,${y * 0.1}px,0)`; // stacked on phones, so no drift
        } else if (!heroParked) {
          heroParked = true; // settle once, then stop touching the hero
          heroContent.style.opacity = 0;
        }
      }
      if (manifesto && !reduce) updateManifesto(vh, y);
    }

    // marquee always advances, but only paints while it's on screen
    if (track && half) {
      const boost = reduce ? 0 : Math.min(Math.abs(vel) * 22, 900);
      mx -= (MARQUEE_SPEED + boost) * dt;
      if (mx <= -half) mx += half;
      const onScreen = layout.mqTop - y < vh && layout.mqTop + layout.mqH - y > 0;
      if (onScreen) {
        const skew = reduce ? 0 : clamp(-vel * 0.4, -12, 12);
        track.style.transform = `translate3d(${mx.toFixed(2)}px,0,0) skewX(${skew.toFixed(2)}deg)`;
      }
    }

    requestAnimationFrame(loop);
  })();

  /* ---------- Pause decorative loops while off screen ---------- */
  const pauseIO = new IntersectionObserver(entries => {
    entries.forEach(en => en.target.classList.toggle('anim-paused', !en.isIntersecting));
  }, { rootMargin: '100px 0px' });
  $$('.announce, .hero, .shop, .cstory, .story, .newsletter').forEach(el => pauseIO.observe(el));
})();
