/* DigitBot as an installed app: offline cache + "📲 Install app" button.
   Chrome/Edge: the real install prompt when the browser offers it. Otherwise (Firefox, Samsung Internet, iPhone,
   or Chrome before it is ready) the button shows the exact steps for that browser. */
(function () {
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
  const ua = navigator.userAgent;
  const inApp = /DigitBotApp\//.test(ua) && !!window.DigitBotAndroid;      // inside the DigitBot Android app
  const standalone = inApp || matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: window-controls-overlay)").matches || navigator.standalone === true;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua), mobile = android || ios;
  const browser = /SamsungBrowser/.test(ua) ? "samsung" : /Firefox|FxiOS/.test(ua) ? "firefox" : /Edg\//.test(ua) ? "edge"
    : /OPR\/|Opera/.test(ua) ? "opera" : /FBAN|FBAV|Instagram|Line\/|wv\)/.test(ua) ? "inapp" : /CriOS/.test(ua) ? "chrome-ios"
    : /Chrome/.test(ua) ? "chrome" : /Safari/.test(ua) ? "safari" : "other";
  let deferred = null;

  function steps() {
    if (ios && browser !== "safari") return "On iPhone/iPad, open this page in <b>Safari</b>, tap <b>Share</b> (square with arrow), then <b>Add to Home Screen</b>.";
    if (ios) return "Tap <b>Share</b> (square with arrow) at the bottom of Safari, scroll down, tap <b>Add to Home Screen</b>, then <b>Add</b>.";
    if (browser === "inapp") return "You're in an app's built-in browser. Tap <b>⋮</b> / <b>…</b> and choose <b>Open in Chrome</b> (or your browser), then press Install again.";
    if (browser === "samsung") return "Tap the menu <b>≡</b> at the bottom, then <b>Add page to</b> → <b>Home screen</b>.";
    if (browser === "firefox" && android) return "Tap the menu <b>⋮</b>, then <b>Install</b> (or <b>Add to Home screen</b>), then <b>Add</b>.";
    if (browser === "firefox") return "Firefox on a PC can't install web apps. Open this page in <b>Chrome</b> or <b>Edge</b> and press Install there (the MMG bot can stay in Firefox).";
    if (mobile) return "Tap the menu <b>⋮</b> at the top right, then <b>Install app</b> or <b>Add to Home screen</b>, then <b>Install</b>.";
    if (browser === "edge") return "Click the menu <b>…</b> at the top right → <b>Apps</b> → <b>Install this site as an app</b>.";
    return "Click the install icon at the right end of the address bar (a screen with a ↓ arrow), or menu <b>⋮</b> → <b>Cast, save and share</b> → <b>Install page as app</b>.";
  }
  window.dbInstall = { standalone, ios, android, inApp, browser, can: () => !!deferred, steps };
  document.documentElement.classList.toggle("in-app", inApp);
  document.documentElement.classList.toggle("is-ios", ios);
  document.documentElement.classList.toggle("is-android", android);
  if (inApp) document.addEventListener("click", e => {        // in the app, "MMG" links open the game tab (bot built in)
    const a = e.target.closest && e.target.closest('a[href="mmg.html"],a[href$="/mmg.html"]');
    if (a) { e.preventDefault(); window.DigitBotAndroid.openMmg(); }
  }, true);

  function setStatus(t) { document.querySelectorAll("[data-install-status]").forEach(e => e.innerHTML = t); }
  function show() {
    const box = document.querySelectorAll("[data-install-box]");
    if (standalone) { box.forEach(b => b.style.display = "none"); return; }
    document.querySelectorAll("[data-install]").forEach(b => b.style.display = "");
    setStatus(deferred ? "Tap the button - DigitBot gets its own icon and opens full screen like a normal app." : steps());
    if (!box.length && !document.querySelector("button[data-install]") && localStorage.getItem("dbInstallHide") !== "1" && !document.getElementById("dbInstallPill")) {
      const p = document.createElement("div"); p.id = "dbInstallPill";
      p.style.cssText = "position:fixed;left:10px;bottom:10px;z-index:99999;background:#0ea5b7;color:#fff;border-radius:999px;padding:8px 12px;font:600 14px system-ui;box-shadow:0 4px 14px rgba(0,0,0,.35);display:flex;gap:10px;align-items:center;cursor:pointer";
      p.innerHTML = "<span>📲 Install app</span><span title='hide' style='opacity:.8'>✕</span>";
      p.lastChild.onclick = ev => { ev.stopPropagation(); localStorage.setItem("dbInstallHide", "1"); p.remove(); };
      p.firstChild.onclick = install;
      document.body.appendChild(p);
    }
  }
  function sheet(html) {                       // steps pop-up for browsers without a direct install prompt
    let d = document.getElementById("dbInstallSheet"); if (d) d.remove();
    d = document.createElement("div"); d.id = "dbInstallSheet";
    d.style.cssText = "position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center";
    d.innerHTML = "<div style='background:#1e293b;color:#e2e8f0;border:1px solid #0ea5b7;border-radius:16px 16px 0 0;max-width:520px;width:100%;padding:18px 18px calc(18px + env(safe-area-inset-bottom));font:16px/1.5 system-ui'>"
      + "<div style='display:flex;gap:12px;align-items:center;margin-bottom:8px'><img src='icons/icon-192.png' width='44' height='44' style='border-radius:10px'><b style='color:#fff;font-size:1.15rem'>Install DigitBot</b></div>"
      + "<div>" + html + "</div><div style='color:#94a3b8;font-size:.85rem;margin-top:8px'>Then open DigitBot from your home screen / start menu.</div>"
      + "<button style='margin-top:14px;width:100%;min-height:46px;border:0;border-radius:12px;background:#0ea5b7;color:#fff;font:700 1rem system-ui'>OK</button></div>";
    d.onclick = e => { if (e.target === d || e.target.tagName === "BUTTON") d.remove(); };
    document.body.appendChild(d);
  }
  async function install() {
    if (deferred) {
      deferred.prompt();
      const r = await deferred.userChoice.catch(() => ({}));
      deferred = null;
      setStatus(r.outcome === "accepted" ? "✅ Installed - open DigitBot from your home screen / start menu." : steps());
      if (r.outcome === "accepted") { const p = document.getElementById("dbInstallPill"); if (p) p.remove(); }
    } else sheet(steps());
  }
  window.dbInstall.install = install;
  addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; show(); });
  addEventListener("appinstalled", () => { deferred = null; setStatus("✅ Installed - open DigitBot from your home screen / start menu."); });
  document.addEventListener("click", e => { const t = e.target.closest && e.target.closest("button[data-install]"); if (t) install(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", show); else show();
})();
