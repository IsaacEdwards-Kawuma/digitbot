/* DigitBot as an installed app: offline cache + "📲 Install app" button (Chrome/Edge/Samsung) or
   "Add to Home Screen" steps (iPhone/iPad Safari). */
(function () {
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
  const standalone = matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: window-controls-overlay)").matches || navigator.standalone === true;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let deferred = null;
  window.dbInstall = { standalone, ios, can: () => !!deferred };

  function setStatus(t) { document.querySelectorAll("[data-install-status]").forEach(e => e.innerHTML = t); }
  function show() {
    const box = document.querySelectorAll("[data-install-box]");
    if (standalone) { box.forEach(b => b.style.display = "none"); return; }
    document.querySelectorAll("[data-install]").forEach(b => b.style.display = (deferred || ios) ? "" : "none");
    if (ios) setStatus("On iPhone/iPad: tap <b>Share</b> <span style='font-size:1.1em'>⎋</span> at the bottom of Safari, then <b>Add to Home Screen</b>.");
    else if (!deferred) setStatus("Chrome / Edge: open the browser menu <b>⋮</b> and tap <b>Install app</b> or <b>Add to Home screen</b>. "
      + "(If the button doesn't show, the app may already be installed - look for the DigitBot icon.)");
    else setStatus("Tap the button - DigitBot gets its own icon and opens full screen like a normal app.");
    // small pill on pages without the big box
    if (!box.length && (deferred || ios) && localStorage.getItem("dbInstallHide") !== "1" && !document.getElementById("dbInstallPill")) {
      const p = document.createElement("div"); p.id = "dbInstallPill";
      p.style.cssText = "position:fixed;left:10px;bottom:10px;z-index:99999;background:#0ea5b7;color:#fff;border-radius:999px;padding:8px 12px;font:600 14px system-ui;box-shadow:0 4px 14px rgba(0,0,0,.35);display:flex;gap:10px;align-items:center;cursor:pointer";
      p.innerHTML = "<span data-install>📲 Install app</span><span title='hide' style='opacity:.8'>✕</span>";
      p.lastChild.onclick = ev => { ev.stopPropagation(); localStorage.setItem("dbInstallHide", "1"); p.remove(); };
      p.firstChild.onclick = install;
      document.body.appendChild(p);
    }
  }
  async function install() {
    if (deferred) {
      deferred.prompt();
      const r = await deferred.userChoice.catch(() => ({}));
      deferred = null;
      setStatus(r.outcome === "accepted" ? "✅ Installed - open DigitBot from your home screen / start menu." : "Not installed. You can try again any time.");
      document.querySelectorAll("[data-install]").forEach(b => b.style.display = "none");
      const p = document.getElementById("dbInstallPill"); if (p) p.remove();
    } else if (ios) alert("On iPhone/iPad: tap the Share button at the bottom of Safari, scroll down and tap \"Add to Home Screen\".");
  }
  window.dbInstall.install = install;
  addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; show(); });
  addEventListener("appinstalled", () => { deferred = null; setStatus("✅ Installed - open DigitBot from your home screen / start menu."); });
  document.addEventListener("click", e => { const t = e.target.closest && e.target.closest("button[data-install]"); if (t) install(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", show); else show();
})();
