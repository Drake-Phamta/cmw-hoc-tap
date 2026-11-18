/* Behaviour of the study hub (direction A "Viewer").

   Navigation: the course navigation and the outline of the page (scroll-spy, reading position, the breadcrumb's last
   step), the "Mục lục" sheet, the way back after a deep link ("← Quay lại …") with the scroll position restored.
   Layers: every viewer, code excerpt, evidence note, help note, image zoom and the sheet opens as a layer over the page
   and pushes a history entry, so Back, Esc and the close button all close it and leave the page where it was; a link
   inside a layer that leaves the page closes the layers first, so history stays a plain list of pages.
   Viewers: slides with the script and the narration of each slide (played in place, the sentence being read lit),
   report pages, the video with captions in a band under the picture (size and on/off remembered) and a synced,
   searchable transcript. Kit: "Mở ngay" (keys 1 to 6), checklist, timer, questions. Home: "Bạn là ai?" remembered.

   The same page works in two modes, set on <html data-mode>:
   - "site": the plaintext preview; files are plain URLs under data-root.
   - "dist": the published copy; every image and file is an encrypted blob ("CMW1" + IV + AES-GCM) listed in
     window.CMW_ASSETS, fetched and decrypted here with the key the password gate stored. */
(() => {
  "use strict";

  const html = document.documentElement;
  const MODE = html.dataset.mode || "site";
  const ROOT = html.dataset.root || "";
  const KEY = "cmw-hub-key";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const pad2 = (n) => String(n).padStart(2, "0");
  const mmss = (t) => { t = Math.max(0, Math.round(t)); return pad2(Math.floor(t / 60)) + ":" + pad2(t % 60); };
  const mb = (n) => (n / 1048576).toFixed(1).replace(".", ",") + " MB";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const el = (tag, attrs = {}, inner = "") => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v === true ? "" : v); } if (inner) e.innerHTML = inner; return e; };
  const store = {
    get(k, s = "localStorage") { try { return window[s].getItem(k); } catch (e) { return null; } },
    set(k, v, s = "localStorage") { try { window[s].setItem(k, v); } catch (e) { /* storage blocked */ } },
    del(k, s = "localStorage") { try { window[s].removeItem(k); } catch (e) { /* storage blocked */ } },
  };
  const typing = (n) => n && (n.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName));
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches || /[?&]still\b/.test(location.search);
  const narrow = () => matchMedia("(max-width: 759px)").matches;
  let CFG = {};
  try { CFG = JSON.parse(($("#cmw-page") || {}).textContent || "{}"); } catch (e) { CFG = {}; }
  const ICON = {
    prev: '<svg class="icon" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg class="icon" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
    plus: '<svg class="icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M11 8v6M8 11h6M16.5 16.5L21 21"/></svg>',
    minus: '<svg class="icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M8 11h6M16.5 16.5L21 21"/></svg>',
    fit: '<svg class="icon" viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>',
    down: '<svg class="icon" viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12.5-7.5z"/></svg>',
    ext: '<svg class="icon" viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  };

  /* ================================================================ files: plain in the preview, decrypted when published */
  const TYPES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml",
    pdf: "application/pdf", mp4: "video/mp4", m4a: "audio/mp4", webm: "video/webm", vtt: "text/vtt", glb: "model/gltf-binary", json: "application/json",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  const typeOf = (path) => { const e = (window.CMW_ASSETS || {})[path]; return (e && e.t) || TYPES[path.split(".").pop().toLowerCase()] || "application/octet-stream"; };
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
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.subarray(4, 16) }, await siteKey(), buf.subarray(16)));
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
  const textCache = new Map();
  function assetText(path) {
    if (!textCache.has(path)) {
      const p = assetBytes(path).then((b) => new TextDecoder().decode(b));
      p.catch(() => textCache.delete(path));
      textCache.set(path, p);
    }
    return textCache.get(path);
  }
  const assetJSON = (path) => assetText(path).then((t) => JSON.parse(t));
  const courseData = (cid) => (CFG.data && CFG.data[cid] ? assetJSON(CFG.data[cid]) : Promise.reject(new Error("no data for " + cid)));
  function setImg(img, path) {
    return assetURL(path).then((u) => new Promise((resolve, reject) => {
      if (img.getAttribute("src") === u && img.complete && img.naturalWidth) return resolve();
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image " + path));
      img.src = u;
    }));
  }

  /* lazy images: <img data-src="media/..."> (data-eager: at once) */
  function loadImg(img) {
    if (!img || img.dataset.loaded || !img.dataset.src) return;
    img.dataset.loaded = "1";
    setImg(img, img.dataset.src).catch(() => { img.dataset.loaded = ""; img.classList.add("is-error"); });
  }
  const lazy = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { lazy.unobserve(en.target); loadImg(en.target); } }), { rootMargin: "800px 0px" })
    : null;
  function watchImages(root = document) {
    $$("img[data-src]", root).forEach((img) => { if (img.dataset.eager || !lazy) loadImg(img); else lazy.observe(img); });
  }
  watchImages();

  /* downloads: <a data-asset="media/..." download="name"> decrypt on click */
  document.addEventListener("click", async (ev) => {
    const a = ev.target.closest("a[data-asset]");
    if (!a || MODE !== "dist") return;
    ev.preventDefault();
    if (a.classList.contains("is-busy")) return;
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

  /* a person's name never breaks across two lines: the spaces inside the names become no-break spaces, in the page
     and in whatever is drawn later (transcripts, layers); one character for one, so offsets and highlights still match */
  {
    const NAMES = (CFG.names || []).filter((n) => / /.test(n));
    if (NAMES.length) {
      const re = new RegExp(NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "[ \u00a0]")).join("|"), "g");
      const SKIP = "script, style, textarea, code, pre, kbd, samp, .pl-cap";
      const glue = (root) => {
        if (!root || (root.nodeType === 1 && root.closest(SKIP))) return;
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.nodeValue.indexOf(" ") < 0 || (n.parentElement && n.parentElement.closest(SKIP))) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
        const hits = [];
        while (w.nextNode()) hits.push(w.currentNode);
        for (const n of hits) {
          re.lastIndex = 0;
          if (!re.test(n.nodeValue)) continue;
          re.lastIndex = 0;
          n.nodeValue = n.nodeValue.replace(re, (m) => m.replace(/ /g, "\u00a0"));
        }
      };
      glue(document.body);
      new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) glue(n.nodeType === 3 ? n.parentNode : n); })
        .observe(document.body, { childList: true, subtree: true });
    }
  }
  {
    const SKIPS = "script, style, textarea, code, pre, kbd, samp, .sep, title, option, .pl-cap";
    const mark = (root) => {
      if (!root || (root.nodeType === 1 && root.closest(SKIPS))) return;
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.nodeValue.indexOf(" · ") < 0 || (n.parentElement && n.parentElement.closest(SKIPS))) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
      const hits = [];
      while (w.nextNode()) hits.push(w.currentNode);
      for (const n of hits) {
        const pd = n.parentElement && getComputedStyle(n.parentElement).display;
        if (/flex|grid/.test(pd || "")) { n.nodeValue = n.nodeValue.split(" · ").join("\u00a0· "); continue; }
        const parts = n.nodeValue.split(" · ");
        const frag = document.createDocumentFragment();
        parts.forEach((x, i) => {
          if (i) { frag.appendChild(document.createTextNode("\u00a0")); const s = document.createElement("span"); s.className = "sep"; s.textContent = "·"; frag.appendChild(s); frag.appendChild(document.createTextNode(" ")); }
          if (x) frag.appendChild(document.createTextNode(x));
        });
        n.parentNode.replaceChild(frag, n);
      }
    };
    // a dot at the end of a line: the next letter after it sits lower; on a line, the same space on both sides
    const charRect = (node, k) => { const rg = document.createRange(); rg.setStart(node, k); rg.setEnd(node, k + 1); const b = rg.getBoundingClientRect(); return b.width || b.height ? b : null; };
    const prevChar = (s) => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      w.currentNode = s.firstChild || s;
      while (w.previousNode()) {
        const n = w.currentNode, pe = n.parentElement;
        if (!pe || !pe.getClientRects().length || pe.closest(".sr, .sr-only")) continue;
        for (let k = n.nodeValue.length - 1; k >= 0; k--) if (!/\s/.test(n.nodeValue[k])) {
          const b = charRect(n, k);
          if (!b) continue;
          const box = pe.closest("button, .cite, .pill, .chip, kbd, code, .ext-mark");
          return box ? box.getBoundingClientRect() : b;
        }
      }
      return null;
    };
    const fix = () => {
      for (const s of document.querySelectorAll(".sep")) {
        if (!s.getClientRects().length) continue;
        const r = s.getBoundingClientRect();
        let next = null;
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        w.currentNode = s.lastChild || s;
        while (w.nextNode()) { const pe = w.currentNode.parentElement; if (!pe || !pe.getClientRects().length) continue; const v = w.currentNode.nodeValue; const k = v.search(/\S/); if (k >= 0) { next = [w.currentNode, k]; break; } }
        let eol = true;
        if (next) {
          const rg = document.createRange(); rg.setStart(next[0], next[1]); rg.setEnd(next[0], next[1] + 1);
          const b = rg.getBoundingClientRect();
          eol = !(b.width || b.height) ? true : b.top > r.bottom - 2;
        }
        s.classList.toggle("eol", eol);
        if (!eol && next) {
          const rg = document.createRange(); rg.setStart(next[0], next[1]); rg.setEnd(next[0], next[1] + 1);
          const nbox = next[0].parentElement && next[0].parentElement.closest("button, .cite, .pill, .chip, kbd, code, .ext-mark");
          const nb = nbox ? nbox.getBoundingClientRect() : rg.getBoundingClientRect(), pb = prevChar(s), dot = s.getBoundingClientRect();
          if (pb && Math.abs(pb.top - dot.top) < 3 && Math.abs(nb.top - dot.top) < 3) {
            const gl = dot.left - pb.right, gr = nb.left - dot.right;
            if (Math.abs(gl - gr) > 0.75) {
              const m = (parseFloat(s.style.marginLeft) || 0) + (gr - gl) / 2;
              s.style.marginLeft = m.toFixed(2) + "px";
              s.style.marginRight = (-m).toFixed(2) + "px";
            }
          }
        }
      }
    };
    let raf = 0;
    const later = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; fix(); }); };
    mark(document.body);
    later();
    addEventListener("resize", later);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(later);
    setTimeout(later, 600);
    new MutationObserver((ms) => { let any = false; for (const m of ms) for (const n of m.addedNodes) { if (n.nodeType === 1 && n.classList && n.classList.contains("sep")) continue; mark(n.nodeType === 3 ? n.parentNode : n); any = true; } if (any) later(); })
      .observe(document.body, { childList: true, subtree: true });
    if ("ResizeObserver" in window) new ResizeObserver(later).observe(document.body);
    window.__fixSeps = fix;
  }

  {
    const rail = $(".rail");
    if (rail) {
      let quietAt = 0;
      const quiet = () => { rail.classList.add("quiet"); quietAt = Date.now(); };
      rail.addEventListener("click", quiet);
      addEventListener("scroll", quiet, { passive: true });
      rail.addEventListener("pointerleave", () => rail.classList.remove("quiet"));
      rail.addEventListener("pointermove", () => { if (Date.now() - quietAt > 600) rail.classList.remove("quiet"); });
      rail.addEventListener("keydown", (ev) => { if (ev.key === "Enter") quiet(); });
      rail.addEventListener("focusin", (ev) => { if (ev.relatedTarget && rail.contains(ev.relatedTarget)) rail.classList.remove("quiet"); });
    }
  }

  addEventListener("keydown", (ev) => { if (ev.key === "Tab") html.classList.add("kbd"); }, true);
  addEventListener("pointerdown", () => html.classList.remove("kbd"), true);

  /* lock: forget the key on this device (the plaintext preview has no lock: the button is not shown there) */
  if (MODE !== "dist") $$("[data-lock]").forEach((b) => { b.hidden = true; });
  document.addEventListener("click", (ev) => {
    if (!ev.target.closest("[data-lock]")) return;
    store.del(KEY, "sessionStorage");
    store.del(KEY);
    location.reload();
  });

  /* copy buttons of code blocks */
  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) { try { await navigator.clipboard.writeText(text); return; } catch (e) { /* fall back */ } }
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
    const b = ev.target.closest(".code .copy, [data-copy-code]");
    if (!b) return;
    const box = b.closest(".code, .cpop");
    const text = $$(".line, .cl .tx", box).map((l) => l.textContent).join("\n");
    const label = $(".copy-label", b) || b;
    const before = label.textContent;
    copyText(text).then(() => { b.classList.add("done"); label.textContent = "Đã chép"; }, () => { label.textContent = "Không chép được"; })
      .finally(() => setTimeout(() => { b.classList.remove("done"); label.textContent = before; }, 1600));
  });

  /* ================================================================ layers: one history entry each */
  const Layers = (() => {
    const stack = [];
    let baseY = null, after = null;
    function open(layer) {
      if (!stack.length) baseY = window.scrollY;
      layer.from = document.activeElement;
      stack.push(layer);
      try { history.pushState({ cmwLayer: stack.length }, "", location.href); } catch (e) { /* history blocked: Esc and the button still close */ }
      document.body.classList.add("layer-open");
      layer.el.style.zIndex = String((layer.z || 60) + stack.length * 2);
      return layer;
    }
    function closeNow(layer) {
      try { layer.close(); } catch (e) { /* already gone */ }
      if (layer.from && layer.from.isConnected && layer.from.focus) layer.from.focus({ preventScroll: true });
    }
    function settle() {
      if (stack.length) return;
      document.body.classList.remove("layer-open");
      if (baseY !== null && Math.abs(window.scrollY - baseY) > 2) window.scrollTo({ top: baseY, behavior: "instant" });
      baseY = null;
      if (after) { const f = after; after = null; setTimeout(f, 0); }
    }
    addEventListener("popstate", (ev) => {
      const depth = (ev.state && ev.state.cmwLayer) || 0;
      while (stack.length > depth) closeNow(stack.pop());
      if (depth > stack.length) { try { history.replaceState({ cmwLayer: stack.length }, "", location.href); } catch (e) { /* ignore */ } }
      settle();
    });
    function back() {
      if (!stack.length) return;
      const st = history.state && history.state.cmwLayer;
      if (st === stack.length) history.back();
      else { closeNow(stack.pop()); settle(); }  // the entry is not ours (blocked history): close directly
    }
    function closeAll(then) {
      if (!stack.length) { if (then) then(); return; }
      after = then || null;
      const st = history.state && history.state.cmwLayer;
      if (st === stack.length) history.go(-stack.length);
      else { while (stack.length) closeNow(stack.pop()); settle(); }
    }
    const top = () => stack[stack.length - 1] || null;
    return { open, back, closeAll, top, depth: () => stack.length, has: (node) => stack.some((l) => l.el.contains(node)) };
  })();
  const inLayer = (node) => !!(node && node.closest && node.closest(".vw, .pop, .lb, .menu"));
  /* only the top layer reacts to keys; a viewer under another layer is asleep */
  const awake = (node) => { const t = Layers.top(); return t ? t.el.contains(node) : !inLayer(node); };

  /* focus trap of the top layer, and Esc closes it (unless a full-screen slide or a search field takes it) */
  function focusables(box) {
    return $$("a[href], button:not([disabled]), input:not([disabled]), select, video[controls], [tabindex]:not([tabindex='-1'])", box).filter((n) => n.offsetParent !== null || n === document.activeElement);
  }
  document.addEventListener("keydown", (ev) => {
    const t = Layers.top();
    if (!t) return;
    if (ev.key === "Escape") {
      if ($(".dk.fs", t.el) || document.fullscreenElement) return;
      const a = document.activeElement;
      if (a && a.type === "search" && a.value && t.el.contains(a)) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      Layers.back();
    } else if (ev.key === "Tab") {
      const f = focusables(t.el);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (ev.shiftKey && i <= 0) { ev.preventDefault(); f[f.length - 1].focus(); }
      else if (!ev.shiftKey && (i === f.length - 1 || i < 0)) { ev.preventDefault(); f[0].focus(); }
    }
  }, true);

  /* ================================================================ lightbox with zoom (wheel, pinch, double tap) */
  const Lightbox = (() => {
    let root, stage, img, cap, count, zoomLabel, loading, items = [], index = 0, onClose = null, layer = null;
    let s = 1, tx = 0, ty = 0, gesture = null, lastTap = 0, token = 0;
    const pointers = new Map();
    function build() {
      root = el("div", { class: "lb", role: "dialog", "aria-modal": "true", "aria-label": "Xem lớn" });
      root.innerHTML =
        '<div class="lb-top"><span class="lb-count"></span><div class="lb-tools">' +
        '<button class="lb-btn" data-act="out" type="button" aria-label="Thu nhỏ">' + ICON.minus + "</button>" +
        '<span class="lb-zoom-label">100%</span>' +
        '<button class="lb-btn" data-act="in" type="button" aria-label="Phóng to">' + ICON.plus + "</button>" +
        '<button class="lb-btn" data-act="fit" type="button" aria-label="Vừa màn hình">' + ICON.fit + "</button>" +
        '<button class="lb-btn txt" data-act="close" type="button">Đóng<span class="keys-only"> · Esc</span></button></div></div>' +
        '<div class="lb-stage"><img class="lb-img" alt=""><span class="lb-loading">Đang tải…</span></div>' +
        '<div class="lb-bottom"><button class="lb-btn" data-act="prev" type="button" aria-label="Trước">' + ICON.prev + "</button>" +
        '<span class="lb-cap"></span><button class="lb-btn" data-act="next" type="button" aria-label="Sau">' + ICON.next + "</button></div>";
      document.body.appendChild(root);
      stage = $(".lb-stage", root); img = $(".lb-img", root); cap = $(".lb-cap", root); count = $(".lb-count", root);
      zoomLabel = $(".lb-zoom-label", root); loading = $(".lb-loading", root);
      root.addEventListener("click", (ev) => {
        const b = ev.target.closest("[data-act]");
        if (!b) return;
        const act = b.dataset.act;
        if (act === "close") Layers.back(); else if (act === "prev") go(-1); else if (act === "next") go(1);
        else if (act === "in") zoomAt(s * 1.5); else if (act === "out") zoomAt(s / 1.5); else if (act === "fit") reset();
      });
      stage.addEventListener("wheel", (ev) => { ev.preventDefault(); zoomAt(s * Math.exp(-ev.deltaY * (ev.deltaMode === 1 ? 0.05 : 0.0018)), ev.clientX, ev.clientY); }, { passive: false });
      stage.addEventListener("pointerdown", down);
      stage.addEventListener("pointermove", move);
      stage.addEventListener("pointerup", up);
      stage.addEventListener("pointercancel", up);
      stage.addEventListener("dblclick", (ev) => toggleZoom(ev.clientX, ev.clientY));
      document.addEventListener("keydown", (ev) => {
        if (!root.classList.contains("open") || Layers.top() !== layer) return;
        if (ev.key === "ArrowLeft") { ev.preventDefault(); ev.stopImmediatePropagation(); go(-1); }
        else if (ev.key === "ArrowRight") { ev.preventDefault(); ev.stopImmediatePropagation(); go(1); }
        else if (ev.key === "+" || ev.key === "=") zoomAt(s * 1.5);
        else if (ev.key === "-") zoomAt(s / 1.5);
        else if (ev.key === "0") reset();
      }, true);
      window.addEventListener("resize", () => { if (root.classList.contains("open")) { clamp(); apply(); } });
    }
    function apply() { img.style.transform = `translate(-50%, -50%) translate(${tx}px, ${ty}px) scale(${s})`; zoomLabel.textContent = Math.round(s * 100) + "%"; stage.classList.toggle("zoomed", s > 1.01); }
    function clamp() {
      const W = stage.clientWidth, H = stage.clientHeight, w = img.offsetWidth * s, h = img.offsetHeight * s;
      const mx = Math.max(0, (w - W) / 2 + 16), my = Math.max(0, (h - H) / 2 + 16);
      tx = Math.min(mx, Math.max(-mx, tx)); ty = Math.min(my, Math.max(-my, ty));
      if (s <= 1.001) { tx = 0; ty = 0; }
    }
    function zoomAt(next, cx, cy) {
      next = Math.min(8, Math.max(1, next));
      const r = stage.getBoundingClientRect();
      const px = (cx === undefined ? r.left + r.width / 2 : cx) - (r.left + r.width / 2);
      const py = (cy === undefined ? r.top + r.height / 2 : cy) - (r.top + r.height / 2);
      tx = px - (next / s) * (px - tx); ty = py - (next / s) * (py - ty); s = next;
      clamp(); apply();
    }
    function toggleZoom(cx, cy) { if (s > 1.01) reset(); else zoomAt(2.5, cx, cy); }
    function reset() { s = 1; tx = 0; ty = 0; apply(); }
    function down(ev) {
      stage.setPointerCapture(ev.pointerId);
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pointers.size === 1) gesture = { type: "drag", x: ev.clientX, y: ev.clientY, tx, ty, moved: false };
      else if (pointers.size === 2) { const [a, b] = Array.from(pointers.values()); gesture = { type: "pinch", d: Math.hypot(a.x - b.x, a.y - b.y), s }; }
    }
    function move(ev) {
      if (!pointers.has(ev.pointerId) || !gesture) return;
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (gesture.type === "pinch" && pointers.size >= 2) { const [a, b] = Array.from(pointers.values()); zoomAt(gesture.s * (Math.hypot(a.x - b.x, a.y - b.y) / gesture.d), (a.x + b.x) / 2, (a.y + b.y) / 2); }
      else if (gesture.type === "drag") {
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
        else if (!gesture.moved && ev.pointerType !== "mouse") { const now = Date.now(); if (now - lastTap < 320) { toggleZoom(ev.clientX, ev.clientY); lastTap = 0; } else lastTap = now; }
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
      $$('[data-act="prev"], [data-act="next"]', root).forEach((b) => { b.hidden = items.length < 2; });
      loading.hidden = false;
      img.style.visibility = "hidden";
      try {
        const u = await assetURL(it.full || it.preview);
        if (my !== token) return;
        await new Promise((res) => { const pre = new Image(); pre.onload = pre.onerror = res; pre.src = u; });
        if (my !== token) return;
        img.src = u;
        img.style.visibility = "";
        loading.hidden = true;
      } catch (e) { if (my === token) loading.textContent = "Không tải được."; }
    }
    function go(d) { if (items.length > 1) show(index + d); }
    function open(list, i, closeCb) {
      if (!root) build();
      items = list; onClose = closeCb || null;
      root.classList.add("open");
      layer = Layers.open({ el: root, z: 90, close: () => { root.classList.remove("open"); if (onClose) onClose(index); } });
      show(i);
      $('[data-act="close"]', root).focus();
    }
    return { open };
  })();
  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".fig-btn[data-full]");
    if (!btn) return;
    const list = $$(".fig-btn[data-full]").filter((b) => (b.dataset.group || "") === (btn.dataset.group || ""));
    Lightbox.open(list.map((b) => ({ preview: $("img", b).dataset.src, full: b.dataset.full, caption: b.dataset.caption || "" })), list.indexOf(btn));
  });

  /* ================================================================ where am I: outline, counter, breadcrumb, progress */
  const allSecs = $$("main section[data-sec]");
  const secs = allSecs.filter((s) => s.id && s.dataset.outline !== "no");
  const nEl = $("[data-n]"), tEl = $("[data-total]"), fill = $("[data-fill]"), whereEl = $("[data-where]");
  const otlLinks = $$(".rail [data-otl]"), otlN = null, otlFill = null;
  const crumbSec = $("[data-crumb-sec]"), crumbLink = $("[data-crumb-link]"), crumbStep = $("[data-crumb-step]");
  if (tEl) tEl.textContent = pad2(Math.max(1, secs.length));
  {  // one section or none: the corner names the page and keeps the scrub bar, it opens nothing
    const tp = $(".ann-br");
    if (tp && secs.length < 2) {
      tp.classList.add("single"); tp.disabled = true;
      tp.removeAttribute("aria-haspopup"); tp.removeAttribute("aria-label");
    }
  }
  let spyRaf = 0, curSec = -2;  // -2: nothing drawn yet, so the first pass always draws
  const stickPx = () => parseFloat(getComputedStyle(html).getPropertyValue("--stick")) || 84;  // the top of the frame
  function onScroll() {
    spyRaf = 0;
    const line = stickPx() + (window.innerHeight - stickPx()) * 0.3;
    let k = -1;
    secs.forEach((s, i) => { if (s.getBoundingClientRect().top <= line) k = i; });
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max > 0 && window.scrollY >= max - 4 && secs.length) k = Math.max(k, secs.length - 1 - (secs[secs.length - 1].getBoundingClientRect().top > window.innerHeight ? 1 : 0));
    const ratio = max > 0 ? Math.min(1, window.scrollY / max) : 1;
    if (fill) fill.style.width = Math.max(4, ratio * 100).toFixed(1) + "%";
    if (otlFill) otlFill.style.width = (ratio * 100).toFixed(1) + "%";
    if (k === curSec) return;
    curSec = k;
    const s = secs[k];
    const kk = Math.max(0, k);  // above the first section the path starts at its first step
    if (nEl) nEl.textContent = pad2(kk + 1);
    if (otlN) otlN.textContent = pad2(kk + 1);
    // above the first section (the page head) and on a page of one section the corner names the page
    if (whereEl) whereEl.textContent = secs.length > 1 && k >= 0 ? secs[k].dataset.sec : (CFG.pageTitle || CFG.pageLabel || document.title.split(" · ")[0]);
    otlLinks.forEach((a, i) => { if (i === kk) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); if (i < k) a.classList.add("seen"); });
    if (crumbSec && crumbLink) {
      crumbSec.hidden = !s;
      if (s) { crumbLink.textContent = s.dataset.sec; crumbLink.setAttribute("href", "#" + s.id); }
    }
    if (crumbStep) {
      crumbStep.hidden = secs.length < 2;
      crumbStep.innerHTML = `<span class="mut">${pad2(kk + 1)}/${pad2(secs.length)}</span> ${esc(secs[kk] ? secs[kk].dataset.sec : "")} <span aria-hidden="true">▾</span>`;
      crumbStep.setAttribute("aria-label", `Phần ${kk + 1} trên ${secs.length}: ${secs[kk] ? secs[kk].dataset.sec : ""}. Mở mục lục của trang`);
    }
    $$("#menu [data-here] a").forEach((a, i) => { if (i === k) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); });
  }
  addEventListener("scroll", () => { if (!spyRaf) spyRaf = requestAnimationFrame(onScroll); }, { passive: true });
  addEventListener("resize", () => { if (!spyRaf) spyRaf = requestAnimationFrame(onScroll); });
  onScroll();

  /* ================================================================ the course navigation: switch between the two courses */
  function showCourse(cid, remember) {
    $$(".side-in").forEach((side) => {
      $$(".side-tab", side).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.course === cid)));
      $$("[data-course-list]", side).forEach((l) => { l.hidden = l.dataset.courseList !== cid; });
    });
    if (remember) store.set("cmw-side-course", cid);
  }
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest(".side-tab");
    if (!b) return;
    const side = b.closest(".side-in");
    showCourse(b.dataset.course, !(side && side.dataset.fixed));
  });
  {
    const side = $(".side-in");
    const saved = store.get("cmw-side-course");
    if (side && !side.dataset.fixed && saved && $(`.side-tab[data-course="${saved}"]`)) showCourse(saved, false);
  }

  /* ================================================================ "Mục lục": this page's outline, then the navigation */
  const menu = $("#menu"), menuBtn = $(".menu-open");
  function openMenu() {
    if (!menu || !menu.hidden) return;
    const list = $("[data-here]", menu);
    if (list && !list.children.length) {
      list.innerHTML = secs.map((s, i) => `<li><a href="#${esc(s.id)}"><span class="n">${pad2(i + 1)}</span><span>${esc(s.dataset.sec)}</span></a></li>`).join("");
      const here = list.closest("[data-menu-here]");
      if (here) here.hidden = secs.length < 2;
    }
    $$("a", list || menu).forEach((a, i) => { if (i === curSec) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); });
    menu.hidden = false;
    menuBtn && menuBtn.setAttribute("aria-expanded", "true");
    Layers.open({ el: menu, z: 70, close: () => { menu.hidden = true; menuBtn && menuBtn.setAttribute("aria-expanded", "false"); } });
    const cur = $("[data-here] a[aria-current]", menu) || $(".menu-close", menu);
    (cur || menu).focus();
  }
  if (menuBtn) menuBtn.addEventListener("click", openMenu);
  document.addEventListener("keydown", (ev) => {
    if ((ev.key !== "m" && ev.key !== "M") || ev.altKey || ev.ctrlKey || ev.metaKey || typing(document.activeElement)) return;
    const t = Layers.top();
    if (t && t.el === menu) { ev.preventDefault(); Layers.back(); }
    else if (!t) { ev.preventDefault(); openMenu(); }
  });
  /* the counter of the bottom-right corner: the sections of this page */
  const secBtn = $("[data-sections]");
  if (secBtn) secBtn.addEventListener("click", () => {
    if (secs.length < 2) return;
    const items = secs.map((s, i) => `<li><a href="#${esc(s.id)}"${i === Math.max(0, curSec) ? ' aria-current="true"' : ""}><span class="n">${pad2(i + 1)}</span><span>${esc(s.dataset.sec)}</span></a></li>`).join("");
    const title = $(".rail") ? $(".rail").getAttribute("aria-label") : "Các phần của trang";
    popover({ title: esc(title), body: `<ol class="sec-list">${items}</ol>`, anchor: secBtn, cls: "small secpop", label: title, bodyCls: "" });
  });
  if (menu) menu.addEventListener("click", (ev) => {
    if (ev.target.closest(".menu-close") || ev.target === menu) Layers.back();
  });

  /* ================================================================ small dialogs: code excerpt, evidence note, help */
  function popover({ title, body, foot = "", anchor = null, cls = "", label = "", actions = "", bodyCls = "txt" }) {
    const scrim = el("div", { class: "scrim" });
    const pop = el("div", { class: "pop " + cls, role: "dialog", "aria-modal": "true", "aria-label": label || "" });
    pop.innerHTML = `<div class="pop-head"><div class="pop-title">${title}</div>${actions}<button class="pill small" type="button" data-pop-close>Đóng<span class="keys-only"> · Esc</span></button></div>` +
      `<div class="pop-body ${bodyCls}">${body}</div>` + (foot ? `<div class="pop-foot">${foot}</div>` : "");
    document.body.appendChild(scrim);
    document.body.appendChild(pop);
    if (anchor && !narrow()) {
      const r = anchor.getBoundingClientRect();
      const h = Math.min(pop.offsetHeight, window.innerHeight - 32);
      let top = r.bottom + 8;
      if (top + h > window.innerHeight - 16) top = Math.max(16, r.top - h - 8);
      if (top + h > window.innerHeight - 16) top = Math.max(16, window.innerHeight - 16 - h);
      const left = Math.min(Math.max(16, r.left), window.innerWidth - pop.offsetWidth - 16);
      pop.style.top = top + "px";
      pop.style.left = left + "px";
      pop.style.maxHeight = (window.innerHeight - top - 16) + "px";
    }
    if (anchor) anchor.setAttribute("aria-expanded", "true");
    Layers.open({ el: pop, z: 64, close: () => { pop.remove(); scrim.remove(); if (anchor) anchor.setAttribute("aria-expanded", "false"); } });
    scrim.style.zIndex = String(parseInt(pop.style.zIndex, 10) - 1);
    scrim.addEventListener("click", () => Layers.back());
    pop.addEventListener("click", (ev) => { if (ev.target.closest("[data-pop-close]")) Layers.back(); });
    ($("a.pill, [data-pop-close]", pop) || pop).focus();
    return pop;
  }
  async function openCode(btn) {
    if (!CFG.code) return;
    const data = await assetJSON(CFG.code);
    const it = data[btn.dataset.key];
    if (!it) return;
    const lines = it.a ? (it.a === it.b ? `dòng ${it.a}` : `dòng ${it.a} tới ${it.b}`) : "cả tệp";
    let rows = "";
    if (it.h && it.h.length) rows = it.h.map((h, k) => { const n = it.s + k; const hl = it.a && n >= it.a && n <= it.b ? " hl" : ""; return `<span class="cl${hl}"><span class="ln">${n}</span><span class="tx">${h}</span></span>`; }).join("");
    const note = !it.h || !it.h.length ? "Không đọc được đoạn mã này từ bản sao repo; mở trên GitHub để xem."
      : (it.w ? `Tệp có ${it.n} dòng; đây là ${it.e - it.s + 1} dòng đầu.` : (it.cut ? "Đoạn dài, phần còn lại xem trên GitHub." : `Tô sáng: ${lines}, kèm vài dòng trước và sau.`));
    const pop = popover({
      title: `${esc(it.p)}<small>${lines} · nhánh ${esc(it.r)}</small>`, cls: "cpop", label: "Mã nguồn " + it.p, anchor: btn, bodyCls: "",
      actions: `<a class="pill small" href="${esc(it.u)}" target="_blank" rel="noopener">${ICON.ext}GitHub<span class="sr"> (mở ở thẻ mới)</span></a>` +
        (rows ? '<button class="pill small" type="button" data-copy-code><span class="copy-label">Sao chép</span></button>' : ""),
      body: rows ? `<pre><code>${rows}</code></pre>` : "", foot: esc(note),
    });
    $(".pop-title", pop).classList.add("mono");
    const hl = $(".cl.hl", pop);
    if (hl) { const b = $(".pop-body", pop); b.scrollTop = Math.max(0, hl.offsetTop - 40); }
  }
  function openEvidence(btn) {
    const where = btn.dataset.where || "", label = btn.dataset.label || where;
    const csv = btn.dataset.kind === "csv";
    const dir = where.includes("/") ? where.split("/")[0] : "";
    const body = csv
      ? `<p><b>${esc(label)}</b></p><p>Tệp kết quả này được tính ngoài repo mã nguồn, nên không có link GitHub. Nó nằm trong thư mục kết quả trên máy tính của nhóm: <code>${esc(where)}</code>.</p>`
      : `<p><b>${esc(label)}</b></p><p>${dir ? `Trong thư mục bằng chứng trên máy tính của nhóm, thư mục con <code>${esc(dir)}</code>, tệp <code>${esc(where.split("/").pop())}</code>.` : `Tệp <code>${esc(where)}</code> trên máy tính của nhóm.`}</p>` +
        "<p>Ảnh chụp có ảnh MRI, logcat và nhật ký không đưa lên trang. Khi thầy hỏi, mở tệp trên máy tính của nhóm.</p>";
    popover({ title: csv ? "Tệp kết quả trên máy nhóm" : "Bằng chứng trên máy nhóm", body, anchor: btn, cls: "small epop", label: "Bằng chứng: " + label });
  }
  function openHelp(btn) {
    const tpl = $("#help-tpl");
    if (!tpl) return;
    popover({ title: "Các ô mở và cách quay lại", body: tpl.innerHTML, anchor: btn, cls: "small hpop", label: "Giải thích" });
  }
  document.addEventListener("click", (ev) => {
    const h = ev.target.closest("[data-help]");
    if (h) { ev.preventDefault(); openHelp(h); }
  });

  /* ================================================================ narration of one slide, played in place */
  const HL = !!(window.CSS && CSS.highlights && window.Highlight);
  const Narr = (() => {
    const audio = new Audio();
    audio.preload = "none";
    const pos = new Map();           // box -> seconds, so going back to a block resumes where it was
    let cur = null;                  // { box, data, align, idx, lit }
    let raf = 0;
    const btnOf = (box) => $(".np-play", box);
    function label(box, text) { const l = $(".np-label", box); if (l) l.textContent = text; }
    function now(box, text) {
      const n = $("[data-np-now]", box), wrap = n && n.closest(".np-now");
      if (!n) return;
      n.textContent = text || "";
      wrap.hidden = !text;
    }
    function setUI(box, playing) {
      box.classList.toggle("on", playing);
      const b = btnOf(box);
      b.setAttribute("aria-pressed", String(playing));
      label(box, playing ? "Tạm dừng" : (pos.get(box) > 0.5 ? "Nghe tiếp" : "Nghe lời đọc mẫu"));
    }
    function paint() {
      raf = 0;
      if (!cur) return;
      const d = cur.data.d || audio.duration || 1;
      const t = audio.currentTime || 0;
      const fillEl = $(".np-track i", cur.box);
      if (fillEl) fillEl.style.width = Math.min(100, (t / d) * 100).toFixed(2) + "%";
      const tb = $(".np-time b", cur.box);
      if (tb) tb.textContent = mmss(t);
      const tr = $(".np-track", cur.box);
      if (tr) { tr.setAttribute("aria-valuenow", String(Math.round(t))); tr.setAttribute("aria-valuetext", mmss(t) + " / " + mmss(d)); }
      light(t);
      if (!audio.paused) raf = requestAnimationFrame(paint);
    }
    function scriptOf(box) {
      const sp = box.closest(".sp");
      if (sp) return $(".sp-say", sp) || $(".sp-script", sp);
      const side = box.closest(".dk-side");
      if (side) return $(".dk-script .sp-say", side) || $(".dk-script", side);
      return null;
    }
    function light(t) {
      if (!cur) return;
      const cues = cur.data.c || [];
      let k = -1;
      for (let i = 0; i < cues.length; i++) { if (cues[i][0] <= t + 0.05) k = i; else break; }
      if (k === cur.idx) return;
      cur.idx = k;
      if (!cur.align) cur.align = align(scriptOf(cur.box), cues);
      now(cur.box, k >= 0 ? cues[k][2] : "");
      const r = k >= 0 ? cur.align.ranges[k] : null;
      mark("np-say", r, cur);  // only a sentence the script really has is lit; the others are shown above as spoken
      const step = k >= 0 ? cues[k][3] : 0;
      const firstOfStep = step > 0 && (k === 0 || cues[k - 1][3] !== step);
      mark("np-step", firstOfStep ? cur.align.steps[step] || null : null, cur, true);
      const side = cur.box.closest(".dk-side");
      if (r && side) { const rr = r.getBoundingClientRect(), sr = side.getBoundingClientRect(); if (rr.top < sr.top + 40 || rr.bottom > sr.bottom - 40) side.scrollTop += rr.top - sr.top - sr.height / 3; }
    }
    function mark(name, range, c, step) {
      if (HL) {
        if (range && range.nodeType === undefined) CSS.highlights.set(name, new Highlight(range)); else CSS.highlights.delete(name);
        if (step) $$(".step.on").forEach((s) => s.classList.remove("on"));
        if (step && range && range.nodeType === 1) range.classList.add("on");
        return;
      }
      const key = step ? "litStep" : "lit";
      if (c[key]) { c[key].classList.remove(step ? "on" : "np-lit"); c[key] = null; }
      if (!range) return;
      const n = range.nodeType === 1 ? range : (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement).closest(step ? ".step" : "p, li, blockquote");
      if (n) { n.classList.add(step ? "on" : "np-lit"); c[key] = n; }
    }
    function clearMarks() {
      if (HL) { CSS.highlights.delete("np-say"); CSS.highlights.delete("np-step"); }
      $$(".np-lit").forEach((n) => n.classList.remove("np-lit"));
      $$(".step.on").forEach((n) => n.classList.remove("on"));
    }
    async function dataOf(box) {
      const C = await courseData(box.dataset.course);
      return (C.narration || {})[box.dataset.n] || null;
    }
    async function toggle(box) {
      if (cur && cur.box === box) {
        if (audio.paused) { pauseVideos(); audio.play().catch(() => {}); } else audio.pause();
        return;
      }
      stop();
      const data = await dataOf(box);
      if (!data) { label(box, "Chưa có lời đọc mẫu"); return; }
      cur = { box, data, align: null, idx: -2 };
      label(box, "Đang tải…");
      try {
        audio.src = await assetURL(data.f);
        await new Promise((res, rej) => { audio.onloadedmetadata = res; audio.onerror = rej; audio.load(); });
        audio.currentTime = Math.min(pos.get(box) || 0, Math.max(0, (data.d || audio.duration) - 0.3));
        pauseVideos();
        await audio.play();
      } catch (e) { label(box, "Không phát được"); cur = null; }
    }
    function stop() {
      if (!cur) return;
      pos.set(cur.box, audio.currentTime || 0);
      audio.pause();
      setUI(cur.box, false);
      clearMarks();
      cur = null;
    }
    // a slide card scrolled out of view pauses its narration; the place is kept ("Nghe tiếp")
    const seen = "IntersectionObserver" in window ? new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting && cur && e.target.contains(cur.box) && !audio.paused) audio.pause();
    })) : null;
    audio.addEventListener("play", () => { if (cur) { setUI(cur.box, true); if (!raf) raf = requestAnimationFrame(paint); const card = cur.box.closest(".sp"); if (seen && card) { seen.disconnect(); seen.observe(card); } } });
    audio.addEventListener("pause", () => { if (cur) { pos.set(cur.box, audio.currentTime); setUI(cur.box, false); paint(); } });
    audio.addEventListener("ended", () => { if (cur) { pos.set(cur.box, 0); setUI(cur.box, false); label(cur.box, "Nghe lại"); clearMarks(); now(cur.box, ""); cur.idx = -2; } });
    audio.addEventListener("seeked", () => { if (cur) paint(); });
    function seekTo(box, frac) {
      if (!cur || cur.box !== box) { pos.set(box, frac * (parseFloat(box.dataset.dur) || 0)); return toggle(box); }
      const d = cur.data.d || audio.duration || 0;
      audio.currentTime = Math.max(0, Math.min(d - 0.05, frac * d));
      cur.idx = -2;
      paint();
    }
    document.addEventListener("click", (ev) => {
      const b = ev.target.closest(".np-play");
      if (b) toggle(b.closest(".np"));
    });
    document.addEventListener("pointerdown", (ev) => {
      const tr = ev.target.closest(".np-track");
      if (!tr) return;
      const box = tr.closest(".np");
      const at = (x) => { const r = tr.getBoundingClientRect(); return Math.min(1, Math.max(0, (x - r.left) / r.width)); };
      tr.setPointerCapture(ev.pointerId);
      seekTo(box, at(ev.clientX));
      const mv = (e) => { if (cur && cur.box === box) seekTo(box, at(e.clientX)); };
      const upf = () => { tr.removeEventListener("pointermove", mv); tr.removeEventListener("pointerup", upf); tr.removeEventListener("pointercancel", upf); };
      tr.addEventListener("pointermove", mv);
      tr.addEventListener("pointerup", upf);
      tr.addEventListener("pointercancel", upf);
    });
    document.addEventListener("keydown", (ev) => {
      const tr = ev.target.closest && ev.target.closest(".np-track");
      if (!tr) return;
      const box = tr.closest(".np");
      if (!cur || cur.box !== box) { if (ev.key === " " || ev.key === "Enter") { ev.preventDefault(); toggle(box); } return; }
      const d = cur.data.d || audio.duration || 1;
      let t = audio.currentTime;
      if (ev.key === "ArrowRight") t += 5; else if (ev.key === "ArrowLeft") t -= 5; else if (ev.key === "Home") t = 0; else if (ev.key === "End") t = d - 0.1;
      else if (ev.key === " " || ev.key === "Enter") { ev.preventDefault(); toggle(box); return; } else return;
      ev.preventDefault();
      seekTo(box, Math.max(0, t) / d);
    });
    return { stop, stopIn: (root) => { if (cur && root.contains(cur.box)) stop(); }, pause: () => { if (cur && !audio.paused) audio.pause(); } };
  })();
  function pauseVideos() { $$("video").forEach((v) => { if (!v.paused) v.pause(); }); }
  document.addEventListener("play", (ev) => { if (ev.target.tagName === "VIDEO") Narr.pause(); }, true);

  /* the sentences of the narration in the script on the page: each cue -> a Range over the script's text (exact
     words first, then the best window of words), each click step -> its "(Bấm k)" mark */
  function align(root, cues) {
    const out = { ranges: [], steps: {} };
    if (!root) return out;
    const nodes = [];
    let text = "";
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (n.parentElement.closest(".np, .sp-row, .dk-src, .cue, h4")) continue;
      nodes.push({ n, a: text.length });
      text += n.data + " ";
    }
    // the written script is read out in words by the narrator: "95 %" is "95 phần trăm", "KTC" is "khoảng tin cậy",
    // "−0,02" is "âm 0,02", "p < 0,0001" is "p nhỏ hơn 0,0001". A symbol or an abbreviation of the script stands for the
    // words it is read as (they keep the symbol's place in the text, so the lit range is still the script's own text)
    const SAID = { "%": ["phần", "trăm"], "±": ["cộng", "trừ"], "=": ["bằng"], "<": ["nhỏ", "hơn"], ">": ["lớn", "hơn"], "≤": ["nhỏ", "hơn", "hoặc", "bằng"],
      "×": ["nhân"], "−": ["âm"], "ktc": ["khoảng", "tin", "cậy"], "χ": ["khi"], "²": ["bình", "phương"], "ms": ["mi", "li", "giây"], "/": ["trên"] };
    const toks = [];
    const re = /[\p{L}\p{N}]+|[%±=<>≤×/]|(?<![\p{L}\p{N}])[−-](?=\d)/gu;  // "−0,02" is a minus; "SCR-02" is not
    let sn = 0;
    for (let m; (m = re.exec(text));) {
      if (toks.length && /[.!?…](\s|$)/.test(text.slice(toks[toks.length - 1].b, m.index))) sn++;  // not "1.942.289"
      let w = m[0].toLowerCase();
      if (w === "-") w = "−";
      if (w === "/" && !(/\d$/.test(text.slice(0, m.index)) && /^\d/.test(text.slice(m.index + 1)))) continue;
      const words = SAID[w] || (/^[%±=<>≤×−/]$/.test(w) ? [] : [w]);
      for (const x of words) toks.push({ w: x, a: m.index, b: m.index + m[0].length, s: sn });
    }
    const at = (off) => { let lo = 0, hi = nodes.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (nodes[mid].a <= off) lo = mid; else hi = mid - 1; } const nd = nodes[lo]; return [nd.n, Math.min(nd.n.data.length, off - nd.a)]; };
    const range = (a, b) => { try { const r = document.createRange(); const [sn, so] = at(a); const [en, eo] = at(b); r.setStart(sn, so); r.setEnd(en, eo); return r; } catch (e) { return null; } };
    let from = 0;
    const spans = [];
    for (const c of cues) {
      const cw = (String(c[2]).match(/[\p{L}\p{N}]+/gu) || []).map((w) => w.toLowerCase());
      let hit = null;
      if (cw.length) {
        for (let j = Math.max(0, from - 3); j + cw.length <= toks.length && !hit; j++) {
          let ok = true;
          for (let q = 0; q < cw.length; q++) if (toks[j + q].w !== cw[q]) { ok = false; break; }
          if (ok) hit = [j, j + cw.length - 1];
        }
        if (!hit) {
          // the window of words that holds most of the sentence's words with the fewest others; it starts and ends on
          // a word of the sentence (the narration may say a number or a name differently from the written script)
          let best = -1, bj = -1, bz = -1, bc = 0;
          const L = Math.round(cw.length * 1.5) + 4;
          const want = new Map();
          cw.forEach((w) => want.set(w, (want.get(w) || 0) + 1));
          for (let j = Math.max(0, from - 8); j < toks.length && j < from + 600; j++) {
            if (!want.has(toks[j].w)) continue;
            const got = new Map();
            let common = 0;
            for (let q = j; q < Math.min(toks.length, j + L); q++) {
              const w = toks[q].w, need = want.get(w) || 0, have = got.get(w) || 0;
              if (have < need) { got.set(w, have + 1); common++; }
              if (!need) continue;
              const score = (common - 0.35 * (q - j + 1 - common)) / cw.length - 0.12 * (toks[q].s - toks[j].s);
              if (score > best + 1e-9) { best = score; bj = j; bz = q; bc = common; }
            }
          }
          if (bj >= 0 && bc / cw.length >= 0.8 && (bz - bj + 1 - bc) <= Math.max(2, Math.round(0.25 * (bz - bj + 1))) && best >= 0.7) {
            // a word or two of the written sentence that the narration dropped ("Em" before "thử ba hàm…") belongs to it
            let a0 = bj, a1 = bz;
            while (a0 > 0 && toks[a0 - 1].s === toks[bj].s && bj - a0 < 2) a0--;
            if (a0 > 0 && toks[a0 - 1].s === toks[bj].s) a0 = bj;
            while (a1 < toks.length - 1 && toks[a1 + 1].s === toks[bz].s && a1 - bz < 2) a1++;
            if (a1 < toks.length - 1 && toks[a1 + 1].s === toks[bz].s) a1 = bz;
            hit = [a0, a1];
          }
        }
      }
      spans.push(hit);
      if (hit) from = hit[1] + 1;
    }
    // a sentence the narrator says differently from the script ("Phần 2 do Vũ Hùng Anh phụ trách" for "Em là Vũ Hùng
    // Anh") is not lit anywhere: the player shows it as spoken instead
    out.exact = spans.filter(Boolean).length;
    spans.forEach((h) => out.ranges.push(h ? range(toks[h[0]].a, toks[h[1]].b) : null));
    // click steps: "(Bấm k)" in the text, or the <span class="step">Bấm k</span> of the deck notes
    for (const s of $$(".step", root)) { const m = /(\d+)/.exec(s.textContent); if (m) out.steps[+m[1]] = s; }
    const sre = /\(Bấm\s+(\d+)\)/g;
    for (let m; (m = sre.exec(text));) if (!out.steps[+m[1]]) out.steps[+m[1]] = range(m.index, m.index + m[0].length);
    return out;
  }
  function narrationBox(cid, n, nar) {
    if (!nar) return "";
    return `<div class="np" data-np data-course="${esc(cid)}" data-n="${n}" data-dur="${nar.d}"><div class="np-row">` +
      `<button type="button" class="np-play" aria-pressed="false" aria-label="Nghe lời đọc mẫu của slide ${n}"><span class="np-ico" aria-hidden="true"></span><span class="np-label">Nghe lời đọc mẫu</span></button>` +
      `<span class="np-track" role="slider" tabindex="0" aria-label="Vị trí trong lời đọc mẫu của slide ${n}" aria-valuemin="0" aria-valuemax="${Math.round(nar.d)}" aria-valuenow="0" aria-valuetext="00:00 / ${mmss(nar.d)}"><i></i></span>` +
      `<span class="np-time"><b>00:00</b> / ${mmss(nar.d)}</span></div>` +
      `<p class="np-now" hidden><span class="k">Lời đọc mẫu</span><span data-np-now></span></p></div>`;
  }
  $$(".np[data-np]").forEach((box) => { if (!box.dataset.dur) courseData(box.dataset.course).then((C) => { const x = (C.narration || {})[box.dataset.n]; if (x) box.dataset.dur = x.d; }).catch(() => {}); });

  /* ================================================================ slides */
  if (/[?&]qa\b/.test(location.search)) window.__cmw = { align: (root, cues) => align(root, cues), courseData, script: (s) => scriptHTML(s) };
  function partOf(D, n) { return (D.parts || []).find((p) => n >= p.from && n <= p.to) || null; }
  function scriptHTML(s) {
    const out = [];
    for (const it of s.script || []) {
      if (it.k === "say") out.push(`<p>${esc(it.t)}</p>`);
      else if (it.k === "step") out.push(`<p><span class="step">Bấm ${it.n}</span>${esc(it.t)}</p>`);
      else out.push(`<p class="cue">${esc(it.t)}</p>`);
    }
    return out.join("") || '<p class="cue">Slide này không có ghi chú lời nói.</p>';
  }
  /* opts: only (slide numbers shown in the strip), start, scriptFor(n) -> Node (the kit's own script), onVideo(n, test),
     narration ({n: {f, d, c}}), cid, hash (keep #slide-N), team */
  function mountDeck(box, D, opts = {}) {
    const all = D.slides;
    const list = (opts.only && opts.only.length ? opts.only : all.map((s) => s.n)).filter((n) => n >= 1 && n <= all.length);
    const team = opts.team || {};
    const nar = opts.narration || {};
    let i = Math.max(0, list.indexOf(opts.start || list[0]));
    box.innerHTML = "";
    const dk = el("div", { class: "dk" });
    dk.innerHTML =
      '<div class="dk-main"><div class="dk-stage" role="group" aria-roledescription="slide" aria-label="Slide">' +
      '<img alt=""><button class="dk-zoom" type="button" aria-label="Xem slide cỡ lớn"></button>' +
      '<button class="dk-zone prev" type="button" aria-label="Slide trước" tabindex="-1">' + ICON.prev + '</button>' +
      '<button class="dk-zone next" type="button" aria-label="Slide sau" tabindex="-1">' + ICON.next + "</button></div>" +
      '<div class="dk-bar"><button class="pill" type="button" data-d="prev" aria-label="Slide trước">' + ICON.prev + '</button>' +
      '<span class="dk-count" aria-live="polite"></span>' +
      '<button class="pill" type="button" data-d="next" aria-label="Slide sau">' + ICON.next + '</button>' +
      (opts.overlay ? '<button class="pill" type="button" data-d="strip" aria-expanded="false">Các slide</button>' : "") +
      '<span class="grow"></span><button class="pill opt" type="button" data-d="fs">Toàn màn hình<span class="keys-only"> · F</span></button></div></div>' +
      '<aside class="dk-side" aria-label="Lời nói của slide"></aside><div class="dk-strip" aria-label="Các slide"></div>';
    box.appendChild(dk);
    const img = $(".dk-stage img", dk), side = $(".dk-side", dk), count = $(".dk-count", dk);
    // strip grouped by part
    const strip = $(".dk-strip", dk);
    const groups = [];
    for (const n of list) {
      const p = partOf(D, n);
      const key = p ? p.label : "";
      if (!groups.length || groups[groups.length - 1].key !== key) groups.push({ key, who: p && p.who, items: [] });
      groups[groups.length - 1].items.push(n);
    }
    strip.innerHTML = groups.map((g) => {
      const col = g.who && team[g.who] ? ` style="--k:${team[g.who].color}"` : "";
      return `<div class="dk-group"${col}><div class="dk-group-k"><i></i>${esc(g.key)}</div><div class="dk-thumbs">` +
        g.items.map((n) => `<button class="dk-thumb" type="button" data-n="${n}" aria-label="Slide ${n}: ${esc(all[n - 1].t)}"><img data-src="${esc(all[n - 1].th)}" alt=""><span>${n}</span></button>`).join("") +
        "</div></div>";
    }).join("");
    const thumbs = $$(".dk-thumb", strip);
    const loadThumbs = () => thumbs.forEach((t) => loadImg($("img", t)));
    if ("IntersectionObserver" in window) { const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { io.disconnect(); loadThumbs(); } }, { rootMargin: "300px" }); io.observe(strip); } else loadThumbs();
    let token = 0;
    function render() {
      const n = list[i];
      const s = all[n - 1];
      const my = ++token;
      Narr.stopIn(side);
      const main = D.main || all.length;
      count.innerHTML = n <= main ? `<b>${pad2(n)}</b> / ${pad2(main)}` : `<b>${pad2(n)}</b> · phụ lục ${n - main} / ${all.length - main}`;
      $$("[data-d=prev], .dk-zone.prev", dk).forEach((b) => { b.disabled = i === 0; });
      $$("[data-d=next], .dk-zone.next", dk).forEach((b) => { b.disabled = i === list.length - 1; });
      thumbs.forEach((t) => t.setAttribute("aria-current", String(+t.dataset.n === n)));
      const cur = thumbs.find((t) => +t.dataset.n === n);
      if (cur && strip.offsetParent) strip.scrollTo({ left: cur.offsetLeft - strip.clientWidth / 2 + cur.clientWidth / 2, behavior: reduceMotion ? "auto" : "smooth" });
      img.alt = `Slide ${n}: ${s.t}`;
      img.classList.add("fading");
      setImg(img, s.img).catch(() => {}).finally(() => { if (my === token) img.classList.remove("fading"); });
      [list[i + 1], list[i - 1]].forEach((x) => { if (x) assetURL(all[x - 1].img).catch(() => {}); });
      const p = partOf(D, n);
      const col = p && p.who && team[p.who] ? ` style="--k:${team[p.who].color}"` : "";
      const clicks = s.clicks ? `<p class="dk-clicks">${"<i></i>".repeat(Math.min(s.clicks, 6))}${s.clicks} lần bấm trong slide</p>` : "";
      side.innerHTML = `<p class="dk-part"${col}><i></i>${esc(p ? p.label : "")}${s.sec && p && !p.label.startsWith(s.sec) ? " · " + esc(s.sec) : ""}</p>` +
        `<h3 class="dk-title">Slide ${n} · ${esc(s.t)}</h3><p class="dk-meta">${esc([s.dur].filter(Boolean).join(" · "))}</p>${clicks}` +
        `${narrationBox(opts.cid, n, nar[n])}<p class="dk-acts"></p><div class="dk-script"></div>` +
        (s.src ? `<p class="dk-src"><b>Nguồn:</b> ${esc(s.src)}</p>` : "");
      const sc = $(".dk-script", side);
      const own = opts.scriptFor ? opts.scriptFor(n) : null;
      if (own) { sc.appendChild(own); const src = $(".dk-src", side); if (src) src.remove(); } else sc.innerHTML = scriptHTML(s);
      const acts = $(".dk-acts", side);
      if (opts.onVideo && opts.onVideo(n, true)) {
        const b = el("button", { class: "pill small", type: "button", "aria-haspopup": "dialog" }, "Xem trong video");
        b.addEventListener("click", () => opts.onVideo(n));
        acts.appendChild(b);
      }
      side.scrollTop = 0;
      if (opts.hash) { try { history.replaceState(history.state, "", "#slide-" + n); } catch (e) { /* ignore */ } }
      if (opts.onChange) opts.onChange(n);
    }
    function go(d) { const j = Math.min(list.length - 1, Math.max(0, i + d)); if (j !== i) { i = j; render(); } }
    function to(n) { const j = list.indexOf(n); if (j >= 0) { i = j; render(); } }
    let swiped = 0;
    dk.addEventListener("click", (ev) => {
      if (Date.now() - swiped < 400) { ev.preventDefault(); return; }
      const b = ev.target.closest(".dk-bar [data-d], .dk-zone, .dk-thumb, .dk-zoom");
      if (!b || b.disabled) return;
      if (b.classList.contains("dk-zone") || b.classList.contains("dk-zoom")) b.blur();
      if (b.classList.contains("dk-thumb")) to(+b.dataset.n);
      else if (b.classList.contains("dk-zoom")) zoom();
      else if (b.dataset.d === "fs") toggleFs();
      else if (b.dataset.d === "strip") { const on = !dk.classList.contains("strip-open"); dk.classList.toggle("strip-open", on); b.setAttribute("aria-expanded", String(on)); if (on) { loadThumbs(); render(); } }
      else if (b.dataset.d === "prev" || b.classList.contains("prev")) go(-1);
      else if (b.dataset.d === "next" || b.classList.contains("next")) go(1);
    });
    function zoom() {
      if (dk.classList.contains("fs")) return;
      Lightbox.open(list.map((n) => ({ full: all[n - 1].img, caption: `Slide ${n} · ${all[n - 1].t}` })), i, (j) => { if (j !== i) { i = j; render(); } });
    }
    const fsBtn = $("[data-d=fs]", dk);
    function fsLabel(on) { if (fsBtn) fsBtn.innerHTML = on ? 'Thoát toàn màn hình<span class="keys-only"> · Esc</span>' : 'Toàn màn hình<span class="keys-only"> · F</span>'; }
    function toggleFs() {
      const on = !dk.classList.contains("fs");
      dk.classList.toggle("fs", on);
      fsLabel(on);
      if (on && dk.requestFullscreen) dk.requestFullscreen().catch(() => {});
      else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
    document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && dk.classList.contains("fs")) { dk.classList.remove("fs"); fsLabel(false); } });
    // swipe on the stage
    const stage = $(".dk-stage", dk);
    let sw = null;
    stage.addEventListener("pointerdown", (ev) => { sw = { x: ev.clientX, y: ev.clientY, id: ev.pointerId }; });
    stage.addEventListener("pointerup", (ev) => {
      if (!sw || sw.id !== ev.pointerId) return;
      const dx = ev.clientX - sw.x, dy = ev.clientY - sw.y;
      sw = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) { swiped = Date.now(); go(dx < 0 ? 1 : -1); }
    });
    stage.addEventListener("pointercancel", () => { sw = null; });
    let onScreen = true;
    if ("IntersectionObserver" in window) new IntersectionObserver((e) => { onScreen = e[0].isIntersecting; }, { threshold: 0.2 }).observe(stage);
    const keyh = (ev) => {
      if (!dk.isConnected) { document.removeEventListener("keydown", keyh); return; }
      if (ev.defaultPrevented || typing(document.activeElement) || ev.altKey || ev.ctrlKey || ev.metaKey) return;
      if (!onScreen && !dk.classList.contains("fs")) return;
      if (!awake(dk)) return;
      const k = ev.key;
      if (k === "ArrowRight" || k === "PageDown") { ev.preventDefault(); go(1); }
      else if (k === "ArrowLeft" || k === "PageUp") { ev.preventDefault(); go(-1); }
      else if (k === "Home" && !ev.target.closest(".np-track")) { ev.preventDefault(); i = 0; render(); }
      else if (k === "End" && !ev.target.closest(".np-track")) { ev.preventDefault(); i = list.length - 1; render(); }
      else if (k === "f" || k === "F") { ev.preventDefault(); toggleFs(); }
      else if (k === "Escape" && dk.classList.contains("fs")) { ev.preventDefault(); ev.stopImmediatePropagation(); toggleFs(); }
    };
    document.addEventListener("keydown", keyh);
    render();
    return { to, el: dk };
  }

  /* ================================================================ report pages */
  /* opts: start (PDF page), secs (the member's sections: shown first, the rest behind "Cả báo cáo"), team, hash */
  function mountReport(box, R, opts = {}) {
    const team = opts.team || {};
    let page = Math.min(R.n, Math.max(1, opts.start || 1));
    const whoOf = (t) => Object.keys(team).find((k) => t.includes(team[k].name));
    let onlyMine = !!(opts.secs && opts.secs.length);
    box.innerHTML = "";
    const rv = el("div", { class: "rv" });
    rv.innerHTML =
      '<aside class="rv-toc" aria-label="Mục lục báo cáo"><p class="rv-toc-k">Mục lục báo cáo</p><select aria-label="Đi tới chương hoặc mục"></select><ol></ol></aside>' +
      '<div class="rv-main"><div class="rv-bar"><button class="pill" type="button" data-r="prev" aria-label="Trang trước">' + ICON.prev + '</button>' +
      '<span class="where" aria-live="polite"></span><button class="pill" type="button" data-r="next" aria-label="Trang sau">' + ICON.next + '</button>' +
      '<button class="pill opt" type="button" data-r="zoom">Phóng to</button></div>' +
      `<div class="rv-page" style="aspect-ratio:1/${R.ratio || 1.414}" role="img"><img alt=""><span class="loading">Đang mở trang…</span></div></div>`;
    box.appendChild(rv);
    const ol = $("ol", rv), sel = $("select", rv), where = $(".where", rv), img = $(".rv-page img", rv), loading = $(".rv-page .loading", rv);
    function drawToc() {
      const rows = onlyMine ? opts.secs.map((s) => ({ l: s.l, t: s.t, num: s.num, p: s.p })) : (R.outline[0] && R.outline[0].p > 1 ? [{ l: R.outline[0].l, t: "Bìa, phân công, mục lục", num: "", p: 1 }].concat(R.outline) : R.outline);
      const minL = Math.min(...rows.map((r) => r.l));
      ol.innerHTML = rows.map((e, k) => {
        const w = whoOf(e.t);
        const dot = w && !onlyMine ? `<span class="who" style="--k:${team[w].color}" aria-hidden="true"></span>` : "";
        const lab = R.labels[e.p - 1] || "";
        return `<li class="l${e.l - minL + 1}"><button type="button" data-p="${e.p}" data-k="${k}"><span>${esc(e.t)}${dot}</span><span class="pg">${esc(lab)}</span></button></li>`;
      }).join("") + (opts.secs && opts.secs.length ? `<li><button type="button" class="pill small rv-all" data-all>${onlyMine ? "Xem mục lục cả báo cáo" : "Chỉ mục của em"}</button></li>` : "");
      sel.innerHTML = rows.map((e) => `<option value="${e.p}">${"· ".repeat(Math.max(0, e.l - minL))}${esc(e.t)} · tr. ${esc(R.labels[e.p - 1] || "")}</option>`).join("") +
        (opts.secs && opts.secs.length ? `<option value="all">${onlyMine ? "→ Xem mục lục cả báo cáo" : "→ Chỉ mục của em"}</option>` : "");
      mark();
    }
    function secAt(p) {
      let best = null;
      for (const e of R.outline) { if (e.p <= p && (!best || e.p >= best.p)) best = e; }
      return best;
    }
    function mark() {
      const cur = secAt(page);
      let curBtn = null;
      $$("button[data-p]", ol).forEach((b) => {
        const on = cur ? +b.dataset.p === cur.p && b.textContent.startsWith(cur.t) : +b.dataset.p === 1;
        b.setAttribute("aria-current", String(!!on));
        if (on) curBtn = b;
      });
      if (curBtn) { const toc = $(".rv-toc", rv); const r = curBtn.getBoundingClientRect(), tr = toc.getBoundingClientRect(); if (r.top < tr.top || r.bottom > tr.bottom) toc.scrollTop += r.top - tr.top - 80; }
      const opt = Array.from(sel.options).filter((o) => +o.value <= page).pop();
      if (opt) sel.value = opt.value;
    }
    let token = 0;
    function render() {
      const my = ++token;
      const lab = R.labels[page - 1];
      const cur = secAt(page);
      where.innerHTML = (lab ? `<b>tr. ${esc(lab)}</b> · ` : "") + `trang ${page} / ${R.n} của tệp` + (cur ? ` · ${esc(cur.num ? "§" + cur.num : cur.t)}` : "");
      $$("[data-r=prev]", rv).forEach((b) => { b.disabled = page <= 1; });
      $$("[data-r=next]", rv).forEach((b) => { b.disabled = page >= R.n; });
      loading.hidden = false;
      img.alt = `Báo cáo, trang ${lab || page}`;
      setImg(img, R.pages[page - 1]).then(() => { if (my === token) loading.hidden = true; }, () => { if (my === token) loading.textContent = "Không tải được trang."; });
      if (page < R.n) assetURL(R.pages[page]).catch(() => {});
      mark();
      if (opts.hash) { try { history.replaceState(history.state, "", "#trang-" + page); } catch (e) { /* ignore */ } }
    }
    function to(p) {
      page = Math.min(R.n, Math.max(1, p));
      render();
      const sc = rv.closest(".vw-body");
      const top = rv.getBoundingClientRect().top;
      if (sc) { const st = sc.getBoundingClientRect().top; if (top < st) sc.scrollTop += top - st; }
      else if (top < stickPx()) window.scrollTo({ top: window.scrollY + top - stickPx() - 8, behavior: "instant" });
    }
    rv.addEventListener("click", (ev) => {
      const b = ev.target.closest("button");
      if (!b) { if (ev.target.closest(".rv-page")) zoom(); return; }
      if (b.dataset.all !== undefined) { onlyMine = !onlyMine; drawToc(); return; }
      if (b.dataset.p) to(+b.dataset.p);
      else if (b.dataset.r === "prev") to(page - 1);
      else if (b.dataset.r === "next") to(page + 1);
      else if (b.dataset.r === "zoom") zoom();
    });
    sel.addEventListener("change", () => { if (sel.value === "all") { onlyMine = !onlyMine; drawToc(); sel.focus(); } else to(+sel.value); });
    function zoom() { Lightbox.open(R.pages.map((p, k) => ({ full: p, caption: `Báo cáo · tr. ${R.labels[k] || k + 1}` })), page - 1, (j) => { if (j + 1 !== page) { page = j + 1; render(); } }); }
    const pg = $(".rv-page", rv);
    let sw = null;
    pg.addEventListener("pointerdown", (ev) => { sw = { x: ev.clientX, y: ev.clientY, id: ev.pointerId }; });
    pg.addEventListener("pointerup", (ev) => {
      if (!sw || sw.id !== ev.pointerId) return;
      const dx = ev.clientX - sw.x, dy = ev.clientY - sw.y;
      sw = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) { ev.preventDefault(); to(page + (dx < 0 ? 1 : -1)); }
    });
    let onScreen = true;
    if ("IntersectionObserver" in window) new IntersectionObserver((e) => { onScreen = e[0].isIntersecting; }, { threshold: 0.1 }).observe(pg);
    const keyh = (ev) => {
      if (!rv.isConnected) { document.removeEventListener("keydown", keyh); return; }
      if (ev.defaultPrevented || typing(document.activeElement) || ev.altKey || ev.ctrlKey || ev.metaKey || !onScreen) return;
      if (!awake(rv)) return;
      if (ev.key === "ArrowRight") { ev.preventDefault(); to(page + 1); } else if (ev.key === "ArrowLeft") { ev.preventDefault(); to(page - 1); }
    };
    document.addEventListener("keydown", keyh);
    drawToc();
    render();
    return { to };
  }

  /* ================================================================ video: captions in a band under the picture, synced transcript */
  function parseVTT(text) {
    const sec = (t) => t.split(":").reverse().reduce((s, p, k) => s + parseFloat(p) * Math.pow(60, k), 0);
    const cues = [];
    for (const block of text.replace(/\r/g, "").replace(/^﻿/, "").split(/\n\s*\n/)) {
      const m = /([\d:.]+)\s+-->\s+([\d:.]+)[^\n]*\n([\s\S]+)/.exec(block);
      if (m) cues.push({ a: sec(m[1]), b: sec(m[2]), t: m[3].replace(/\n/g, " ").trim() });
    }
    return cues;
  }
  const norm = (s) => s.replace(/\u00a0/g, " ").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
  const CC_STEPS = [0.85, 1, 1.15, 1.3];
  /* V: the course video data; D: the deck (titles, posters); opts.mode "talk" (the whole talk, global timeline; full
     file on big screens, the clips one after another on phones) or "clips" (opts.clips: the member's clips, each with
     its own captions). opts.start: {slide} or {clip, t}; opts.autoplay starts at once. */
  function mountPlayer(box, V, D, opts = {}) {
    const team = opts.team || {};
    const talk = opts.mode !== "clips";
    const clips = V.clips || [];
    const own = talk ? [] : clips.filter((c) => (opts.clips || []).includes(c.id));
    const useClips = talk && clips.length > 0 && (narrow() || matchMedia("(pointer: coarse)").matches || (navigator.deviceMemory && navigator.deviceMemory <= 4));
    let active = talk ? null : own[0];
    let src = null, offset = 0, cues = [], pendingT = null, follow = true, userScroll = 0, cueIdx = -1;
    let ccOn = store.get("cmw-cc") !== "0";
    let ccStep = Math.min(CC_STEPS.length - 1, Math.max(0, parseInt(store.get("cmw-cc-size2") || "1", 10)));
    if (Number.isNaN(ccStep)) ccStep = 1;
    box.innerHTML = "";
    const pl = el("div", { class: "pl" });
    pl.innerHTML =
      '<div class="pl-main"><div class="pl-stage"><video playsinline preload="none" controls hidden></video>' +
      '<button class="pl-poster" type="button"><img alt=""><span class="pl-start"><span class="big">' + ICON.play + '</span><small></small></span></button>' +
      '<span class="pl-msg" hidden></span></div>' +
      '<div class="pl-cap" aria-hidden="true"><span></span></div>' +
      '<div class="pl-bar"><div class="pl-segs" role="group" aria-label="Đoạn"></div><span class="pl-note">Lồng tiếng bằng giọng đọc tổng hợp.</span><span class="grow"></span>' +
      `<span class="pl-ccs" role="group" aria-label="Phụ đề"><button class="pill pl-cc" type="button" aria-pressed="${ccOn}">Phụ đề</button>` +
      '<button class="pill" type="button" data-cc="-" aria-label="Chữ phụ đề nhỏ hơn">A−</button><span class="cc-size" aria-live="polite"></span>' +
      '<button class="pill" type="button" data-cc="+" aria-label="Chữ phụ đề lớn hơn">A+</button></span></div></div>' +
      '<aside class="pl-side" aria-label="Lời thoại"><div class="tr-head"><div class="tr-row"><span class="tr-k">Lời thoại</span>' +
      '<label class="tr-follow"><input type="checkbox" checked> Tự cuộn theo video</label></div>' +
      '<input class="tr-search" type="search" placeholder="Tìm trong lời thoại" aria-label="Tìm trong lời thoại" autocomplete="off">' +
      '<span class="tr-count" aria-live="polite"></span></div><ol class="tr-list"></ol></aside>';
    box.appendChild(pl);
    const video = $("video", pl), poster = $(".pl-poster", pl), msg = $(".pl-msg", pl), list = $(".tr-list", pl), search = $(".tr-search", pl),
      count = $(".tr-count", pl), segs = $(".pl-segs", pl), cc = $(".pl-cc", pl), followBox = $(".tr-follow input", pl), cap = $(".pl-cap", pl), capText = $(".pl-cap span", pl);
    const say = (t) => { msg.textContent = t; msg.hidden = !t; };
    const slideTitle = (n) => (D && D.slides[n - 1] ? D.slides[n - 1].t : "");
    const slideImg = (n) => (D && D.slides[n - 1] ? D.slides[n - 1].img : "");
    const clipOf = (t) => clips.find((c) => t >= c.start - 0.01 && t < c.end - 0.05) || clips.find((c) => c.start > t) || clips[clips.length - 1];

    // captions band: size and on/off remembered; the track is drawn by the browser only in full screen
    let capChars = 90, capKey = "";
    function capSize() {
      const base = narrow() ? 17 : 22;
      const px = Math.round(base * CC_STEPS[ccStep]);
      cap.style.setProperty("--cc", px + "px");
      cap.classList.toggle("off", !ccOn);
      const maxPx = Math.round(base * CC_STEPS[CC_STEPS.length - 1]);
      const band = ccOn ? Math.round(maxPx * 1.35 * 2 + 22) : 0;
      cap.style.height = ccOn ? band + "px" : "";
      const sz = $(".cc-size", pl);
      if (sz) sz.textContent = ccOn ? (ccStep === CC_STEPS.length - 1 ? "lớn nhất" : ccStep === 0 ? "nhỏ nhất" : Math.round(CC_STEPS[ccStep] * 100) + " %") : "";
      pl.style.setProperty("--capband", band + "px");
      const w = cap.clientWidth || pl.clientWidth || 600;
      capChars = Math.max(28, Math.floor((Math.min(w - 36, px * 0.55 * 46 / 0.55) / (px * 0.53)) * 2 * 0.92));
      capKey = "";
      $$("[data-cc]", pl).forEach((b) => {
        b.disabled = !ccOn || (b.dataset.cc === "-" ? ccStep === 0 : ccStep === CC_STEPS.length - 1);
        b.title = b.disabled && ccOn ? (b.dataset.cc === "-" ? "Chữ đã nhỏ nhất" : "Chữ đã lớn nhất") : "";
      });
    }
    const meas = el("span", { class: "cap-meas", "aria-hidden": "true" });
    cap.appendChild(meas);
    const chunkCache = new Map();
    function fits(text) {
      meas.textContent = text;
      const lh = parseFloat(getComputedStyle(meas).lineHeight) || 24;
      return meas.scrollHeight <= lh * 2 + 2 && meas.scrollWidth <= meas.clientWidth + 1;
    }
    function chunksOf(c) {
      const key = c.a + "|" + c.t + "|" + ccStep + "|" + cap.clientWidth;  // clips restart their times at 0: the text is part of the key
      if (chunkCache.has(key)) return chunkCache.get(key);
      const words = c.t.split(/\s+/).filter(Boolean);
      const parts = [];
      let curT = "";
      for (const w of words) {
        const next = curT ? curT + " " + w : w;
        if (curT && !fits(next)) { parts.push(curT); curT = w; } else curT = next;
      }
      if (curT) parts.push(curT);
      if (!parts.length) parts.push(c.t);
      const total = parts.reduce((s, p) => s + p.length, 0);
      let t0 = c.a;
      const out = parts.map((p) => { const d = (c.b - c.a) * (p.length / total); const o = { a: t0, b: t0 + d, t: p }; t0 += d; return o; });
      chunkCache.set(key, out);
      return out;
    }
    // for the caption check (qa): the cues, their parts, and one part drawn in the band
    pl.__capQA = { cues: () => cues, chunks: (c) => chunksOf(c), draw: (text) => { capKey = text; capText.textContent = text; }, step: (k) => { ccStep = k; capSize(); }, steps: CC_STEPS.length };
    function showCap(t) {
      if (!ccOn) return;
      const c = cueIdx >= 0 ? cues[cueIdx] : null;
      let text = "";
      if (c && t <= c.b + 0.25) { const ch = chunksOf(c); const x = ch.find((q) => t < q.b) || ch[ch.length - 1]; text = x.t; }
      if (text !== capKey) { capKey = text; capText.textContent = text; }
    }
    function trackMode() {
      const fs = document.fullscreenElement === video || (document.fullscreenElement && document.fullscreenElement.contains(video)) || video.webkitDisplayingFullscreen;
      for (const tr of video.textTracks) tr.mode = ccOn && fs ? "showing" : "hidden";
    }
    document.addEventListener("fullscreenchange", trackMode);
    video.addEventListener("webkitbeginfullscreen", () => { for (const tr of video.textTracks) tr.mode = ccOn ? "showing" : "hidden"; });
    video.addEventListener("webkitendfullscreen", trackMode);
    cc.addEventListener("click", () => { ccOn = !ccOn; cc.setAttribute("aria-pressed", String(ccOn)); store.set("cmw-cc", ccOn ? "1" : "0"); capSize(); trackMode(); capKey = "~"; showCap(offset + video.currentTime); });
    $$("[data-cc]", pl).forEach((b) => b.addEventListener("click", () => {
      ccStep = Math.min(CC_STEPS.length - 1, Math.max(0, ccStep + (b.dataset.cc === "+" ? 1 : -1)));
      store.set("cmw-cc-size2", String(ccStep));
      capSize();
      showCap(offset + video.currentTime);
    }));
    if ("ResizeObserver" in window) new ResizeObserver(() => capSize()).observe(cap);
    capSize();

    // segments: the parts of the talk (jumps) or the member's clips (switch)
    const segList = talk ? clips : own;
    if (segList.length > 1 || talk) {
      segs.innerHTML = segList.map((c) => {
        const col = c.who && team[c.who] ? ` style="--k:${team[c.who].color}"` : "";
        const label = c.title.replace(/\s*\(.*\)\s*$/, "").replace(/ · .*$/, (m) => (c.who && team[c.who] ? " · " + team[c.who].short : m));
        return `<button class="pl-seg" type="button" data-seg="${esc(c.id)}" aria-pressed="false"${col}><i></i>${esc(label)}<small>${mmss(c.end - c.start)}</small></button>`;
      }).join("");
    }
    function setPoster(n, label) {
      const p = $("img", poster);
      if (slideImg(n)) setImg(p, slideImg(n)).catch(() => {});
      $("small", poster).textContent = label;
    }
    function posterLabel() {
      if (talk) {
        const t = pendingT || 0;
        const head = t > 1 ? "Phát từ " + mmss(t) : "Phát cả bài · " + mmss(V.full.dur);
        return head + (useClips ? " · tải theo từng đoạn" : " · " + mb(V.full.size));
      }
      return "Phát · " + mmss(active.dur) + " · " + mb(active.size);
    }
    async function loadCues() {
      const path = talk ? V.full.vtt : active.vtt;
      const text = await assetText(path);
      cues = parseVTT(text);
      const chapters = talk ? V.chapters : active.chapters;
      const parts = talk && D ? D.parts : [];
      let ci = 0;
      const rows = [];
      cues.forEach((c, k) => {
        while (ci < chapters.length && chapters[ci].t <= c.a + 0.3) {
          const ch = chapters[ci];
          const p = parts.find((x) => ch.n >= x.from && ch.n <= x.to);
          const col = p && p.who && team[p.who] ? ` style="--k:${team[p.who].color}"` : "";
          rows.push(`<li class="tr-ch"${col} data-n="${ch.n}"><button type="button" data-t="${ch.t}"><span class="k" aria-hidden="true"></span><span class="t">Slide ${ch.n} · ${esc(slideTitle(ch.n))}</span><span class="tm">${mmss(ch.t)}</span></button></li>`);
          ci++;
        }
        rows.push(`<li><button class="tr-cue" type="button" data-i="${k}"><span class="tt">${mmss(c.a)}</span><span class="tx">${esc(c.t)}</span></button></li>`);
      });
      list.innerHTML = rows.join("");
      count.textContent = cues.length + " câu";
    }
    async function useSource(s) {
      if (src === s) return;
      src = s;
      say("Đang tải video" + (s.size ? " (" + mb(s.size) + ")" : "") + "…");
      const [u, vu] = await Promise.all([assetURL(s.mp4), assetURL(s.vtt)]);
      if (src !== s) return;
      $$("track", video).forEach((t) => t.remove());
      video.preload = "auto";
      video.src = u;
      video.appendChild(el("track", { kind: "captions", srclang: "vi", label: "Tiếng Việt", src: vu }));
      video.load();
      video.hidden = false;
      poster.hidden = true;
      await new Promise((res) => { if (video.readyState >= 1) res(); else video.addEventListener("loadedmetadata", res, { once: true }); });
      trackMode();
      say("");
    }
    async function seek(t, play = true) {
      try {
        if (talk) {
          if (useClips) { const c = clipOf(t); await useSource(c); offset = c.start; video.currentTime = Math.max(0, t - c.start); }
          else { await useSource(V.full); offset = 0; video.currentTime = Math.max(0, t); }
        } else { await useSource(active); offset = 0; video.currentTime = Math.max(0, t); }
        if (play) { Narr.pause(); video.play().catch(() => say("Bấm nút phát trên video để nghe.")); setTimeout(() => say(""), 2500); }
      } catch (e) { say("Không tải được video. Thử lại, hoặc tải tệp ở trang Tải về."); src = null; }
      highlight(t, true);
    }
    function highlight(t, force) {
      let k = -1, lo = 0, hi = cues.length - 1;
      while (lo <= hi) { const m = (lo + hi) >> 1; if (cues[m].a <= t + 0.05) { k = m; lo = m + 1; } else hi = m - 1; }
      if (k !== cueIdx || force) {
        const prev = cueIdx >= 0 ? $(`.tr-cue[data-i="${cueIdx}"]`, list) : null;
        if (prev) prev.classList.remove("on");
        cueIdx = k;
        const cur = k >= 0 ? $(`.tr-cue[data-i="${k}"]`, list) : null;
        if (cur) {
          cur.classList.add("on");
          if (follow && Date.now() - userScroll > 4000 && !search.value) {
            const r = cur.getBoundingClientRect(), lr = list.getBoundingClientRect();
            if (r.top < lr.top + 40 || r.bottom > lr.bottom - 40) list.scrollTo({ top: list.scrollTop + r.top - lr.top - lr.height / 3, behavior: reduceMotion ? "auto" : "smooth" });
          }
        }
        if (talk) { const c = clipOf(t); $$(".pl-seg", segs).forEach((b) => b.setAttribute("aria-pressed", String(c && b.dataset.seg === c.id))); }
      }
      showCap(t);
    }
    pl.tabIndex = -1;
    const takeKeys = () => setTimeout(() => { if (document.activeElement === video) pl.focus({ preventScroll: true }); }, 0);
    ["pointerup", "play", "pause", "seeked", "volumechange", "ratechange"].forEach((e) => video.addEventListener(e, takeKeys));
    pl.addEventListener("keydown", (ev) => {
      if (ev.target !== pl || ev.altKey || ev.ctrlKey || ev.metaKey || video.hidden) return;
      const k = ev.key;
      if (k === " " || k === "k" || k === "K") { ev.preventDefault(); if (video.paused) video.play().catch(() => {}); else video.pause(); }
      else if (k === "ArrowRight") { ev.preventDefault(); video.currentTime = Math.min(video.duration || 0, video.currentTime + 5); }
      else if (k === "ArrowLeft") { ev.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 5); }
      else if (k === "m" || k === "M") { ev.preventDefault(); video.muted = !video.muted; }
    });
    video.addEventListener("timeupdate", () => highlight(offset + video.currentTime));
    video.addEventListener("seeked", () => highlight(offset + video.currentTime, true));
    video.addEventListener("ended", () => {
      if (talk && useClips && src) { const k = clips.indexOf(src); if (k >= 0 && k < clips.length - 1) seek(clips[k + 1].start + 0.01); }
    });
    ["wheel", "touchmove", "pointerdown"].forEach((e) => list.addEventListener(e, () => { userScroll = Date.now(); }, { passive: true }));
    followBox.addEventListener("change", () => { follow = followBox.checked; if (follow) { userScroll = 0; highlight(offset + video.currentTime, true); } });
    list.addEventListener("click", (ev) => {
      const b = ev.target.closest("button");
      if (!b) return;
      userScroll = 0;
      if (b.dataset.i !== undefined) seek(cues[+b.dataset.i].a + 0.02);
      else if (b.dataset.t !== undefined) seek(+b.dataset.t + 0.02);
    });
    poster.addEventListener("click", () => seek(pendingT || 0));
    segs.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-seg]");
      if (!b) return;
      const c = clips.find((x) => x.id === b.dataset.seg);
      if (talk) seek(c.start + 0.02);
      else if (c !== active) switchClip(c, 0, true);
    });
    async function switchClip(c, t, play) {
      active = c;
      src = null;
      video.pause();
      $$(".pl-seg", segs).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.seg === c.id)));
      cueIdx = -1;
      await loadCues();
      if (play) seek(t); else { pendingT = t; video.hidden = true; poster.hidden = false; setPoster((c.slides || [1])[0], posterLabel()); highlight(t, true); }
    }
    search.addEventListener("input", () => {
      const q = norm(search.value.trim());
      let hits = 0;
      $$("li", list).forEach((li) => {
        const b = $(".tr-cue", li);
        if (!b) { li.hidden = !!q; return; }
        const tx = $(".tx", b);
        const c = cues[+b.dataset.i];
        if (!q) { li.hidden = false; tx.textContent = c.t; return; }
        const n = norm(c.t);
        const at = n.indexOf(q);
        li.hidden = at < 0;
        if (at >= 0) { hits++; tx.innerHTML = esc(c.t.slice(0, at)) + "<mark>" + esc(c.t.slice(at, at + q.length)) + "</mark>" + esc(c.t.slice(at + q.length)); }
      });
      count.textContent = q ? (hits ? hits + " câu khớp" : "Không có câu nào khớp") : cues.length + " câu";
    });
    (async () => {
      try {
        if (talk) {
          await loadCues();
          const n = opts.start && opts.start.slide;
          const ch = n ? V.chapters.find((c) => c.n === n) : null;
          pendingT = ch ? ch.t + 0.02 : 0;
          setPoster(n || 1, posterLabel());
          highlight(pendingT, true);
          if (ch) { const h = $(`.tr-ch[data-n="${n}"]`, list); if (h) list.scrollTop = h.offsetTop - list.offsetTop - 8; }
          if (opts.autoplay) seek(pendingT);
        } else if (active) {
          const st = opts.start || {};
          const c = own.find((x) => x.id === st.clip) || active;
          await switchClip(c, st.t || 0, !!st.play);
        }
      } catch (e) { list.innerHTML = '<li class="tr-empty">Không tải được lời thoại.</li>'; }
    })();
    return { seek, el: pl, video };
  }

  /* ================================================================ overlay viewer (a stack: a video opened from a slide sits on top) */
  // a course's name in a layer title: the long one, the short one on phones
  const courseTag = (C) => (C.short && C.short !== C.tab ? `<span class="long">${esc(C.tab)}</span><span class="short">${esc(C.short)}</span>` : esc(C.tab));
  // the text of a label as a screen reader should hear it: the long form only, decorations left out
  function plainLabel(node) {
    const c = node.cloneNode(true);
    $$(".short, [aria-hidden='true'], .sr-skip", c).forEach((x) => x.remove());
    $$(".sep", c).forEach((x) => { x.textContent = " · "; });
    return c.textContent.replace(/\u00a0/g, " ").replace(/\s+/g, " ").replace(/\s·\s·\s/g, " · ").trim();
  }
  const Viewer = (() => {
    function open(kind, titleHTML, fill) {
      const root = el("div", { class: "vw", role: "dialog", "aria-modal": "true", "data-kind": kind });
      root.innerHTML = '<div class="vw-bar"><span class="vw-title"></span><span class="vw-acts"><span class="vw-extra"></span>' +
        '<button class="pill vw-close" type="button" data-vw-close>Đóng<span class="keys-only"> · Esc</span></button></span></div>' +
        '<div class="vw-body"><p class="mount-wait">Đang mở…</p></div>';
      $(".vw-title", root).innerHTML = titleHTML;
      root.setAttribute("aria-label", plainLabel($(".vw-title", root)));
      document.body.appendChild(root);
      const body = $(".vw-body", root), acts = $(".vw-extra", root);
      root.addEventListener("click", (ev) => { if (ev.target.closest("[data-vw-close]")) Layers.back(); });
      $$(".tile[data-open]").forEach((t) => t.classList.toggle("on", t.dataset.open === kind));
      Layers.open({ el: root, z: 60, close: () => { $$("video", root).forEach((v) => v.pause()); Narr.stopIn(root); root.remove(); if (!$(".vw")) $$(".tile.on").forEach((t) => t.classList.remove("on")); } });
      $("[data-vw-close]", root).focus();
      Promise.resolve(fill(body, acts)).catch(() => { body.innerHTML = '<p class="notice">Không mở được. Tải lại trang rồi thử lại.</p>'; }).finally(() => watchImages(body));
      return root;
    }
    return { open };
  })();

  /* ================================================================ references and the kit's "Mở ngay" */
  const KIT = CFG.kit || null;
  const kitScript = (n) => {
    const card = document.getElementById("loi-slide-" + n);
    const sc = card && $(".sp-script", card);
    return sc ? sc.cloneNode(true) : null;
  };
  async function openSlides(cid, n, onlyOwn) {
    const C = await courseData(cid);
    const D = C.deck;
    const kitHere = KIT && KIT.course === cid;
    const only = onlyOwn && kitHere ? KIT.slides : null;
    const ownSet = new Set(kitHere ? KIT.slides : []);
    const clipStarts = {};
    if (kitHere) for (const c of (C.video.clips || []).filter((x) => KIT.clips.includes(x.id))) for (const ch of c.chapters) clipStarts[ch.n] = { clip: c.id, t: ch.t };
    const chapterAt = (k) => (C.video.ready ? (C.video.chapters || []).find((x) => x.n === k) : null);
    Viewer.open("slide", `<b>${courseTag(C)}</b> · Slide và lời nói`, (body) => {
      mountDeck(body, D, {
        only, start: n, team: C.team, overlay: true, cid, narration: C.narration || {},
        scriptFor: (k) => (ownSet.has(k) ? kitScript(k) : null),
        onVideo: (k, test) => { if (!clipStarts[k] && !chapterAt(k)) return false; if (!test) { if (clipStarts[k]) openVideo(cid, clipStarts[k]); else openTalk(cid, k); } return true; },
        videoAt: (k) => (clipStarts[k] ? mmss(clipStarts[k].t) : (chapterAt(k) ? mmss(chapterAt(k).t) : "")),
      });
    });
  }
  async function openReport(cid, page, mine) {
    const C = await courseData(cid);
    const kitHere = KIT && KIT.course === cid && KIT.report;
    Viewer.open("report", `<b>${courseTag(C)}</b> · ${esc(C.report.name)}`, (body, acts) => {
      mountReport(body, C.report, { start: page || (kitHere ? KIT.report.from : 1), secs: mine && kitHere ? KIT.report.secs : null, team: C.team });
      const a = el("a", { class: "pill opt", href: ROOT + C.report.pdf, "data-asset": C.report.pdf, download: C.report.pdf.split("/").pop() }, ICON.down + '<span class="dl-label">Tải PDF</span>');
      acts.appendChild(a);
    });
  }
  async function openVideo(cid, start) {
    const C = await courseData(cid);
    if (!C.video.ready) return;
    Viewer.open("video", `<b>${courseTag(C)}</b> · Đoạn video của em`, (body) => {
      mountPlayer(body, C.video, C.deck, { mode: "clips", clips: KIT ? KIT.clips : [], start: Object.assign({ play: true }, start || {}), team: C.team });
    });
  }
  async function openTalk(cid, n) {
    const C = await courseData(cid);
    if (!C.video.ready) return;
    Viewer.open("video", `<b>${courseTag(C)}</b> · Video thuyết trình, slide ${n}`, (body) => {
      mountPlayer(body, C.video, C.deck, { mode: "talk", start: { slide: n }, autoplay: true, team: C.team });
    });
  }
  function openClone(kind, sel, label) {
    const src = $(sel);
    if (!src) return;
    Viewer.open(kind, `<b>${esc(CFG.kitLabel || "")}</b> · ${esc(label)}`, (body) => {
      const box = el("div", { class: "vw-clone" });
      const c = src.cloneNode(true);
      $$("[id]", c).forEach((n) => n.removeAttribute("id"));
      c.removeAttribute("id");
      $$("details", c).forEach((d) => { d.open = true; });
      box.appendChild(c);
      body.innerHTML = "";
      body.appendChild(box);
    });
  }
  function openPane(kind) {
    if (!KIT) return;
    if (kind === "slide") openSlides(KIT.course, KIT.slides[0], true);
    else if (kind === "video") openVideo(KIT.course, {});
    else if (kind === "report") openReport(KIT.course, null, true);
    else if (kind === "code") openClone("code", "#ma-muc-luc", "Mã nguồn, các chỗ cần đọc");
    else if (kind === "demo") openClone("demo", "#demo", ($("#demo") || {}).dataset ? $("#demo").dataset.sec : "Demo");
    else if (kind === "tests") openClone("tests", "#chay-test .prose, #demo details[id*='test'] .prose", "Test của em");
  }
  document.addEventListener("click", (ev) => {
    const t = ev.target.closest(".tile[data-open], .meta-open[data-open]");
    if (t) { openPane(t.dataset.open); return; }
    const r = ev.target.closest("[data-ref]");
    if (!r || r.tagName === "A") return;
    ev.preventDefault();
    const kind = r.dataset.ref, cid = r.dataset.course;
    if (kind === "code") openCode(r);
    else if (kind === "evidence") openEvidence(r);
    else if (kind === "slide") openSlides(cid, +r.dataset.n, false);
    else if (kind === "report") openReport(cid, +r.dataset.page, false);
    else if (kind === "video") { if (r.dataset.clip) openVideo(cid, { clip: r.dataset.clip, t: +r.dataset.t }); else openTalk(cid, +r.dataset.n); }
  });
  document.addEventListener("keydown", (ev) => {
    if (!KIT || Layers.depth() || typing(document.activeElement) || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const k = { 1: "slide", 2: "video", 3: "report", 4: "code", 5: "demo", 6: "tests" }[ev.key];
    if (!k || !$(`.tile[data-open="${k}"]`)) return;
    ev.preventDefault();
    openPane(k);
  });

  /* ================================================================ mounts on the course pages */
  $$(".mount[data-mount]").forEach(async (m) => {
    const cid = m.dataset.course;
    try {
      const C = await courseData(cid);
      const hash = location.hash;
      if (m.dataset.mount === "slides") {
        const n = /^#slide-(\d+)$/.exec(hash);
        const chapterAt = (k) => (C.video.ready ? (C.video.chapters || []).find((x) => x.n === k) : null);
        mountDeck(m, C.deck, { start: n ? +n[1] : 1, team: C.team, hash: true, cid, narration: C.narration || {},
          onVideo: (k, test) => { if (!chapterAt(k)) return false; if (!test) openTalk(cid, k); return true; },
          videoAt: (k) => (chapterAt(k) ? mmss(chapterAt(k).t) : "") });
      } else if (m.dataset.mount === "report") {
        const n = /^#trang-(\d+)$/.exec(hash);
        mountReport(m, C.report, { start: n ? +n[1] : 1, team: C.team, hash: true });
      } else if (m.dataset.mount === "video") {
        const n = /^#slide-(\d+)$/.exec(hash);
        mountPlayer(m, C.video, C.deck, { mode: "talk", start: n ? { slide: +n[1] } : null, team: C.team });
      }
      watchImages(m);
    } catch (e) { m.innerHTML = '<p class="notice">Không mở được trình xem. Tải lại trang.</p>'; }
  });

  /* ================================================================ kit: checklist, timer, questions, last kit */
  $$(".check[data-check]").forEach((ul) => {
    const key = "cmw-check-" + ul.dataset.check;
    let saved = {};
    try { saved = JSON.parse(store.get(key) || "{}") || {}; } catch (e) { saved = {}; }
    const boxes = $$("input[type=checkbox]", ul);
    const sec = ul.closest("section");
    const prog = sec && $("[data-progress]", sec);
    const count = () => { if (prog) prog.textContent = boxes.filter((b) => b.checked).length + " / " + boxes.length; };
    boxes.forEach((b) => {
      b.checked = !!saved[b.dataset.h];
      b.addEventListener("change", () => { if (b.checked) saved[b.dataset.h] = 1; else delete saved[b.dataset.h]; store.set(key, JSON.stringify(saved)); count(); });
    });
    const reset = sec && $("[data-check-reset]", sec);
    if (reset) reset.addEventListener("click", () => { boxes.forEach((b) => { b.checked = false; }); saved = {}; store.del(key); count(); });
    count();
  });
  $$("[data-timer]").forEach((b) => {
    const lab = $("[data-timer-label]", b);
    let t0 = 0, iv = 0;
    b.addEventListener("click", () => {
      if (iv) { clearInterval(iv); iv = 0; b.removeAttribute("data-run"); lab.textContent = "Lần trước: " + mmss((Date.now() - t0) / 1000) + " · bấm để tập lại"; return; }
      t0 = Date.now();
      b.setAttribute("data-run", "");
      b.removeAttribute("data-over");
      const tick = () => { const s = (Date.now() - t0) / 1000; lab.textContent = mmss(s) + (s >= 60 ? " · quá một phút" : " · bấm để dừng"); if (s >= 60) b.setAttribute("data-over", ""); };
      tick();
      iv = setInterval(tick, 250);
    });
  });
  $$("#hoi-dap").forEach((sec) => {
    const qs = $$("details.q", sec);
    const input = $("[data-qa-search]", sec), go = $("[data-qa-go]", sec), countEl = $("[data-qa-count]", sec), empty = $("[data-qa-empty]", sec);
    let level = "";
    const text = new Map(qs.map((q) => [q, norm(q.textContent)]));
    function apply() {
      const q = norm((input && input.value.trim()) || "");
      let n = 0;
      qs.forEach((d) => {
        const ok = (!level || d.dataset.level === level) && (!q || text.get(d).includes(q));
        d.hidden = !ok;
        if (ok) n++;
        if (q.length >= 2 && ok) d.open = true;
      });
      if (countEl) countEl.textContent = n === qs.length ? qs.length + " câu" : n + " / " + qs.length + " câu";
      if (empty) empty.hidden = n > 0;
    }
    if (input) input.addEventListener("input", apply);
    $$(".qa-levels .chip", sec).forEach((c) => c.addEventListener("click", () => {
      level = c.dataset.level;
      $$(".qa-levels .chip", sec).forEach((x) => x.setAttribute("aria-pressed", String(x === c)));
      apply();
    }));
    $$("[data-qa]", sec).forEach((b) => b.addEventListener("click", () => qs.forEach((d) => { if (!d.hidden) d.open = b.dataset.qa === "open"; })));
    const jump = (d) => { d.hidden = false; d.open = true; d.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" }); };
    if (go) go.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      ev.preventDefault();  // the key's default action would reach the question once the focus moves there and close it again
      const d = document.getElementById("cau-" + parseInt(go.value, 10));
      if (d) { jump(d); $("summary", d).focus({ preventScroll: true }); }
    });
    if (go) go.addEventListener("change", () => {  // a phone keyboard's "Xong" without Enter
      const d = document.getElementById("cau-" + parseInt(go.value, 10));
      if (d && !d.open) jump(d);
    });
  });
  if (KIT) {
    store.set("cmw-last-kit", JSON.stringify({ href: CFG.selfPath || "", label: CFG.kitLabel || document.title.split(" · ")[0], who: KIT.member, course: KIT.course,
      color: getComputedStyle(document.body).getPropertyValue("--me").trim() }));
  }

  /* ================================================================ home: "Bạn là ai?" remembered, the 3-D atrium */
  {
    const resume = $("[data-resume]");
    let last = null;
    try { last = JSON.parse(store.get("cmw-last-kit") || "null"); } catch (e) { last = null; }
    if (resume && last && last.href) {
      resume.innerHTML = `<a href="${esc(ROOT + last.href)}" style="--k:${esc(last.color || "")}"><i aria-hidden="true"></i>Tiếp tục: ${esc(last.label)}<span aria-hidden="true">→</span></a><small>lần trước bạn mở trên thiết bị này</small>`;
      resume.hidden = false;
      $$(`[data-person="${last.who}"]`).forEach((card) => {
        card.classList.add("picked");
        // the marker never sits beside a name: its own line in the row, the line under the name in the card
        const you = $("[data-you]", card);
        if (you) you.textContent = "Bạn";

        const b = $(`a[data-pick="${last.course}"]`, card);
        if (b) b.classList.add("last");
      });
    }
    document.addEventListener("click", (ev) => { const p = ev.target.closest("a[data-who]"); if (p) store.set("cmw-who", p.dataset.who); });
  }
  const stage = $(".stage3d");
  const mv = $("#atrium");
  if (stage && mv) {
    if (reduceMotion) mv.removeAttribute("auto-rotate");
    const poster = $(".poster", stage);
    if (window.customElements && "WebGL2RenderingContext" in window) {
      customElements.whenDefined("model-viewer").then(async () => {
        customElements.get("model-viewer").meshoptDecoderLocation = ROOT + "assets/js/meshopt_decoder-0.25.0.js";
        if (reduceMotion) { mv.removeAttribute("auto-rotate"); mv.autoRotate = false; }
        mv.addEventListener("load", () => { if (poster) poster.classList.add("gone"); if (reduceMotion) mv.autoRotate = false; }, { once: true });
        mv.src = await assetURL(stage.dataset.model);
      }).catch(() => {});
    }
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([e]) => { if (!reduceMotion) { if (e.isIntersecting) mv.setAttribute("auto-rotate", ""); else mv.removeAttribute("auto-rotate"); } }).observe(stage);
    }
  }

  /* ================================================================ never lose the place: links in layers, the way back, scroll memory */
  let hashMoves = 0;
  addEventListener("hashchange", () => { hashMoves++; openTarget(); });
  document.addEventListener("click", (ev) => {
    const a = ev.target.closest("a[href]");
    if (!a || ev.defaultPrevented || ev.button || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    if (a.target === "_blank" || a.hasAttribute("download") || a.dataset.asset) return;
    let url;
    try { url = new URL(a.getAttribute("href"), location.href); } catch (e) { return; }
    if (url.origin !== location.origin) return;
    const samePage = url.pathname === location.pathname;
    if (!samePage && !a.hasAttribute("data-back-link")) {
      const s = secs[curSec];
      const long = CFG.backLabel || CFG.pageLabel || document.title.split(" · ")[0];
      store.set("cmw-back", JSON.stringify({ to: url.pathname, from: location.pathname + location.search, y: window.scrollY,
        label: long, short: CFG.backShort || long, tiny: CFG.backTiny || CFG.backShort || long, sec: s ? s.dataset.sec : "", t: Date.now() }), "sessionStorage");
    }
    if (inLayer(a) && Layers.depth()) {
      ev.preventDefault();
      Layers.closeAll(() => { if (samePage && url.hash) location.hash = url.hash; else location.href = url.href; });
    }
  });
  {
    const bar = $("[data-ann-bl]");
    let rec = null;
    try { rec = JSON.parse(store.get("cmw-back", "sessionStorage") || "null"); } catch (e) { rec = null; }
    if (bar && rec && rec.to === location.pathname && Date.now() - rec.t < 6 * 3600 * 1000) {
      store.del("cmw-back", "sessionStorage");
      // the long label on desktops, the short one on phones ("Quay lại · Hùng Anh (App)"); one accessible name
      const short = rec.short || rec.label;
      bar.innerHTML = `<a class="back" href="${esc(rec.from)}" data-back-link aria-label="Quay lại: ${esc(rec.label)}" title="${esc(rec.label + (rec.sec ? " · " + rec.sec : ""))}">` +
        `<b aria-hidden="true">←</b><span class="long">Quay lại: ${esc(rec.label)}</span><span class="short">Quay lại · ${esc(short)}</span></a>`;
      // never cut: when the short wording does not fit beside the counter, a shorter one
      const fit = () => {
        const s = $(".back .short", bar);
        if (!s || !s.getClientRects().length) return;
        const words = [`Quay lại · ${short}`, `Quay lại · ${rec.tiny || short}`, rec.tiny || short];
        for (const wd of words) { s.textContent = wd; if (bar.scrollWidth <= bar.clientWidth + 1) break; }
      };
      fit();
      addEventListener("resize", fit);
      $("a", bar).addEventListener("click", (ev) => {
        ev.preventDefault();
        store.set("cmw-restore", JSON.stringify({ path: rec.from.split("?")[0], y: rec.y }), "sessionStorage");
        if (!hashMoves && history.length > 1) {
          const here = location.href;
          history.back();
          setTimeout(() => { if (location.href === here) location.href = rec.from; }, 700);
        } else location.href = rec.from;
      });
    }
  }
  /* phones: no bottom bar when it would be empty (one section, no way back) */
  html.classList.toggle("no-bbar", !!($(".ann-br.single") || !$(".ann-br")) && !$("[data-ann-bl] .back"));

  function restoreTo(y) {
    const go = () => window.scrollTo({ top: y, behavior: "instant" });
    go();
    requestAnimationFrame(go);
    setTimeout(go, 250);
    setTimeout(go, 700);
  }
  {
    let restore = null;
    try { restore = JSON.parse(store.get("cmw-restore", "sessionStorage") || "null"); } catch (e) { restore = null; }
    const nav = (performance.getEntriesByType && performance.getEntriesByType("navigation")[0]) || {};
    if (restore && restore.path === location.pathname) { store.del("cmw-restore", "sessionStorage"); restoreTo(restore.y); }
    else if (nav.type === "back_forward" || nav.type === "reload") {
      const y = parseFloat(store.get("cmw-y:" + location.pathname, "sessionStorage") || "");
      if (y > 0 && !location.hash) restoreTo(y);
    }
    addEventListener("pagehide", () => store.set("cmw-y:" + location.pathname, String(Layers.depth() ? window.scrollY : window.scrollY), "sessionStorage"));
    addEventListener("pageshow", (ev) => { if (ev.persisted) store.del("cmw-restore", "sessionStorage"); });
  }

  /* ================================================================ hash targets (the published page is written with document.write) */
  function openTarget() {
    if (!location.hash || /^#(slide|trang)-/.test(location.hash)) return;
    let target = null;
    try { target = document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch (e) { target = null; }
    if (!target) return;
    for (let d = target.closest("details"); d; d = d.parentElement && d.parentElement.closest("details")) d.open = true;
    if (target.tagName === "DETAILS") target.open = true;
    if (target.hidden) target.hidden = false;
    return target;
  }
  {
    const t = openTarget();
    if (t) requestAnimationFrame(() => t.scrollIntoView());
  }
})();
