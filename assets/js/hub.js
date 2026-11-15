/* Behaviour of the study hub pages: theme, navigation drawer, copy buttons, images with a zoomable lightbox, the
   slide viewer, the PDF viewer and downloads. The same page works in two modes, set on <html data-mode>:
   - "site": the plaintext preview; images and files are plain URLs under data-root.
   - "dist": the published copy; every image and file is an encrypted blob ("CMW1" + IV + AES-GCM), listed in
     window.CMW_ASSETS, fetched and decrypted here with the key the password gate stored. */
(() => {
  "use strict";

  const html = document.documentElement;
  const MODE = html.dataset.mode || "site";
  const ROOT = html.dataset.root || "";
  const KEY = "cmw-hub-key";
  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const pad2 = (n) => String(n).padStart(2, "0");
  // the storage is looked up inside the try: where it is blocked even touching window.localStorage throws
  const store = {
    get(k, s = "localStorage") { try { return window[s].getItem(k); } catch (e) { return null; } },
    set(k, v, s = "localStorage") { try { window[s].setItem(k, v); } catch (e) { /* storage blocked */ } },
    del(k, s = "localStorage") { try { window[s].removeItem(k); } catch (e) { /* storage blocked */ } },
  };
  const typing = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

  /* ---------------- assets: plain URL in the preview, fetch + decrypt in the published copy ---------------- */
  const TYPES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml",
    pdf: "application/pdf", mp4: "video/mp4",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  const typeOf = (path) => {
    const e = (window.CMW_ASSETS || {})[path];
    return (e && e.t) || TYPES[path.split(".").pop().toLowerCase()] || "application/octet-stream";
  };
  let keyPromise = null;
  function siteKey() {
    if (!keyPromise) {
      keyPromise = (async () => {
        let raw = window.__cmwKey;
        if (!raw) {
          const b64 = store.get(KEY, "sessionStorage") || store.get(KEY);
          if (!b64) throw new Error("no key");
          raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        }
        return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
      })();
    }
    return keyPromise;
  }
  async function assetBytes(path) {
    if (MODE !== "dist") {
      const r = await fetch(ROOT + path);
      if (!r.ok) throw new Error(r.status + " " + path);
      return new Uint8Array(await r.arrayBuffer());
    }
    const entry = (window.CMW_ASSETS || {})[path];
    if (!entry) throw new Error("not in the asset list: " + path);
    const r = await fetch(ROOT + entry.f);
    if (!r.ok) throw new Error(r.status + " " + path);
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf[0] !== 67 || buf[1] !== 77 || buf[2] !== 87 || buf[3] !== 49) throw new Error("not an encrypted asset");
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.subarray(4, 16) }, await siteKey(), buf.subarray(16));
    return new Uint8Array(plain);
  }
  const urlCache = new Map();
  function assetURL(path) {
    if (MODE !== "dist") return Promise.resolve(ROOT + path);
    if (!urlCache.has(path)) {
      const p = assetBytes(path).then((b) => URL.createObjectURL(new Blob([b], { type: typeOf(path) })));
      p.catch(() => urlCache.delete(path));
      urlCache.set(path, p);
    }
    return urlCache.get(path);
  }
  function setImg(img, path) {
    return assetURL(path).then((u) => new Promise((resolve, reject) => {
      if (img.getAttribute("src") === u && img.complete) return resolve();
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image " + path));
      img.src = u;
    }));
  }

  /* lazy images: <img data-src="media/..."> */
  function loadImg(img) {
    if (img.dataset.loaded) return;
    img.dataset.loaded = "1";
    setImg(img, img.dataset.src).catch(() => { const f = img.closest(".fig"); if (f) f.classList.add("is-error"); });
  }
  const lazy = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { lazy.unobserve(en.target); loadImg(en.target); }
    }), { rootMargin: "600px 0px" })
    : null;
  $$("img[data-src]").forEach((img) => { if (!img.closest(".deck")) { if (lazy) lazy.observe(img); else loadImg(img); } });

  /* downloads: <a class="dl" data-asset="media/..." download="name"> */
  document.addEventListener("click", async (ev) => {
    const a = ev.target.closest("a[data-asset]");
    if (!a || MODE !== "dist") return;
    ev.preventDefault();
    const label = $(".dl-label", a);
    const before = label ? label.textContent : "";
    a.classList.add("is-busy");
    if (label) label.textContent = "Đang giải mã…";
    try {
      const bytes = await assetBytes(a.dataset.asset);
      const url = URL.createObjectURL(new Blob([bytes], { type: typeOf(a.dataset.asset) }));
      const t = document.createElement("a");
      t.href = url;
      t.download = a.getAttribute("download") || a.dataset.asset.split("/").pop();
      document.body.appendChild(t);
      t.click();
      t.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      if (label) label.textContent = before;
    } catch (e) {
      if (label) label.textContent = "Không tải được";
      setTimeout(() => { if (label) label.textContent = before; }, 2500);
    } finally {
      a.classList.remove("is-busy");
    }
  });

  /* ---------------- theme ---------------- */
  const systemDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const effectiveTheme = () => html.dataset.theme || (systemDark && systemDark.matches ? "dark" : "light");
  $$(".theme-toggle").forEach((b) => b.addEventListener("click", () => {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    const sys = systemDark && systemDark.matches ? "dark" : "light";
    if (next === sys) { delete html.dataset.theme; store.del("cmw-theme"); } // back to following the system
    else { html.dataset.theme = next; store.set("cmw-theme", next); }
  }));

  /* ---------------- navigation drawer (phones) ---------------- */
  const navBtn = $(".nav-toggle");
  const sidebar = $("#sidebar");
  const scrim = $(".scrim");
  function setNav(open) {
    if (!sidebar) return;
    document.body.classList.toggle("nav-open", open);
    if (navBtn) navBtn.setAttribute("aria-expanded", String(open));
    if (scrim) scrim.hidden = !open;
    if (open) {
      const cur = $('a[aria-current="page"]', sidebar) || $("a", sidebar);
      if (cur) { cur.scrollIntoView({ block: "center" }); cur.focus({ preventScroll: true }); }
    } else if (navBtn && document.activeElement && sidebar.contains(document.activeElement)) navBtn.focus();
  }
  if (navBtn) navBtn.addEventListener("click", () => setNav(!document.body.classList.contains("nav-open")));
  if (scrim) scrim.addEventListener("click", () => setNav(false));
  $$(".nav-close").forEach((b) => b.addEventListener("click", () => setNav(false)));
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && document.body.classList.contains("nav-open")) setNav(false); });
  window.addEventListener("resize", () => { if (window.innerWidth > 959 && document.body.classList.contains("nav-open")) setNav(false); });

  /* ---------------- start page: "Bạn là ai?" ----------------
     Every member's steps are in the page; this shows the one chosen and remembers it on the device (localStorage
     "cmw-who", read and written inside try/catch: without storage the page works, it just asks again next time). */
  $$(".me").forEach((me) => {
    const WHO = "cmw-who";
    const btns = $$(".seg-btn", me);
    const panels = $$(".me-panel", me);
    const prompt = $(".me-prompt", me);
    const rows = $$("tr[data-who]");
    function choose(id, save) {
      if (!btns.some((b) => b.dataset.who === id)) id = "";
      btns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.who === id)));
      panels.forEach((p) => { p.hidden = p.dataset.who !== id; });
      if (prompt) prompt.hidden = !!id;
      rows.forEach((r) => r.classList.toggle("is-me", r.dataset.who === id));
      if (save) { if (id) store.set(WHO, id); else store.del(WHO); }
    }
    btns.forEach((b) => b.addEventListener("click", () => choose(b.dataset.who, true)));
    $$(".me-clear", me).forEach((c) => c.addEventListener("click", () => { choose("", true); if (btns[0]) btns[0].focus(); }));
    choose(store.get(WHO) || "", false);
  });

  /* ---------------- lock (published copy) ---------------- */
  $$("[data-lock]").forEach((b) => b.addEventListener("click", () => {
    store.del(KEY, "sessionStorage");
    store.del(KEY);
    location.reload();
  }));

  /* ---------------- copy buttons on code blocks ---------------- */
  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(text); return; } catch (e) { /* fall back below */ }
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if (!ok) throw new Error("copy refused");
  }
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest(".code .copy");
    if (!b) return;
    const fig = b.closest(".code");
    const text = $$(".line", fig).map((l) => l.textContent).join("\n");
    const label = $(".copy-label", b);
    copyText(text).then(() => {
      b.classList.add("done");
      if (label) label.textContent = "Đã chép";
    }, () => { if (label) label.textContent = "Không chép được"; }).finally(() => {
      setTimeout(() => { b.classList.remove("done"); if (label) label.textContent = "Sao chép"; }, 1600);
    });
  });

  /* ---------------- on this page: highlight the section being read ---------------- */
  const tocLinks = $$(".toc a[href^='#']");
  if (tocLinks.length && "IntersectionObserver" in window) {
    const byId = new Map(tocLinks.map((a) => [decodeURIComponent(a.getAttribute("href").slice(1)), a]));
    const heads = Array.from(byId.keys()).map((id) => document.getElementById(id)).filter(Boolean);
    const visible = new Set();
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) visible.add(en.target); else visible.delete(en.target); });
      let current = null;
      for (const h of heads) { if (visible.has(h)) { current = h; break; } }
      if (!current) { for (const h of heads) { if (h.getBoundingClientRect().top < 120) current = h; } }
      if (!current && heads.length) current = heads[0];
      tocLinks.forEach((a) => a.classList.remove("active"));
      if (current && byId.get(current.id)) byId.get(current.id).classList.add("active");
    }, { rootMargin: "-64px 0px -60% 0px" });
    heads.forEach((h) => spy.observe(h));
  }

  /* ---------------- lightbox with zoom (wheel, pinch, double tap) ---------------- */
  const ICON = {
    prev: '<svg class="icon" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg class="icon" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
    close: '<svg class="icon" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    plus: '<svg class="icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M11 8v6M8 11h6M16.5 16.5L21 21"/></svg>',
    minus: '<svg class="icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M8 11h6M16.5 16.5L21 21"/></svg>',
    fit: '<svg class="icon" viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>',
    down: '<svg class="icon" viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  };
  const Lightbox = (() => {
    let root, stage, img, cap, count, zoomLabel, loading, items = [], index = 0, opener = null, onClose = null;
    let s = 1, tx = 0, ty = 0;
    const pointers = new Map();
    let gesture = null, lastTap = 0, token = 0;

    function build() {
      root = document.createElement("div");
      root.className = "lb";
      root.setAttribute("role", "dialog");
      root.setAttribute("aria-modal", "true");
      root.setAttribute("aria-label", "Xem ảnh");
      root.innerHTML =
        '<div class="lb-top"><span class="lb-count"></span><div class="lb-tools">' +
        '<button class="lb-btn" data-act="out" type="button" aria-label="Thu nhỏ">' + ICON.minus + '</button>' +
        '<span class="lb-zoom-label">100%</span>' +
        '<button class="lb-btn" data-act="in" type="button" aria-label="Phóng to">' + ICON.plus + '</button>' +
        '<button class="lb-btn" data-act="fit" type="button" aria-label="Vừa màn hình">' + ICON.fit + '</button>' +
        '<button class="lb-btn" data-act="save" type="button" aria-label="Tải ảnh">' + ICON.down + '</button>' +
        '<button class="lb-btn" data-act="close" type="button" aria-label="Đóng">' + ICON.close + '</button>' +
        '</div></div>' +
        '<div class="lb-stage"><img class="lb-img" alt=""><span class="lb-loading">Đang tải ảnh…</span>' +
        '<button class="lb-nav lb-prev" data-act="prev" type="button" aria-label="Ảnh trước">' + ICON.prev + '</button>' +
        '<button class="lb-nav lb-next" data-act="next" type="button" aria-label="Ảnh sau">' + ICON.next + '</button></div>' +
        '<div class="lb-cap"></div>';
      document.body.appendChild(root);
      stage = $(".lb-stage", root);
      img = $(".lb-img", root);
      cap = $(".lb-cap", root);
      count = $(".lb-count", root);
      zoomLabel = $(".lb-zoom-label", root);
      loading = $(".lb-loading", root);
      root.addEventListener("click", (ev) => {
        const b = ev.target.closest("[data-act]");
        if (!b) return;
        const act = b.dataset.act;
        if (act === "close") close();
        else if (act === "prev") go(-1);
        else if (act === "next") go(1);
        else if (act === "in") zoomAt(s * 1.5);
        else if (act === "out") zoomAt(s / 1.5);
        else if (act === "fit") reset();
        else if (act === "save") save();
      });
      stage.addEventListener("wheel", (ev) => {
        ev.preventDefault();
        const f = Math.exp(-ev.deltaY * (ev.deltaMode === 1 ? 0.05 : 0.0018));
        zoomAt(s * f, ev.clientX, ev.clientY);
      }, { passive: false });
      stage.addEventListener("pointerdown", down);
      stage.addEventListener("pointermove", move);
      stage.addEventListener("pointerup", up);
      stage.addEventListener("pointercancel", up);
      stage.addEventListener("dblclick", (ev) => { if (ev.target.closest(".lb-nav")) return; toggleZoom(ev.clientX, ev.clientY); });
      document.addEventListener("keydown", (ev) => {
        if (!root.classList.contains("open")) return;
        if (ev.key === "Escape") { ev.preventDefault(); close(); }
        else if (ev.key === "ArrowLeft") { ev.preventDefault(); go(-1); }
        else if (ev.key === "ArrowRight") { ev.preventDefault(); go(1); }
        else if (ev.key === "+" || ev.key === "=") zoomAt(s * 1.5);
        else if (ev.key === "-") zoomAt(s / 1.5);
        else if (ev.key === "0") reset();
        else if (ev.key === "Tab") trap(ev);
      });
      window.addEventListener("resize", () => { if (root.classList.contains("open")) clamp(), apply(); });
    }
    function trap(ev) {
      const f = $$("button", root).filter((b) => b.offsetParent !== null);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (ev.shiftKey && (i <= 0)) { ev.preventDefault(); f[f.length - 1].focus(); }
      else if (!ev.shiftKey && i === f.length - 1) { ev.preventDefault(); f[0].focus(); }
    }
    function apply() {
      img.style.transform = "translate(-50%, -50%) translate(" + tx + "px, " + ty + "px) scale(" + s + ")";
      zoomLabel.textContent = Math.round(s * 100) + "%";
      stage.classList.toggle("zoomed", s > 1.01);
    }
    function clamp() {
      const W = stage.clientWidth, H = stage.clientHeight;
      const w = img.offsetWidth * s, h = img.offsetHeight * s;
      const mx = Math.max(0, (w - W) / 2 + 16), my = Math.max(0, (h - H) / 2 + 16);
      tx = Math.min(mx, Math.max(-mx, tx));
      ty = Math.min(my, Math.max(-my, ty));
      if (s <= 1.001) { tx = 0; ty = 0; }
    }
    function zoomAt(next, cx, cy) {
      next = Math.min(8, Math.max(1, next));
      const r = stage.getBoundingClientRect();
      const px = (cx === undefined ? r.left + r.width / 2 : cx) - (r.left + r.width / 2);
      const py = (cy === undefined ? r.top + r.height / 2 : cy) - (r.top + r.height / 2);
      tx = px - (next / s) * (px - tx);
      ty = py - (next / s) * (py - ty);
      s = next;
      clamp();
      apply();
    }
    function toggleZoom(cx, cy) { if (s > 1.01) reset(); else zoomAt(2.5, cx, cy); }
    function reset() { s = 1; tx = 0; ty = 0; apply(); }
    function down(ev) {
      if (ev.target.closest(".lb-nav")) return;
      stage.setPointerCapture(ev.pointerId);
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pointers.size === 1) gesture = { type: "drag", x: ev.clientX, y: ev.clientY, tx, ty, t: Date.now(), moved: false };
      else if (pointers.size === 2) {
        const [a, b] = Array.from(pointers.values());
        gesture = { type: "pinch", d: Math.hypot(a.x - b.x, a.y - b.y), s, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      }
    }
    function move(ev) {
      if (!pointers.has(ev.pointerId) || !gesture) return;
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (gesture.type === "pinch" && pointers.size >= 2) {
        const [a, b] = Array.from(pointers.values());
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        zoomAt(gesture.s * (d / gesture.d), (a.x + b.x) / 2, (a.y + b.y) / 2);
      } else if (gesture.type === "drag") {
        const dx = ev.clientX - gesture.x, dy = ev.clientY - gesture.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) gesture.moved = true;
        if (s > 1.01) { tx = gesture.tx + dx; ty = gesture.ty + dy; clamp(); apply(); }
      }
    }
    function up(ev) {
      if (!pointers.has(ev.pointerId)) return;
      pointers.delete(ev.pointerId);
      if (!gesture) return;
      if (gesture.type === "drag" && pointers.size === 0) {
        const dx = ev.clientX - gesture.x, dy = ev.clientY - gesture.y;
        if (s <= 1.01 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) go(dx < 0 ? 1 : -1);
        else if (!gesture.moved && ev.pointerType !== "mouse") {
          const now = Date.now();
          if (now - lastTap < 320) { toggleZoom(ev.clientX, ev.clientY); lastTap = 0; } else lastTap = now;
        }
        gesture = null;
      } else if (gesture.type === "pinch" && pointers.size < 2) {
        gesture = pointers.size === 1 ? (() => { const p = Array.from(pointers.values())[0]; return { type: "drag", x: p.x, y: p.y, tx, ty, moved: true }; })() : null;
      }
    }
    async function show(i) {
      index = (i + items.length) % items.length;
      const it = items[index];
      const my = ++token;
      reset();
      count.textContent = items.length > 1 ? pad2(index + 1) + " / " + pad2(items.length) : "";
      cap.textContent = it.caption || "";
      img.alt = it.caption || "";
      $$(".lb-nav", root).forEach((b) => { b.hidden = items.length < 2; });
      loading.hidden = false;
      img.style.visibility = "hidden";
      try {
        if (it.preview) { await setImg(img, it.preview); if (my !== token) return; img.style.visibility = ""; }
        if (it.full && it.full !== it.preview) {
          const u = await assetURL(it.full);
          if (my !== token) return;
          await new Promise((res) => { const pre = new Image(); pre.onload = pre.onerror = res; pre.src = u; });
          if (my !== token) return;
          img.src = u;
        }
        img.style.visibility = "";
        loading.hidden = true;
      } catch (e) {
        if (my === token) loading.textContent = "Không tải được ảnh.";
      }
      // warm the neighbours
      [index + 1, index - 1].forEach((j) => { const n = items[(j + items.length) % items.length]; if (n && n.preview) assetURL(n.preview).catch(() => {}); });
    }
    function go(d) { if (items.length > 1) show(index + d); }
    async function save() {
      const it = items[index];
      const path = it.full || it.preview;
      try {
        const u = await assetURL(path);
        const a = document.createElement("a");
        a.href = u;
        a.download = path.split("/").pop();
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (e) { /* nothing to save */ }
    }
    function open(list, i, from, closeCb) {
      if (!root) build();
      items = list;
      opener = from || document.activeElement;
      onClose = closeCb || null;
      root.classList.add("open");
      document.body.style.overflow = "hidden";
      show(i);
      $('[data-act="close"]', root).focus();
    }
    function close() {
      root.classList.remove("open");
      document.body.style.overflow = "";
      if (onClose) onClose(index);
      if (opener && opener.focus) opener.focus({ preventScroll: true });
    }
    return { open };
  })();

  const figButtons = $$(".fig-btn[data-full]");
  figButtons.forEach((btn) => btn.addEventListener("click", () => {
    const group = btn.dataset.group || "";
    const list = figButtons.filter((b) => (b.dataset.group || "") === group);
    const items = list.map((b) => ({ preview: $("img", b).dataset.src, full: b.dataset.full, caption: b.dataset.caption || "" }));
    Lightbox.open(items, list.indexOf(btn), btn);
  }));

  /* ---------------- slide viewer ---------------- */
  $$(".deck").forEach((deck) => {
    const data = JSON.parse($(".deck-data", deck).textContent);
    const slides = data.slides;
    const n = slides.length;
    const stage = $(".deck-stage", deck);
    const img = $(".deck-img", deck);
    const countCur = $(".deck-count b", deck);
    const live = $(".deck-live", deck);
    const notesBox = $(".deck-notes", deck);
    const notesK = $(".deck-notes-k", deck);
    const notesT = $(".deck-notes-t", deck);
    const notesBtn = $('[data-deck="notes"]', deck);
    const thumbs = $$(".deck-thumb", deck);
    const prevBtns = $$('[data-deck="prev"]', deck);
    const nextBtns = $$('[data-deck="next"]', deck);
    let i = 0, token = 0;

    const fromHash = () => { const m = /^#slide-(\d+)$/.exec(location.hash); return m ? Math.min(n, Math.max(1, +m[1])) - 1 : 0; };
    async function show(k, opts = {}) {
      i = Math.min(n - 1, Math.max(0, k));
      const my = ++token;
      countCur.textContent = pad2(i + 1);
      if (live) live.textContent = "Slide " + (i + 1) + " trên " + n;
      prevBtns.forEach((b) => { b.disabled = i === 0; });
      nextBtns.forEach((b) => { b.disabled = i === n - 1; });
      thumbs.forEach((t, j) => t.setAttribute("aria-current", j === i ? "true" : "false"));
      const t = thumbs[i];
      if (t && t.parentElement) {
        const strip = t.parentElement;
        const left = t.offsetLeft - strip.clientWidth / 2 + t.clientWidth / 2;
        strip.scrollTo({ left, behavior: opts.instant ? "auto" : "smooth" });
      }
      notesK.textContent = "Ghi chú người trình bày · slide " + pad2(i + 1);
      notesT.textContent = slides[i].notes || "Slide này không có ghi chú.";
      img.alt = "Slide " + (i + 1) + (slides[i].title ? ": " + slides[i].title : "");
      if (!opts.noHash) history.replaceState(null, "", "#slide-" + (i + 1));
      img.classList.add("fading");
      try { await setImg(img, slides[i].src); } catch (e) { /* keep the old picture */ }
      if (my === token) img.classList.remove("fading");
      [i + 1, i - 1, i + 2].forEach((j) => { if (j >= 0 && j < n) assetURL(slides[j].src).catch(() => {}); });
    }
    prevBtns.forEach((b) => b.addEventListener("click", (ev) => { ev.stopPropagation(); show(i - 1); }));
    nextBtns.forEach((b) => b.addEventListener("click", (ev) => { ev.stopPropagation(); show(i + 1); }));
    thumbs.forEach((t, j) => t.addEventListener("click", () => show(j)));

    // notes: open by default on wide screens, remembered per device
    const savedNotes = store.get("cmw-deck-notes");
    setNotes(savedNotes ? savedNotes === "1" : window.innerWidth >= 960);
    function setNotes(on) { notesBox.hidden = !on; notesBtn.setAttribute("aria-pressed", String(on)); }
    notesBtn.addEventListener("click", () => { const on = notesBox.hidden; setNotes(on); store.set("cmw-deck-notes", on ? "1" : "0"); });

    // fullscreen, with a CSS fallback where the element API is missing (iPhone Safari)
    const fsBtn = $('[data-deck="fs"]', deck);
    const fsLabel = $(".fs-label", deck);
    const isFs = () => document.fullscreenElement === deck || document.webkitFullscreenElement === deck || deck.classList.contains("pseudo-fs");
    function syncFs() { if (fsLabel) fsLabel.textContent = isFs() ? "Thoát toàn màn hình" : "Toàn màn hình"; }
    async function toggleFs() {
      if (isFs()) {
        if (deck.classList.contains("pseudo-fs")) { deck.classList.remove("pseudo-fs"); document.body.style.overflow = ""; }
        else if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      } else if (deck.requestFullscreen) {
        try { await deck.requestFullscreen(); } catch (e) { deck.classList.add("pseudo-fs"); document.body.style.overflow = "hidden"; }
      } else if (deck.webkitRequestFullscreen) deck.webkitRequestFullscreen();
      else { deck.classList.add("pseudo-fs"); document.body.style.overflow = "hidden"; }
      syncFs();
    }
    fsBtn.addEventListener("click", toggleFs);
    document.addEventListener("fullscreenchange", syncFs);
    document.addEventListener("webkitfullscreenchange", syncFs);

    // keyboard: when the deck is on screen and nothing else wants the keys
    let onScreen = true;
    if ("IntersectionObserver" in window) new IntersectionObserver((e) => { onScreen = e[0].isIntersecting; }, { threshold: 0.3 }).observe(stage);
    document.addEventListener("keydown", (ev) => {
      if (ev.defaultPrevented || typing(document.activeElement) || $(".lb.open") || document.body.classList.contains("nav-open")) return;
      if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
      if (!onScreen && !isFs()) return;
      const k = ev.key;
      if (k === "ArrowRight" || k === "PageDown" || (k === " " && isFs())) { ev.preventDefault(); show(i + 1); }
      else if (k === "ArrowLeft" || k === "PageUp") { ev.preventDefault(); show(i - 1); }
      else if (k === "Home") { ev.preventDefault(); show(0); }
      else if (k === "End") { ev.preventDefault(); show(n - 1); }
      else if (k === "f" || k === "F") { ev.preventDefault(); toggleFs(); }
      else if (k === "n" || k === "N") { ev.preventDefault(); notesBtn.click(); }
      else if (k === "Escape" && deck.classList.contains("pseudo-fs")) { ev.preventDefault(); toggleFs(); }
    });

    // swipe on phones; a tap without movement opens the slide in the zoomable viewer
    let sw = null;
    stage.addEventListener("pointerdown", (ev) => { if (ev.target.closest(".deck-nav")) return; sw = { x: ev.clientX, y: ev.clientY, id: ev.pointerId }; });
    stage.addEventListener("pointerup", (ev) => {
      if (!sw || sw.id !== ev.pointerId) return;
      const dx = ev.clientX - sw.x, dy = ev.clientY - sw.y;
      sw = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) { show(i + (dx < 0 ? 1 : -1)); return; }
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && !isFs()) {
        const items = slides.map((s, j) => ({ preview: s.src, full: s.src, caption: "Slide " + pad2(j + 1) + " / " + pad2(n) }));
        Lightbox.open(items, i, stage, (j) => show(j));
      }
    });
    stage.addEventListener("pointercancel", () => { sw = null; });

    // thumbnails are small: load them all once the deck is near the screen
    const loadThumbs = () => thumbs.forEach((t) => { const im = $("img", t); if (im) loadImg(im); });
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { io.disconnect(); loadThumbs(); } }, { rootMargin: "300px" });
      io.observe(deck);
    } else loadThumbs();

    show(fromHash(), { instant: true, noHash: !/^#slide-/.test(location.hash) });
    window.addEventListener("hashchange", () => { if (/^#slide-/.test(location.hash)) show(fromHash(), { noHash: true }); });
  });

  /* ---------------- PDF viewer (pdf.js from cdnjs, loaded on first use) ---------------- */
  let pdfjsPromise = null;
  function loadPdfjs() {
    if (!pdfjsPromise) {
      pdfjsPromise = import(PDFJS + "pdf.min.mjs").then((lib) => {
        lib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.mjs";
        return lib;
      });
      pdfjsPromise.catch(() => { pdfjsPromise = null; });
    }
    return pdfjsPromise;
  }
  $$(".pdfv").forEach((box) => {
    const pagesEl = $(".pdfv-pages", box);
    const pageLabel = $(".pdfv-page", box);
    const zoomLabel = $(".pdfv-zoom", box);
    const fitBtn = $('[data-pdf-act="fit"]', box);
    let pdf = null, base = null, zoom = 1, fit = true, slots = [], current = 1, started = false;
    const dpr = () => Math.min(2, window.devicePixelRatio || 1);
    const msg = (t) => { pagesEl.innerHTML = '<p class="pdfv-msg"></p>'; $(".pdfv-msg", pagesEl).textContent = t; };

    function scale() {
      if (!base) return 1;
      const avail = pagesEl.clientWidth - 24;
      const fitScale = Math.max(0.3, Math.min(avail / base.width, 2.2));
      return fit ? fitScale : zoom;
    }
    function layout() {
      const sc = scale();
      zoomLabel.textContent = Math.round(sc * 100) + "%";
      fitBtn.setAttribute("aria-pressed", String(fit));
      slots.forEach((sl) => {
        const w = (sl.w || base.width) * sc, h = (sl.h || base.height) * sc;
        sl.el.style.width = w + "px";
        sl.el.style.height = h + "px";
        if (sl.scale !== sc) { sl.scale = null; sl.el.querySelector("canvas")?.remove(); if (sl.visible) render(sl); }
      });
    }
    async function render(sl) {
      const sc = scale();
      if (sl.scale === sc || sl.busy) return;
      sl.busy = true;
      try {
        const page = await pdf.getPage(sl.n);
        const vp = page.getViewport({ scale: sc * dpr() });
        const one = page.getViewport({ scale: 1 });
        sl.w = one.width; sl.h = one.height;
        const c = document.createElement("canvas");
        c.width = Math.floor(vp.width);
        c.height = Math.floor(vp.height);
        await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
        sl.el.querySelector("canvas")?.remove();
        sl.el.prepend(c);
        sl.scale = sc;
        sl.el.style.width = one.width * sc + "px";
        sl.el.style.height = one.height * sc + "px";
      } catch (e) { /* page stays blank */ }
      sl.busy = false;
      if (sl.scale !== null && sl.scale !== scale() && sl.visible) render(sl);
    }
    function updatePage() {
      const top = pagesEl.scrollTop + pagesEl.clientHeight * 0.35;
      let k = 1;
      for (const sl of slots) { if (sl.el.offsetTop <= top) k = sl.n; }
      current = k;
      pageLabel.textContent = current + " / " + slots.length;
    }
    function goTo(k) {
      k = Math.min(slots.length, Math.max(1, k));
      pagesEl.scrollTo({ top: slots[k - 1].el.offsetTop - 12, behavior: "smooth" });
    }
    let starting = null;
    function start() {
      if (!starting) starting = begin().then(() => { if (!pdf) starting = null; });
      return starting;
    }
    async function begin() {
      if (started) return;
      started = true;
      msg("Đang tải trình xem PDF…");
      try {
        const [lib, bytes] = await Promise.all([loadPdfjs(), assetBytes(box.dataset.pdf)]);
        pdf = await lib.getDocument({ data: bytes, isEvalSupported: false }).promise;
        const first = await pdf.getPage(1);
        base = first.getViewport({ scale: 1 });
        pagesEl.innerHTML = "";
        slots = [];
        for (let k = 1; k <= pdf.numPages; k++) {
          const el = document.createElement("div");
          el.className = "pdfv-slot";
          el.innerHTML = '<span class="pdfv-n">' + k + "</span>";
          pagesEl.appendChild(el);
          slots.push({ n: k, el, scale: null, visible: false });
        }
        const io = new IntersectionObserver((entries) => entries.forEach((en) => {
          const sl = slots.find((x) => x.el === en.target);
          sl.visible = en.isIntersecting;
          if (en.isIntersecting) render(sl);
        }), { root: pagesEl, rootMargin: "600px 0px" });
        slots.forEach((sl) => io.observe(sl.el));
        box.classList.add("on");
        layout();
        updatePage();
      } catch (e) {
        msg(location.protocol === "file:" ? "Trình xem PDF cần mở trang qua http(s), không mở được từ tệp cục bộ." : "Không mở được tệp PDF. Dùng nút tải về để xem.");
        started = false;
      }
    }
    pagesEl.addEventListener("scroll", () => { if (slots.length) updatePage(); }, { passive: true });
    // open the viewer (if it is not yet) and go to a page: the "Đi tới" buttons and a link ending in #trang-N
    async function openAt(k) {
      box.scrollIntoView({ block: "start" });
      await start();
      if (pdf) goTo(k);
    }
    box.addEventListener("click", (ev) => {
      const j = ev.target.closest("[data-pdf-goto]");
      if (j) { openAt(+j.dataset.pdfGoto); return; }
      const b = ev.target.closest("[data-pdf-act]");
      if (b && b.dataset.pdfAct === "open") { start(); return; }
      if (!b || !pdf) return;
      const act = b.dataset.pdfAct;
      if (act === "prev") goTo(current - 1);
      else if (act === "next") goTo(current + 1);
      else if (act === "in" || act === "out") {
        const sc = scale();
        fit = false;
        zoom = Math.min(4, Math.max(0.3, act === "in" ? sc * 1.25 : sc / 1.25));
        const keep = current;
        layout();
        goTo(keep);
      } else if (act === "fit") { fit = true; layout(); }
    });
    let rz = null;
    window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (pdf && fit) layout(); }, 200); });
    if (box.classList.contains("lazy")) { /* a big file: opens on a click, or from a #trang-N link */ }
    else if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { io.disconnect(); start(); } }, { rootMargin: "200px" });
      io.observe(box);
    } else start();
    const fromHash = () => { const m = /^#trang-(\d+)$/.exec(location.hash); return m ? +m[1] : 0; };
    if (fromHash() && box === $(".pdfv")) openAt(fromHash());
    window.addEventListener("hashchange", () => { if (fromHash() && box === $(".pdfv")) openAt(fromHash()); });
  });

  /* ---------------- the published copy is written with document.write: scroll to the #anchor ourselves ---------------- */
  if (location.hash && !/^#slide-/.test(location.hash)) {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) requestAnimationFrame(() => target.scrollIntoView());
  }
})();
