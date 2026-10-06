// Hero light show (WebGL): soft curtains of sky light in each look's colours behind the
// stage, liquid-fabric transitions between looks, ripples under the finger/cursor and a
// silk wave on scroll. Falls back silently to the CSS hero if WebGL isn't available.
(() => {
  'use strict';

  const hero = document.getElementById('hero');
  const frame = document.getElementById('heroFrame');
  if (!hero || !frame || typeof PRODUCTS === 'undefined') return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const coarse = matchMedia('(hover: none), (pointer: coarse)').matches;
  const isSmall = () => innerWidth <= 960;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  /* ---------- GL plumbing ---------- */
  const VS = `attribute vec2 p; varying vec2 vUv;
    void main(){ vUv = vec2(p.x * .5 + .5, .5 - p.y * .5); gl_Position = vec4(p, 0., 1.); }`;

  const NOISE = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
    #else
      precision mediump float;
    #endif
    float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
      return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y);
    }
    float fbm(vec2 p){
      float v = 0., a = .5;
      for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= .5; }
      return v;
    }`;

  function createGL(canvas) {
    const opts = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' };
    return canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
  }
  function createProgram(gl, fs) {
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = {};
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(prog, i).name.replace(/\[0\]$/, '');
      u[name] = gl.getUniformLocation(prog, name);
    }
    return u;
  }

  /* ==========================================================
     1. Sky light — soft light curtains behind everything
     ========================================================== */
  const SKY_FS = NOISE + `
    uniform vec2 uRes; uniform float uTime; uniform float uScroll; uniform float uSmall;
    uniform vec3 uC1, uC2, uC3; uniform vec2 uPointer; uniform float uPull;
    varying vec2 vUv;

    float curtain(vec2 p, float base, float amp, float freq, float speed, float seed){
      float t = uTime * speed;
      float edge = base + amp * sin(p.x * freq + t + seed) + .22 * (fbm(vec2(p.x * 1.1 + t * .5 + seed, t * .25)) - .5);
      vec2 dp = (p - uPointer) * vec2(1., 1.3);
      edge += uPull * .1 * exp(-dot(dp, dp) * 5.);          // the curtain leans toward the pointer
      float d = p.y - edge;
      float rays = .45 + 1.1 * fbm(vec2(p.x * 7. + seed + t * .7, p.y * .7 - t * .15));
      float above = exp(-max(d, 0.) * 2.6) * rays;            // rays rise from a bright lower edge
      float below = exp(min(d, 0.) * 22.);
      return above * below;
    }

    void main(){
      float asp = uRes.x / uRes.y;
      vec2 p = vec2(vUv.x * asp, 1. - vUv.y);
      p.y -= uScroll * .06;
      float a = curtain(p, .44, .09, 1.5, .32, 0.);
      float b = curtain(p, .60, .07, 2.2, -.26, 3.7);
      float c = curtain(p, .30, .05, 3.0, .2, 7.1);
      float sum = a + b * .85 + c * .6;
      vec3 tint = (uC1 * a + uC2 * b * .85 + mix(uC1, uC3, .35) * c * .6) / max(sum, 1e-3);
      float alpha = clamp(sum * .62, 0., .78);

      // drifting motes of light
      float motes = 0.;
      for (int i = 0; i < 9; i++) {
        float fi = float(i);
        vec2 mp = vec2(fract(hash(vec2(fi, 1.3)) + uTime * .006 * (.4 + hash(vec2(fi, 2.)))) * asp,
                       fract(hash(vec2(fi, 3.1)) + uTime * .01 * (.3 + hash(vec2(fi, 4.)))));
        float d = length(p - mp);
        motes += smoothstep(.03 + .02 * hash(vec2(fi, 5.)), 0., d) * (.55 + .45 * sin(uTime * 1.3 + fi * 2.1));
      }

      // keep text areas calm: the left column on desktop, the title on phones
      float calm = uSmall > .5 ? mix(.35, 1., smoothstep(.12, .42, vUv.y)) : mix(.28, 1., smoothstep(.22, .62, vUv.x));
      alpha *= calm;
      vec3 col = tint * alpha + vec3(1., .96, .88) * motes * .55;
      float outA = clamp(alpha + motes * .4, 0., 1.);
      gl_FragColor = vec4(col, outA);
    }`;

  /* ==========================================================
     2. The frame — liquid-fabric transitions + ripples
     ========================================================== */
  const FRAME_FS = NOISE + `
    uniform sampler2D uA, uB; uniform float uAspA, uAspB, uAsp;
    uniform float uP, uTime, uScroll; uniform vec3 uTint;
    uniform vec4 uRip[4];
    varying vec2 vUv;

    vec2 cover(vec2 uv, float ia){
      vec2 s = uAsp > ia ? vec2(1., ia / uAsp) : vec2(uAsp / ia, 1.);
      return uv * s + (1. - s) * vec2(.5, .08);              // object-position: 50% 8%
    }

    void main(){
      vec2 uv = vUv;

      // fabric ripples from taps / cursor
      vec2 disp = vec2(0.);
      for (int i = 0; i < 4; i++) {
        vec4 r = uRip[i];
        vec2 dv = uv - r.xy; dv.x *= uAsp;
        float d = length(dv);
        float w = sin(d * 34. - r.z * 8.) * exp(-r.z * 1.6) * exp(-d * 6.) * r.w;
        disp += dv / max(d, 1e-3) * w * .02;
      }
      // silk wave while scrolling
      disp.x += sin(uv.y * 8. + uTime * 1.6) * uScroll * .014;
      disp.y += sin(uv.x * 6. + uTime) * uScroll * .006;
      uv += disp;

      // the transition front rises from the hem for a new look
      float n = fbm(uv * 3.2 + vec2(uTime * .06, 0.));
      float sweep = (1. - uv.y) * .78 + uv.x * .22;
      float w = .3;
      float v = sweep * .7 + n * .3;
      float th = uP * (1. + w) - w;
      float m = smoothstep(th, th + w, v);                   // 1 = old image, 0 = new image
      float k = sin(uP * 3.14159);

      vec2 off = (vec2(n, fbm(uv * 3. + 7.3)) - .5) * .26 * k;
      vec2 uvA = cover(uv + off * (1. - m), uAspA);
      vec2 uvB = cover(uv - off * m, uAspB);
      float ca = .007 * k;                                   // a whisper of prism at the fold
      vec3 A = vec3(texture2D(uA, uvA + vec2(ca, 0.)).r, texture2D(uA, uvA).g, texture2D(uA, uvA - vec2(ca, 0.)).b);
      vec3 B = vec3(texture2D(uB, uvB - vec2(ca, 0.)).r, texture2D(uB, uvB).g, texture2D(uB, uvB + vec2(ca, 0.)).b);
      vec3 col = mix(B, A, m);

      // a seam of light rides the front
      float e = pow(1. - abs(m * 2. - 1.), 3.);
      col += (vec3(1., .9, .74) * .55 + uTint * .35) * e * k;

      // slow sheen across the fabric
      float band = (uv.x * .55 + uv.y * .45) - (fract(uTime * .07) * 2.6 - .8);
      col += vec3(1., .97, .9) * smoothstep(.12, 0., abs(band)) * .07;

      gl_FragColor = vec4(col, 1.);
    }`;

  /* ---------- Canvases ---------- */
  const skyCanvas = document.createElement('canvas');
  skyCanvas.className = 'hero__gl-sky';
  skyCanvas.setAttribute('aria-hidden', 'true');
  const frameCanvas = document.createElement('canvas');
  frameCanvas.className = 'hero__gl-frame';
  frameCanvas.setAttribute('aria-hidden', 'true');

  let ag, fg, au, fu;
  try {
    ag = createGL(skyCanvas); fg = createGL(frameCanvas);
    if (!ag || !fg) return;
    au = createProgram(ag, SKY_FS);
    fu = createProgram(fg, FRAME_FS);
  } catch (err) {
    console.warn('Hero WebGL disabled:', err.message);
    return;
  }
  (hero.querySelector('.hero__sky') || hero).appendChild(skyCanvas);
  frame.appendChild(frameCanvas);

  /* ---------- Textures (small LRU so phones don't hold every photo) ---------- */
  fg.pixelStorei(fg.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  const makeTex = source => {
    const t = fg.createTexture();
    fg.bindTexture(fg.TEXTURE_2D, t);
    fg.texParameteri(fg.TEXTURE_2D, fg.TEXTURE_WRAP_S, fg.CLAMP_TO_EDGE);
    fg.texParameteri(fg.TEXTURE_2D, fg.TEXTURE_WRAP_T, fg.CLAMP_TO_EDGE);
    fg.texParameteri(fg.TEXTURE_2D, fg.TEXTURE_MIN_FILTER, fg.LINEAR);
    fg.texParameteri(fg.TEXTURE_2D, fg.TEXTURE_MAG_FILTER, fg.LINEAR);
    if (source instanceof Uint8Array) fg.texImage2D(fg.TEXTURE_2D, 0, fg.RGBA, 1, 1, 0, fg.RGBA, fg.UNSIGNED_BYTE, source);
    else fg.texImage2D(fg.TEXTURE_2D, 0, fg.RGBA, fg.RGBA, fg.UNSIGNED_BYTE, source);
    return t;
  };
  const blank = { tex: makeTex(new Uint8Array([226, 218, 205, 255])), asp: 1 }; // --sand
  const cache = new Map(); // src -> Promise<{tex, asp}>
  const LIMIT = coarse ? 5 : 9;
  function loadTex(src) {
    if (cache.has(src)) { const v = cache.get(src); cache.delete(src); cache.set(src, v); return v; }
    const pr = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve({ tex: makeTex(img), asp: img.naturalWidth / img.naturalHeight, src });
      img.onerror = reject;
      img.src = src;
    });
    cache.set(src, pr);
    while (cache.size > LIMIT) {
      const [oldSrc, oldPr] = cache.entries().next().value;
      if (oldSrc === shown.src || oldSrc === incoming?.src) { cache.delete(oldSrc); cache.set(oldSrc, oldPr); break; }
      cache.delete(oldSrc);
      oldPr.then(t => fg.deleteTexture(t.tex)).catch(() => {});
    }
    return pr;
  }

  /* ---------- State ---------- */
  let running = false, visible = true, raf = 0, last = performance.now(), lastScroll = scrollY, scrollVel = 0;
  const time0 = performance.now();
  let shown = blank, incoming = null;
  let tStart = 0, tDur = 1, progress = 1;
  let wanted = { index: 0 }, ready = false, requestId = 0;
  const colors = { cur: [hex(PRODUCTS[0].sky[0]), hex(PRODUCTS[0].sky[1]), hex(PRODUCTS[0].sky[2])], target: null };
  colors.target = colors.cur.map(c => c.slice());

  function srcFor({ index }) { return PRODUCTS[index].images[0]; }

  function go(detail, intro = false) {
    wanted = detail;
    colors.target = PRODUCTS[detail.index].sky.map(hex);
    if (!ready) return;
    const id = ++requestId;
    loadTex(srcFor(detail)).then(t => {
      if (id !== requestId) return;
      if (incoming) { shown = incoming; } // a new request lands mid-transition: settle, then go
      incoming = t;
      tStart = performance.now();
      tDur = intro ? 2400 : 1700;
      progress = 0;
      wake();
      // warm up the next look so the move is instant
      loadTex(PRODUCTS[(detail.index + 1) % PRODUCTS.length].images[0]);
    }).catch(() => {});
  }
  hero.addEventListener('hero:look', e => go(e.detail));

  // first light: once the preloader lifts, the photo blooms out of the light
  const startIntro = () => { if (ready) return; ready = true; go(wanted, true); };
  if (document.body.classList.contains('is-ready')) startIntro();
  else new MutationObserver((_, obs) => {
    if (document.body.classList.contains('is-ready')) { obs.disconnect(); startIntro(); }
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  loadTex(srcFor(wanted)); // start fetching during the preloader

  /* ---------- Pointer: ripples on the frame, curtains lean toward it ---------- */
  const ripples = Array.from({ length: 4 }, () => [0, 0, 99, 0]);
  let ripSlot = 0, lastRip = { x: -1, y: -1, t: 0 };
  const addRipple = (x, y, amp) => { ripples[ripSlot] = [x, y, 0, amp]; ripSlot = (ripSlot + 1) % ripples.length; wake(); };
  const local = e => { const r = frame.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  frame.addEventListener('pointerdown', e => { const [x, y] = local(e); addRipple(x, y, 1); });
  frame.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const [x, y] = local(e), now = performance.now();
    if (now - lastRip.t > 160 && Math.hypot(x - lastRip.x, y - lastRip.y) > .07) {
      addRipple(x, y, .4); lastRip = { x, y, t: now };
    }
  });

  const pointer = { x: 0, y: 0, pull: 0, target: 0 };
  hero.addEventListener('pointermove', e => {
    const r = hero.getBoundingClientRect();
    pointer.x = (e.clientX - r.left) / r.height; // sky space: x scaled by height
    pointer.y = 1 - (e.clientY - r.top) / r.height;
    pointer.target = 1;
  }, { passive: true });
  hero.addEventListener('pointerleave', () => { pointer.target = 0; });

  /* ---------- Sizing ---------- */
  let aW = 1, aH = 1, fW = 1, fH = 1;
  function resize() {
    const hr = hero.getBoundingClientRect(), fr = frame.getBoundingClientRect();
    // the sky is pure soft light, so it renders at a fraction of the screen and is scaled up
    const aScale = isSmall() ? .32 : .45;
    aW = Math.max(2, Math.round(hr.width * aScale)); aH = Math.max(2, Math.round(hr.height * aScale));
    skyCanvas.width = aW; skyCanvas.height = aH;
    ag.viewport(0, 0, aW, aH);
    const dpr = Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2);
    fW = Math.max(2, Math.round(fr.width * dpr)); fH = Math.max(2, Math.round(fr.height * dpr));
    frameCanvas.width = fW; frameCanvas.height = fH;
    fg.viewport(0, 0, fW, fH);
    wake();
  }
  if (window.ResizeObserver) { const ro = new ResizeObserver(resize); ro.observe(hero); ro.observe(frame); }
  else addEventListener('resize', resize);
  resize();

  /* ---------- Render loop (only while the hero is on screen) ---------- */
  function wake() { if (!running && visible && !document.hidden) { running = true; last = performance.now(); raf = requestAnimationFrame(frameLoop); } }
  function sleep() { running = false; cancelAnimationFrame(raf); }
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; visible ? wake() : sleep(); }).observe(hero);
  document.addEventListener('visibilitychange', () => { document.hidden ? sleep() : wake(); });

  function frameLoop(now) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, .05);
    last = now;
    const t = ((now - time0) / 1000) % 1000;

    // smoothed scroll velocity drives the silk wave
    const y = scrollY;
    scrollVel += (clamp((y - lastScroll) / 30, -1, 1) - scrollVel) * .1;
    lastScroll = y;

    // colours glide toward the current look
    const lerpK = 1 - Math.exp(-dt * 2.2);
    colors.cur.forEach((c, i) => c.forEach((v, j) => { c[j] = v + (colors.target[i][j] - v) * lerpK; }));
    pointer.pull += (pointer.target - pointer.pull) * (1 - Math.exp(-dt * 3));
    if (pointer.target) pointer.target = Math.max(0, pointer.target - dt * .4); // eases off when the pointer rests

    // transition progress
    if (incoming) {
      progress = clamp((now - tStart) / tDur, 0, 1);
      if (progress >= 1) { shown = incoming; incoming = null; progress = 1; }
    }
    ripples.forEach(r => { r[2] += dt; });

    // sky
    ag.uniform2f(au.uRes, aW, aH);
    ag.uniform1f(au.uTime, t);
    ag.uniform1f(au.uScroll, scrollVel);
    ag.uniform1f(au.uSmall, isSmall() ? 1 : 0);
    ag.uniform3fv(au.uC1, colors.cur[0]);
    ag.uniform3fv(au.uC2, colors.cur[1]);
    ag.uniform3fv(au.uC3, colors.cur[2]);
    ag.uniform2f(au.uPointer, pointer.x, pointer.y);
    ag.uniform1f(au.uPull, pointer.pull);
    ag.drawArrays(ag.TRIANGLE_STRIP, 0, 4);

    // frame
    const from = shown;
    const to = incoming || shown;
    fg.activeTexture(fg.TEXTURE0); fg.bindTexture(fg.TEXTURE_2D, from.tex);
    fg.activeTexture(fg.TEXTURE1); fg.bindTexture(fg.TEXTURE_2D, to.tex);
    fg.uniform1i(fu.uA, 0); fg.uniform1i(fu.uB, 1);
    fg.uniform1f(fu.uAspA, from.asp); fg.uniform1f(fu.uAspB, to.asp);
    fg.uniform1f(fu.uAsp, fW / fH);
    fg.uniform1f(fu.uP, incoming ? ease(progress) : 1);
    fg.uniform1f(fu.uTime, t);
    fg.uniform1f(fu.uScroll, scrollVel);
    fg.uniform3fv(fu.uTint, colors.cur[0]);
    fg.uniform4fv(fu.uRip, ripples.flat());
    fg.drawArrays(fg.TRIANGLE_STRIP, 0, 4);

    raf = requestAnimationFrame(frameLoop);
  }

  /* ---------- Hand over from the CSS hero ---------- */
  hero.classList.add('gl-on');
  frame.classList.add('gl-on');
  wake();

  // if the GPU drops the context, quietly return to the CSS version
  const lost = e => { e.preventDefault(); sleep(); hero.classList.remove('gl-on'); frame.classList.remove('gl-on'); skyCanvas.remove(); frameCanvas.remove(); };
  skyCanvas.addEventListener('webglcontextlost', lost);
  frameCanvas.addEventListener('webglcontextlost', lost);
})();
