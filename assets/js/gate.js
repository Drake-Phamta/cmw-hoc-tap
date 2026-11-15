/* Password gate of every published page. The page itself is in #cmw-payload: "CMW1" + 12-byte IV + AES-256-GCM
   ciphertext, base64. The key is PBKDF2-SHA256(password, salt, 400 000 iterations); after one successful entry the
   derived key (never the password) is kept in sessionStorage, and in localStorage when "Ghi nhớ" is ticked, so the
   other pages open without asking again. */
(() => {
  "use strict";
  const KEY = "cmw-hub-key";
  const cfg = JSON.parse(document.getElementById("cmw-key").textContent);
  const payload = document.getElementById("cmw-payload").textContent.trim();
  const gate = document.getElementById("gate");
  const form = document.getElementById("gate-form");
  const pw = document.getElementById("gate-pw");
  const keep = document.getElementById("gate-keep");
  const btn = document.getElementById("gate-btn");
  const err = document.getElementById("gate-err");

  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const toB64 = (u) => { let s = ""; for (const b of u) s += String.fromCharCode(b); return btoa(s); };
  const read = (store) => { try { return store.getItem(KEY); } catch (e) { return null; } };
  const write = (store, v) => { try { store.setItem(KEY, v); } catch (e) { /* storage blocked: ask again next page */ } };
  const forget = () => { for (const s of [sessionStorage, localStorage]) { try { s.removeItem(KEY); } catch (e) { /* ignore */ } } };

  async function openPage(raw) {
    const bytes = fromB64(payload);
    if (bytes[0] !== 67 || bytes[1] !== 77 || bytes[2] !== 87 || bytes[3] !== 49) throw new Error("bad payload");
    const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.subarray(4, 16) }, key, bytes.subarray(16));
    return new TextDecoder().decode(plain);
  }

  // Replace this gate with the decrypted page. Only once the gate itself has finished parsing: while the parser
  // still runs, Chrome ignores document.open() and document.write() would insert the page into the gate instead.
  function show(html, raw) {
    const write = () => {
      window.__cmwKey = raw;
      document.open();
      document.write(html);
      document.close();
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => setTimeout(write, 0), { once: true });
    } else {
      write();
    }
  }

  async function derive(password) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: fromB64(cfg.salt), iterations: cfg.iter }, base, 256);
    return new Uint8Array(bits);
  }

  function showForm(message) {
    gate.hidden = false;
    if (message) err.textContent = message;
    pw.focus();
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    err.textContent = "";
    btn.disabled = true;
    btn.textContent = "Đang mở…";
    try {
      const raw = await derive(pw.value);
      const html = await openPage(raw);
      const b64 = toB64(raw);
      write(sessionStorage, b64);
      if (keep.checked) write(localStorage, b64);
      show(html, raw);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = "Mở";
      err.textContent = "Mật khẩu chưa đúng.";
      pw.select();
    }
  });

  (async () => {
    if (!window.crypto || !crypto.subtle) {
      showForm("Trình duyệt này không giải mã được trang (cần mở qua https).");
      btn.disabled = true;
      return;
    }
    const saved = read(sessionStorage) || read(localStorage);
    if (saved) {
      try {
        const raw = fromB64(saved);
        const html = await openPage(raw);
        write(sessionStorage, saved);
        show(html, raw);
        return;
      } catch (e) {
        forget();
      }
    }
    showForm();
  })();
})();
