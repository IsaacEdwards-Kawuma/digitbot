// ==UserScript==
// @name         DigitBot Screen Trader
// @namespace    digitbot.local
// @version      1.2.0
// @description  Reads the price on Binance, TradingView and MetaTrader 5 Web, finds signals with the DigitBot strategies, and clicks Buy / Sell / Close for you (with stop-loss and take-profit). Demo / paper accounts first.
// @match        https://www.binance.com/*
// @match        https://demo.binance.com/*
// @match        https://testnet.binancefuture.com/*
// @match        https://www.tradingview.com/*
// @match        https://*.tradingview.com/*
// @match        https://web.metatrader.app/*
// @match        https://trade.mql5.com/*
// @match        https://app.traderepublic.com/*
// @match        https://traderepublic.com/*
// @match        https://isaacedwards-kawuma.github.io/digitbot/*
// @match        http://127.0.0.1:8770/*
// @require      https://isaacedwards-kawuma.github.io/digitbot/engine.js
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_notification
// @connect      data-api.binance.vision
// @connect      fapi.binance.com
// @run-at       document-idle
// @updateURL    https://isaacedwards-kawuma.github.io/digitbot/screen-trader.user.js
// @downloadURL  https://isaacedwards-kawuma.github.io/digitbot/screen-trader.user.js
// ==/UserScript==
/* How it works
   READ:  the price from the page (tab title or an element you teach it), history from Binance's free public data.
   THINK: the same 5 strategies + honest backtest as the DigitBot app (engine.js).
   CLICK: fills size, take-profit and stop-loss, clicks Buy or Sell, and clicks Close when its own (trailing) stop is hit.
   SAFETY: "Practice clicks" is ON at first (it only highlights what it would click); demo/paper first; REAL needs typed
   I UNDERSTAND; leverage above 3x refused; daily loss limit; it refuses to trade without a platform stop-loss box. */
(function () {
  "use strict";
  // ---- on the DigitBot trading page: only a bridge. The page says "start the Screen Trader on <platform> with these settings";
  //      we keep it in Tampermonkey's storage (shared by all sites) and the platform page picks it up.
  if (/github\.io$|^127\.0\.0\.1$/.test(location.hostname)) {
    const mark = () => { document.documentElement.dataset.dbst = "1.2.0"; };
    mark(); new MutationObserver(mark).observe(document.documentElement, { attributes: true, attributeFilter: ["data-dbst"] });
    window.addEventListener("dbst-handoff", e => {
      try { const h = JSON.parse(e.detail); h.t = Date.now(); if (typeof GM_setValue === "function") GM_setValue("handoff", h); else localStorage.setItem("dbst.handoff", JSON.stringify(h));
            window.dispatchEvent(new CustomEvent("dbst-ack", { detail: "ok" })); } catch (x) { console.error(x); }
    });
    return;
  }
  if (window.top !== window.self || document.getElementById("dbst")) return;
  const E = (typeof Engine !== "undefined" && Engine) || window.Engine;
  const VER = "1.2.0";

  // ---------------------------------------------------------------- storage (per site)
  const HOST = location.hostname.replace(/^www\./, "");
  const gget = (k, d) => { try { if (typeof GM_getValue === "function") return GM_getValue(k, d); } catch (e) {} try { const v = localStorage.getItem("dbst." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const gset = (k, v) => { try { if (typeof GM_setValue === "function") return GM_setValue(k, v); } catch (e) {} try { localStorage.setItem("dbst." + k, JSON.stringify(v)); } catch (e) {} };
  const DEF = { tf: "1h", strategy: "ema_pullback", risk: 1, balance: 1000, dayLoss: 3, maxDay: 6, slAtr: 1.5, rr: 2, be: 1, trail: 2,
                maxLev: 3, practice: true, signalsOnly: false, account: "demo", realOk: false, sizeUnit: "coin", needTpSl: true, untested: false };
  let S = Object.assign({}, DEF, gget("set." + HOST, {}));
  const saveS = () => gset("set." + HOST, S);
  Object.entries(S.custom || {}).forEach(([k, d]) => { try { if (E.addCustom) E.addCustom(k, d); } catch (e) {} });   // your own strategies from the DigitBot page
  if (!E.STRATEGIES[S.strategy]) S.strategy = "ema_pullback";
  let TEACH = gget("teach." + HOST, {});
  let ST = Object.assign({ pos: null, hist: [] }, gget("state." + HOST, {}));
  const saveST = () => gset("state." + HOST, ST);

  // ---------------------------------------------------------------- the site
  const num = s => { if (s == null) return NaN; const m = String(s).replace(/[−–]/g, "-").match(/-?[\d,]*\.?\d+/); return m ? parseFloat(m[0].replace(/,/g, "")) : NaN; };
  const SITES = {
    binance: { name: "Binance", test: () => /binance/.test(HOST),
      symbol: () => { const m = location.pathname.match(/\/(?:futures|trade)\/([A-Z0-9_]+)/i); return m ? m[1].replace("_", "").toUpperCase() : null; },
      price: () => num(document.title.split("|")[0]),
      spot: () => /\/trade\//.test(location.pathname),
      demo: () => /demo|testnet/.test(HOST) || /demo trading/i.test(textOf(document.querySelector("header")) || ""),
      words: { buy: ["Buy/Long", "Buy / Long", "Buy"], sell: ["Sell/Short", "Sell / Short", "Sell"], market: ["Market"],
               tpsl: ["TP/SL"], close: ["Market", "Close"], confirm: ["Confirm", "OK"] },
      sizeRe: /unitAmount|quantity|amount|size/i, tpRe: /take.?profit|^tp$|tp.?price|takeProfit/i, slRe: /stop.?loss|^sl$|sl.?price|stopLoss/i,
      openCount: () => { const m = (document.body.innerText || "").match(/Positions\s*\((\d+)\)/); return m ? +m[1] : null; },
      leverage: () => { const b = visible([...document.querySelectorAll("button,[role=button]")]).map(textOf).find(t => /^\d{1,3}x$/i.test(t)); return b ? parseInt(b) : null; },
      balance: () => { const m = (document.body.innerText || "").match(/Avbl\s*([\d,]+\.?\d*)\s*USDT/i); return m ? num(m[1]) : null; } },
    tradingview: { name: "TradingView", test: () => /tradingview/.test(HOST),
      symbol: () => (document.title.trim().split(/\s+/)[0] || "").replace(/^.*:/, "").toUpperCase() || null,
      price: () => num(document.title.trim().split(/\s+/)[1]),
      spot: () => false,
      demo: () => /paper trading/i.test(document.body.innerText || ""),
      words: { buy: ["Buy", "Buy Market"], sell: ["Sell", "Sell Market"], market: ["Market"], tpsl: [], close: ["Close", "Close position", "Flatten"], confirm: ["Confirm", "OK"] },
      sizeRe: /quantity|units|qty|amount|size/i, tpRe: /take.?profit/i, slRe: /stop.?loss/i,
      openCount: () => null, leverage: () => null, balance: () => null },
    mt5web: { name: "MetaTrader 5 Web", test: () => /metatrader|mql5/.test(HOST),
      symbol: () => null, price: () => NaN, spot: () => false,
      demo: () => /\bdemo\b/i.test(textOf(document.querySelector("[class*=account]")) || ""),
      words: { buy: ["Buy by Market", "Buy"], sell: ["Sell by Market", "Sell"], market: [], tpsl: [], close: ["Close", "Close position"], confirm: ["OK", "Confirm"] },
      sizeRe: /volume|lots?/i, tpRe: /take.?profit|^tp$/i, slRe: /stop.?loss|^sl$/i,
      openCount: () => null, leverage: () => null, balance: () => null },
    // Trade Republic has NO demo account: every order would be real money, so the bot never clicks there - it gives signals
    traderepublic: { name: "Trade Republic", test: () => /traderepublic/.test(HOST), signalsOnly: true,
      symbol: () => null, price: () => NaN, spot: () => false, demo: () => false,
      words: { buy: ["Buy"], sell: ["Sell"], market: [], tpsl: [], close: [], confirm: [] },
      sizeRe: /amount|quantity|shares/i, tpRe: /take.?profit/i, slRe: /stop/i,
      openCount: () => null, leverage: () => null, balance: () => null },
  };
  const SITE = Object.values(SITES).find(s => s.test()) || SITES.binance;

  // ---------------------------------------------------------------- reading the page
  function textOf(e) { return e ? (e.innerText || e.value || e.textContent || "").trim().replace(/\s+/g, " ") : ""; }
  function isVis(e) { if (!e || !e.getBoundingClientRect) return false; const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false;
                      const cs = getComputedStyle(e); return cs.visibility !== "hidden" && cs.display !== "none" && +cs.opacity > 0.05; }
  const visible = a => a.filter(e => isVis(e) && !e.closest("#dbst"));
  const center = e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const dist2 = (a, b) => { const p = center(a), q = center(b); return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2; };
  function byText(words, near, within) {
    if (!words || !words.length) return null;
    const all = visible([...document.querySelectorAll("button,[role=button],[role=tab],[role=columnheader],a,div,span,label,th,td")]);
    for (const w of words) {
      const lw = w.toLowerCase();
      let c = all.filter(e => textOf(e).toLowerCase() === lw && e.children.length <= 3 && (!within || within.contains(e)));
      if (!c.length) continue;
      c = c.map(e => e.closest("button,[role=button],[role=tab],a,label") || e);
      if (near) c.sort((a, b) => dist2(a, near) - dist2(b, near));
      else c.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top || 0);
      return c[0];
    }
    return null;
  }
  function inputBy(re, near) {
    const ins = visible([...document.querySelectorAll("input:not([type=checkbox]):not([type=range]):not([type=hidden]),textarea")]);
    const hit = ins.filter(i => [i.id, i.name, i.placeholder, i.getAttribute("aria-label"), i.getAttribute("data-testid")].some(v => v && re.test(v)));
    let c = hit;
    if (!c.length) {                                         // a label / text next to the box
      c = ins.filter(i => { let p = i.parentElement; for (let k = 0; k < 3 && p; k++, p = p.parentElement) { const t = textOf(p); if (t.length < 60 && re.test(t)) return true; } return false; });
    }
    if (near) c.sort((a, b) => dist2(a, near) - dist2(b, near));
    return c[0] || null;
  }
  // ---- remembered elements ("Teach"): several ways to find the same element again
  function describe(e) {
    const path = []; let x = e;
    while (x && x !== document.body && path.length < 9) { const p = x.parentElement; if (!p) break; path.unshift(x.tagName.toLowerCase() + ":" + [...p.children].filter(k => k.tagName === x.tagName).indexOf(x)); x = p; }
    return { tag: e.tagName.toLowerCase(), text: textOf(e).slice(0, 40), id: (e.id || "").replace(/[-_]?\d+$/, ""), name: e.getAttribute("name") || "",
             ph: e.getAttribute("placeholder") || "", aria: e.getAttribute("aria-label") || "", testid: e.getAttribute("data-testid") || "", path };
  }
  function resolve(d) {
    if (!d) return null;
    const all = visible([...document.querySelectorAll(d.tag)]);
    const tests = [e => d.testid && e.getAttribute("data-testid") === d.testid, e => d.id && (e.id || "").replace(/[-_]?\d+$/, "") === d.id && (e.id || "") !== "",
                   e => d.aria && e.getAttribute("aria-label") === d.aria, e => d.ph && e.getAttribute("placeholder") === d.ph, e => d.name && e.getAttribute("name") === d.name,
                   e => d.text && d.tag !== "input" && textOf(e) === d.text];
    for (const t of tests) { const c = all.filter(t); if (c.length === 1) return c[0]; }
    let x = document.body;
    for (const step of d.path) { const [tag, i] = step.split(":"); x = x && [...x.children].filter(k => k.tagName.toLowerCase() === tag)[+i]; }
    return x && isVis(x) ? x : (all.filter(tests[5])[0] || null);
  }
  const KEYS = [["buy", "Buy / Long button"], ["sell", "Sell / Short button"], ["size", "Size / amount box"], ["tpsl", "TP/SL tick box (if there is one)"],
                ["tp", "Take-profit price box"], ["sl", "Stop-loss price box"], ["close", "Close-position button"], ["market", "'Market' order tab (if any)"],
                ["price", "Price on the page (only if the bot can't read it)"], ["ticket", "'New order' button (MT5 Web)"]];
  function el(k) {
    if (TEACH[k]) { const e = resolve(TEACH[k]); if (e) return e; }
    const w = SITE.words, buy = TEACH.buy ? resolve(TEACH.buy) : byText(w.buy);
    switch (k) {
      case "buy": return byText(w.buy);
      case "sell": return byText(w.sell, buy);
      case "size": return inputBy(SITE.sizeRe, buy);
      case "tp": return inputBy(SITE.tpRe, buy);
      case "sl": return inputBy(SITE.slRe, buy);
      case "tpsl": {                                        // only a real tick box next to the order form
        const t = byText(w.tpsl, buy); if (!t || t.closest("table")) return null;
        const box = t.querySelector("input[type=checkbox],[role=checkbox]") || t.closest("label")?.querySelector("input[type=checkbox]") ||
                    t.parentElement?.querySelector("input[type=checkbox],[role=checkbox]") || (t.matches("[role=checkbox]") ? t : null);
        return box ? (box.closest("label") || box) : null; }
      case "market": return byText(w.market, el("size") || buy);
      case "close": {                                       // only inside the positions table
        const hdr = byText(["Close Position", "Close position", "Close All Positions"]); if (!hdr) return null;
        const box = hdr.closest("table,[role=table],[role=grid]") || hdr.parentElement?.parentElement?.parentElement;
        return byText(w.close, hdr, box); }
      case "confirm": return visible([...document.querySelectorAll("[role=dialog],[class*=modal],[class*=Modal]")]).length ? byText(w.confirm) : null;
      default: return null;
    }
  }
  function readPrice() {
    if (TEACH.price) { const e = resolve(TEACH.price); const v = num(textOf(e)); if (v > 0) return v; }
    const v = SITE.price(); return v > 0 ? v : NaN;
  }
  const symbol = () => S.symOverride || SITE.symbol() || "";

  // ---------------------------------------------------------------- acting on the page
  function flash(e, label, color) {
    if (!e) return; const r = e.getBoundingClientRect(), b = document.createElement("div");
    b.style.cssText = `position:fixed;left:${r.left - 3}px;top:${r.top - 3}px;width:${r.width + 6}px;height:${r.height + 6}px;border:3px solid ${color || "#facc15"};border-radius:6px;z-index:2147483646;pointer-events:none;box-shadow:0 0 12px ${color || "#facc15"}`;
    const t = document.createElement("div"); t.textContent = label; t.style.cssText = `position:absolute;top:-22px;left:0;background:${color || "#facc15"};color:#000;font:700 12px sans-serif;padding:2px 6px;border-radius:4px;white-space:nowrap`;
    b.appendChild(t); document.body.appendChild(b); setTimeout(() => b.remove(), 2600);
  }
  function click(e) {
    const [x, y] = center(e), o = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
    for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup"]) e.dispatchEvent(new (t.startsWith("pointer") && window.PointerEvent ? PointerEvent : MouseEvent)(t, o));
    e.click();
  }
  function typeInto(e, v) {
    const s = String(v); e.focus();
    try { e.select && e.select(); document.execCommand("selectAll"); document.execCommand("insertText", false, s); } catch (x) {}
    if (e.value !== s) {
      const proto = e.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(e, s);
      e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true }));
    }
    e.blur(); return e.value === s || num(e.value) === num(s);
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function step(kind, key, label, value) {           // one action; in practice mode only highlight it
    const e = el(key);
    if (!e) return { ok: false, why: `can't find the ${KEYS.find(k => k[0] === key)?.[1] || key} (use Setup › Teach)` };
    flash(e, (S.practice ? "PRACTICE: " : "") + label, S.practice ? "#facc15" : kind === "type" ? "#38bdf8" : "#22c55e");
    if (S.practice) { log(`practice: would ${kind === "type" ? `type ${value} into` : "click"} ${label}`); await sleep(700); return { ok: true, el: e }; }
    if (kind === "type") { if (!typeInto(e, value)) return { ok: false, why: `${label}: the box did not accept ${value}` }; }
    else click(e);
    await sleep(450); return { ok: true, el: e };
  }

  // ---------------------------------------------------------------- prices + candles
  const TF_MS = { "15m": 9e5, "1h": 36e5, "4h": 144e5, "1d": 864e5 };
  const PROXY = { EURUSD: "EURUSDT", XAUUSD: "XAUUSDT", GOLD: "XAUUSDT", XAGUSD: "XAGUSDT", SILVER: "XAGUSDT", XPTUSD: "XPTUSDT", XPDUSD: "XPDUSDT",
                  USOIL: "CLUSDT", WTI: "CLUSDT", CL1: "CLUSDT", NATGAS: "NATGASUSDT", NG1: "NATGASUSDT", COPPER: "COPPERUSDT", HG1: "COPPERUSDT",
                  USDTRY: "USDTTRY", USDZAR: "USDTZAR", USDBRL: "USDTBRL", USDMXN: "USDTMXN", USDARS: "USDTARS", USDCOP: "USDTCOP", USDIDR: "USDTIDR", USDKZT: "USDTKZT",
                  BTCUSD: "BTCUSDT", ETHUSD: "ETHUSDT" };
  const FUT_ONLY = /^(XAU|XAG|XPT|XPD|CL|NATGAS|COPPER)USDT$/;           // these exist only on Binance Futures
  const dataSym = s => { s = (s || "").toUpperCase().replace(/\.P$|PERP$/, "").replace(/[^A-Z0-9]/g, ""); if (PROXY[s]) return PROXY[s]; const b = s.replace(/(\.P|PERP)$/, ""); return /USDT$|USDC$|FDUSD$/.test(b) ? b : PROXY[b.slice(0, 6)] || null; };
  function getJSON(url) {
    return new Promise((res, rej) => {
      if (typeof GM_xmlhttpRequest === "function") GM_xmlhttpRequest({ method: "GET", url, timeout: 20000, onload: r => { try { res(JSON.parse(r.responseText)); } catch (e) { rej(e); } }, onerror: rej, ontimeout: rej });
      else fetch(url).then(r => r.json()).then(res, rej);
    });
  }
  let bars = [], B = null, histKey = "", histT = 0, lastClosed = 0, px = NaN, pxT = 0, ratio = 1;
  let histBusy = false;
  async function loadHistory(force) {
    const ds = dataSym(symbol()), key = ds + S.tf;
    if (!ds) { bars = []; B = null; return; }
    if (histBusy || (!force && key === histKey && Date.now() - histT < 300000)) return;
    histBusy = true;
    try { await loadHistory2(ds, key); } finally { histBusy = false; }
  }
  async function loadHistory2(ds, key) {
    const fut = FUT_ONLY.test(ds) || (!SITE.spot() && SITE === SITES.binance && !/^USDT/.test(ds));
    const base = fut ? "https://fapi.binance.com/fapi/v1/klines" : "https://data-api.binance.vision/api/v3/klines";
    let all = [], end = null;
    for (let k = 0; k < 3; k++) {
      const part = (await getJSON(`${base}?symbol=${ds}&interval=${S.tf}&limit=1000${end ? "&endTime=" + end : ""}`)).map(x => ({ t: x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4] }));
      if (!part.length) break; all = part.concat(all); end = part[0].t - 1; if (part.length < 1000) break;
    }
    const first = histKey !== key; histKey = key; histT = Date.now(); bars = all; if (first) lastClosed = 0; recompute();
    log(`history: ${bars.length} bars of ${ds} ${S.tf}${ds !== symbol() ? ` (follows ${symbol()})` : ""}`);
  }
  function liveIntoBars() {
    if (!bars.length || !(px > 0)) return;
    const last = bars[bars.length - 1], tf = TF_MS[S.tf], now = Date.now();
    ratio = px / last.c > 0.5 && px / last.c < 2 ? ratio * 0.9 + 0.1 * (px / last.c) : ratio;   // screen price vs data price (forex proxies)
    const p = px / ratio;
    if (now >= last.t + tf) bars.push({ t: last.t + tf * Math.floor((now - last.t) / tf), o: last.c, h: Math.max(last.c, p), l: Math.min(last.c, p), c: p });
    else { last.c = p; last.h = Math.max(last.h, p); last.l = Math.min(last.l, p); }
  }
  function closedIdx() { let i = B.n - 1; while (i > 0 && B.t[i] + TF_MS[S.tf] > Date.now()) i--; return i; }
  function recompute() { if (bars.length > 250) B = E.addAll(bars); else B = null; }
  const params = () => ({ sl_atr: +S.slAtr || 1.5, rr: +S.rr || 2, breakeven_r: +S.be, longOnly: SITE.spot() });

  // ---------------------------------------------------------------- the trading logic
  const today = () => new Date().toDateString();
  const todayPL = () => ST.hist.filter(h => new Date(h.exitT).toDateString() === today()).reduce((s, h) => s + h.pl, 0);
  const isReal = () => S.account === "real";
  function blockers(side) {
    if (!(px > 0)) return "can't read the price on this page (Setup › Teach › Price)";
    if (!B) return "no price history for this market yet";
    if (ST.pos) return "already in a trade (close it first)";
    if (side === "sell" && SITE.spot()) return "spot can't sell short";
    if (isReal() && !S.realOk) return "REAL account: type I UNDERSTAND in Settings first";
    const lev = SITE.leverage(); if (lev && lev > S.maxLev) return `leverage on the page is ${lev}x - set it to ${S.maxLev}x or less first`;
    const bal = balance(); if (todayPL() <= -bal * S.dayLoss / 100) return "daily loss limit reached";
    const n = ST.hist.filter(h => new Date(h.t).toDateString() === today()).length; if (n >= S.maxDay) return "max trades per day reached";
    if (S.needTpSl && !el("tpsl") && (!el("tp") || !el("sl"))) return "can't find the take-profit / stop-loss boxes (Setup › Teach) - the bot never trades without a stop on the platform";
    return "";
  }
  const balance = () => SITE.balance() || +S.balance || 0;
  function sizeFor(entry, sl) {
    const risk = balance() * S.risk / 100, units = risk / Math.abs(entry - sl);
    if (S.sizeUnit === "quote") return +(units * entry).toFixed(2);
    if (S.sizeUnit === "lots") { const g = /XAU|GOLD/.test(symbol()) ? 100 : 1e5; return Math.max(0.01, Math.floor(units / g * 100) / 100); }
    const d = entry > 1000 ? 3 : entry > 10 ? 2 : entry > 1 ? 1 : 0; return +(Math.floor(units * 10 ** d) / 10 ** d).toFixed(d);
  }
  const fp = v => +(+v).toPrecision(7);
  let busy = false;
  async function enter(side, sig, why) {
    if (sigOnly()) {                                         // no clicking: announce the trade with its stop and target
      if (!B || !(px > 0)) return log("no price yet");
      const ci = closedIdx(), slD = sig ? Math.abs(B.c[ci] - sig.sl) * ratio : B.atr[ci] * S.slAtr * ratio, tpD = sig ? Math.abs(sig.tp - B.c[ci]) * ratio : slD * S.rr;
      const sl = side === "buy" ? px - slD : px + slD, tp = side === "buy" ? px + tpD : px - tpD;
      announce(`${side.toUpperCase()} signal ${symbol()} ${S.tf}`, `around ${fp(px)} · stop-loss ${fp(sl)} · take-profit ${fp(tp)} · risk ${S.risk}% → ${sizeFor(px, sl)} ${S.sizeUnit === "lots" ? "lots" : S.sizeUnit === "quote" ? "in money" : "units"} · ${why}`);
      ST.hist.push({ t: Date.now(), exitT: Date.now(), sym: symbol(), side, entry: px, exit: px, pl: 0, plEst: 0, reason: "signal only", strat: sig ? S.strategy : "manual", practice: true });
      ST.hist = ST.hist.slice(-300); saveST(); render(); return true;
    }
    if (busy) return; const no = blockers(side);
    if (no) { log("not traded: " + no); return false; }
    busy = true;
    try {
      const ci = closedIdx(), a = B.atr[ci], scale = ratio;
      let slD, tpD;
      if (sig) { slD = Math.abs(B.c[ci] - sig.sl) * scale; tpD = Math.abs(sig.tp - B.c[ci]) * scale; }
      else { slD = a * S.slAtr * scale; tpD = slD * S.rr; }
      const entry = px, sl = side === "buy" ? entry - slD : entry + slD, tp = side === "buy" ? entry + tpD : entry - tpD, size = sizeFor(entry, sl);
      if (!(size > 0)) { log("not traded: the size works out as 0 - check the balance and risk % in Settings"); return false; }
      const before = SITE.openCount();
      log(`${S.practice ? "PRACTICE " : ""}${side.toUpperCase()} ${symbol()} ~${fp(entry)} size ${size} SL ${fp(sl)} TP ${fp(tp)} - ${why}`);
      if (TEACH.ticket) { const r = await step("click", "ticket", "New order"); if (!r.ok) return fail(r.why); }
      if (el("market")) { const r = await step("click", "market", "Market tab"); if (!r.ok) return fail(r.why); }
      let r = await step("type", "size", "Size", size); if (!r.ok) return fail(r.why);
      const box = el("tpsl");
      if (box && !(box.checked || box.querySelector?.("input:checked") || box.querySelector?.("[aria-checked=true]") || /checked|true/.test(box.getAttribute("aria-checked") || box.getAttribute("data-state") || ""))) {
        r = await step("click", "tpsl", "TP/SL tick box"); if (!r.ok) return fail(r.why); await sleep(300);
      }
      if (S.needTpSl && !S.practice && (!el("tp") || !el("sl"))) return fail("can't find the take-profit / stop-loss boxes after ticking TP/SL (Setup › Teach) - nothing was bought: the bot never trades without a stop on the platform");
      if (el("tp")) { r = await step("type", "tp", "Take-profit", fp(tp)); if (!r.ok) return fail(r.why); }
      if (el("sl")) { r = await step("type", "sl", "Stop-loss", fp(sl)); if (!r.ok) return fail(r.why); }
      r = await step("click", side, side === "buy" ? "BUY" : "SELL"); if (!r.ok) return fail(r.why);
      await sleep(900);
      if (!S.practice && el("confirm")) { await step("click", "confirm", "Confirm"); await sleep(900); }
      if (!S.practice && before != null) {                  // check the position really opened
        let ok = false; for (let k = 0; k < 16 && !ok; k++) { await sleep(500); ok = (SITE.openCount() || 0) > before; }
        if (!ok) { stopAuto("the position did not appear on the page - check the platform"); return fail("no new position seen after clicking"); }
      }
      ST.pos = { side, entry, sl, tp, sl0: sl, size, t: Date.now(), sym: symbol(), strat: sig ? S.strategy : "manual", practice: S.practice, risk: slD };
      saveST(); beep(side === "buy" ? 880 : 520); render(); return true;
    } finally { busy = false; }
  }
  function fail(why) { log("!! " + why); beep(220); return false; }
  async function exitPos(reason, at) {
    const p = ST.pos; if (!p || busy || Date.now() - (p.closeTry || 0) < 10000) return; busy = true; p.closeTry = Date.now();
    try {
      if (!/platform/.test(reason)) {
        const r = el("close") ? await step("click", "close", "Close position") : { ok: false, why: "can't find the Close-position button (Setup › Teach)" };
        if (!r.ok && !p.practice && SITE.openCount() !== 0) { log("!! could not close: " + r.why + " - CLOSE IT BY HAND"); beep(220); return; }
        if (!r.ok) log(p.practice ? "practice: no Close button to highlight (no real position open)" : "no open position on the page - recording it as closed");
        await sleep(900); if (!S.practice && el("confirm")) await step("click", "confirm", "Confirm");
      }
      const exit = at || px, pl = (p.side === "buy" ? exit - p.entry : p.entry - exit) * (S.sizeUnit === "coin" ? p.size : S.sizeUnit === "quote" ? p.size / p.entry : p.size * (/XAU|GOLD/.test(p.sym) ? 100 : 1e5));
      ST.hist.push({ t: p.t, exitT: Date.now(), sym: p.sym, side: p.side, entry: p.entry, exit, pl: p.practice ? 0 : pl, plEst: pl, reason, strat: p.strat, practice: p.practice });
      ST.hist = ST.hist.slice(-300); ST.pos = null; saveST();
      log(`CLOSED ${p.side.toUpperCase()} ${p.sym} at ${fp(exit)} (${reason}) about ${pl >= 0 ? "+" : ""}${pl.toFixed(2)}${p.practice ? " (practice, not counted)" : ""}`);
      render();
    } finally { busy = false; }
  }
  function manage() {
    const p = ST.pos; if (!p || !(px > 0) || p.sym !== symbol()) return;
    const buy = p.side === "buy", gain = buy ? px - p.entry : p.entry - px;
    const oc = SITE.openCount();
    if (!p.practice && oc === 0 && Date.now() - p.t > 15000) return exitPos("closed on the platform", buy ? (px <= p.sl ? p.sl : px >= p.tp ? p.tp : px) : (px >= p.sl ? p.sl : px <= p.tp ? p.tp : px));
    const gone = !p.practice && oc === 0;                    // the platform's own TP/SL already closed it
    if (buy ? px <= p.sl : px >= p.sl) return exitPos(gone ? "stop-loss (on the platform)" : p.sl === p.sl0 ? "stop-loss" : "trailing stop", p.sl);
    if (buy ? px >= p.tp : px <= p.tp) return exitPos(gone ? "take-profit (on the platform)" : "take-profit", p.tp);
    if (S.be && gain >= S.be * p.risk && (buy ? p.sl < p.entry : p.sl > p.entry)) { p.sl = p.entry; log(`${p.sym}: bot stop moved to break-even (the platform stop stays as the safety net)`); saveST(); }
    if (S.trail && (buy ? p.sl >= p.entry : p.sl <= p.entry) && B) {
      const t = buy ? px - S.trail * B.atr[closedIdx()] * ratio : px + S.trail * B.atr[closedIdx()] * ratio;
      if (buy ? t > p.sl : t < p.sl) { p.sl = t; saveST(); }
    }
  }
  let auto = null;
  async function startAuto() {
    if (!B) return log("no price history yet");
    const res = E.backtestAll(B, params(), B.c[B.n - 1] * (SITE === SITES.binance ? 0.0008 : 0.0003), S.risk).find(r => r.name === S.strategy);
    const pf = s => s.trades ? Math.min(s.profit_factor, 99).toFixed(2) : "-";
    log(`backtest ${E.STRATEGIES[S.strategy].name} on ${symbol()} ${S.tf}: ${res.pass ? "PASS" : "fail"} - TRAIN ${res.train.trades} trades PF ${pf(res.train)}, TEST ${res.test.trades} trades PF ${pf(res.test)}`);
    if (!res.pass && sigOnly()) log("signals only: it will announce signals anyway - this strategy did NOT pass here, so treat them with care");
    else if (!res.pass && (isReal() || !S.untested)) return log("auto not started: this strategy did not PASS here" + (isReal() ? "" : " (tick 'practise untested' to try it on demo)"));
    auto = { sym: symbol(), tf: S.tf, strat: S.strategy, passed: res.pass }; lastClosed = B.t[closedIdx()];
    log(`AUTO ON: ${E.STRATEGIES[S.strategy].name} on ${auto.sym} ${auto.tf}. It acts when a candle closes. Keep this tab open.`); render();
  }
  function stopAuto(why) { if (auto) log("AUTO OFF" + (why ? ": " + why : "")); auto = null; render(); }
  function onBar() {
    const ci = closedIdx(); if (B.t[ci] === lastClosed) return; const first = !lastClosed; lastClosed = B.t[ci];
    if (first || !auto) return;
    if (auto.sym !== symbol() || auto.tf !== S.tf) return stopAuto("the market or timeframe changed");
    const sig = E.signalAt(B, auto.strat, ci, params());
    if (!sig) return log(`${auto.sym} ${auto.tf} candle closed: no signal`);
    enter(sig.side, sig, sig.why);
  }

  // ---------------------------------------------------------------- panel
  const st = document.createElement("style");
  st.textContent = `#dbst{position:fixed;z-index:2147483647;right:14px;top:70px;width:340px;max-height:86vh;overflow:auto;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:12px;font:13px/1.4 system-ui,Segoe UI,sans-serif;box-shadow:0 10px 30px #0009}
#dbst *{box-sizing:border-box}#dbst .h{display:flex;align-items:center;gap:6px;padding:8px 10px;background:#0ea5b7;color:#fff;cursor:move;border-radius:12px 12px 0 0;font-weight:700}
#dbst .h span{flex:1}#dbst .h button{background:#0b1220;color:#fff;border:0;border-radius:6px;padding:2px 8px;cursor:pointer}#dbst .b{padding:8px 10px}
#dbst .tabs{display:flex;gap:3px;margin-bottom:6px}#dbst .tabs button{flex:1;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:7px;padding:5px 2px;cursor:pointer;font-weight:600;font-size:12px}
#dbst .tabs button.on{background:#0ea5b7}#dbst .kv{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:6px}#dbst .kv div{background:#1e293b;border-radius:7px;padding:4px 6px;font-size:11px;color:#94a3b8}
#dbst .kv b{display:block;color:#e2e8f0;font-size:13px}#dbst label{display:flex;justify-content:space-between;align-items:center;gap:6px;margin:3px 0;font-size:12px;color:#cbd5e1}
#dbst input,#dbst select{background:#0b1220;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:4px 6px;font-size:12px;width:130px}#dbst input[type=checkbox]{width:16px;height:16px}
#dbst .row{display:flex;gap:5px;margin:6px 0}#dbst .row button{flex:1;border:0;border-radius:7px;padding:8px 4px;font-weight:700;cursor:pointer;color:#fff;background:#334155}
#dbst .buy{background:#15803d!important}#dbst .sell{background:#b91c1c!important}#dbst .pri{background:#0ea5b7!important}#dbst .log{background:#020617;border-radius:7px;padding:6px;font:11px ui-monospace,monospace;max-height:150px;overflow:auto;margin-top:6px}
#dbst .note{color:#94a3b8;font-size:11.5px;margin:4px 0}#dbst .warn{background:#292117;border:1px solid #b45309;color:#fcd34d;border-radius:7px;padding:5px 7px;font-size:11.5px;margin:5px 0}
#dbst .ok{color:#22c55e}#dbst .bad{color:#ef4444}#dbst table{width:100%;font-size:12px;border-collapse:collapse}#dbst td{padding:3px 2px;border-bottom:1px solid #1e293b}
#dbst td:last-child{white-space:nowrap;text-align:right}#dbst .tb{background:#334155;color:#fff;border:0;border-radius:6px;padding:2px 7px;cursor:pointer;font-size:11px}#dbst.min .b{display:none}`;
  document.head.appendChild(st);
  const P = document.createElement("div"); P.id = "dbst"; document.body.appendChild(P);
  // the bot loads on every page of the site but only shows on a trading/chart page (sites change pages without reloading)
  const onTradePage = () => SITE === SITES.binance ? /\/(futures|trade)\//.test(location.pathname) || /demo|testnet/.test(HOST)
                           : SITE === SITES.tradingview ? /\/chart/.test(location.pathname) : true;
  const POS = gget("pos." + HOST, null);
  if (POS) { P.style.left = POS.x + "px"; P.style.top = POS.y + "px"; P.style.right = "auto"; }
  function homePanel() { P.style.left = ""; P.style.right = "14px"; P.style.top = "70px"; gset("pos." + HOST, null); }
  function keepPanel() {                                     // never lose the panel
    if (!st.isConnected) (document.head || document.documentElement).appendChild(st);
    const fs = document.fullscreenElement, host = fs && fs.tagName !== "VIDEO" && fs.tagName !== "IFRAME" ? fs : document.body;
    if (!P.isConnected || P.parentElement !== host) host.appendChild(P);       // follow the chart into full screen
    P.style.display = onTradePage() ? "" : "none";
    const r = P.getBoundingClientRect();
    if (P.style.display !== "none" && (r.right < 60 || r.left > innerWidth - 60 || r.top > innerHeight - 30 || r.top < -10)) homePanel();
  }
  document.addEventListener("fullscreenchange", () => setTimeout(keepPanel, 50));
  document.addEventListener("keydown", e => { if (e.altKey && e.shiftKey && (e.key === "D" || e.key === "d")) { homePanel(); P.classList.remove("min"); keepPanel(); render(); log("panel brought back (Alt+Shift+D)"); } }, true);
  let tab = "auto", logs = [];
  function log(m) { const l = new Date().toTimeString().slice(0, 8) + " " + m; logs.push(l); logs = logs.slice(-120); console.log("[DigitBot Screen]", m); const L = P.querySelector(".log"); if (L) { L.innerHTML = logs.map(x => `<div>${esc(x)}</div>`).join(""); L.scrollTop = 1e9; } }
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const sigOnly = () => !!(SITE.signalsOnly || S.signalsOnly);
  function announce(title, body) {                        // sound + desktop pop-up (works on any site)
    beep(880); setTimeout(() => beep(1175), 220); log("🔔 " + title + " - " + body);
    try { if (typeof GM_notification === "function") GM_notification({ title: "DigitBot: " + title, text: body, timeout: 30000 });
          else if (window.Notification && Notification.permission === "granted") new Notification("DigitBot: " + title, { body }); } catch (e) {}
  }
  function beep(f) { try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = f; g.gain.value = 0.06; o.connect(g); g.connect(a.destination); o.start(); setTimeout(() => { o.stop(); a.close(); }, 180); } catch (e) {} }
  function render() {
    const lev = SITE.leverage(), demo = SITE.demo(), oc = SITE.openCount(), p = ST.pos;
    const mode = isReal() ? `<b class="bad">REAL</b>` : `<b class="ok">DEMO / paper</b>`;
    const head = `<div class="kv"><div>site<b>${SITE.name}${demo ? " ✓demo" : ""}</b></div><div>market<b>${esc(symbol() || "?")}</b></div>
      <div>price (screen)<b>${px > 0 ? fp(px) : '<span class="bad">not read</span>'}</b></div><div>account<b>${mode}</b></div>
      <div>clicks<b>${S.practice ? '<span style="color:#facc15">PRACTICE</span>' : '<span class="ok">REAL CLICKS</span>'}</b></div>
      <div>leverage<b>${lev ? (lev > S.maxLev ? `<span class="bad">${lev}x</span>` : lev + "x") : "–"}</b></div>
      <div>bot trade<b>${p ? `${p.side.toUpperCase()} ${fp(p.entry)}` : "none"}</b></div><div>today<b>${todayPL().toFixed(2)}</b></div></div>`;
    const warn = (sigOnly() ? `<div class="warn" style="border-color:#0ea5b7;color:#7dd3fc;background:#082f49">SIGNALS ONLY${SITE.signalsOnly ? ` (${SITE.name} has no demo account, so the bot never clicks here)` : ""}: it announces each signal with its stop-loss and take-profit (sound + pop-up). You place the order yourself.</div>` +
        (!symbol() ? `<div class="warn">Type the market in 🎯 Setup › "Market name", e.g. BTCUSD, ETHUSD, EURUSD, XAUUSD (gold). Prices come from Binance.</div>` : "") : "") +
      (!sigOnly() && S.practice ? `<div class="warn">PRACTICE CLICKS is on: the bot only highlights what it would click. Check every highlight lands on the right box, then switch it off in Settings.</div>` : "") +
      (lev > S.maxLev ? `<div class="warn">Leverage on the page is ${lev}x. The bot refuses to trade above ${S.maxLev}x - change it on the platform.</div>` : "") +
      (!(px > 0) && !sigOnly() ? `<div class="warn">Can't read the price. Setup › Teach › "Price on the page" and click the price.</div>` : "");
    let body = "";
    if (tab === "auto") body = `
      <label>Timeframe<select data-s="tf">${Object.keys(TF_MS).map(t => `<option ${t === S.tf ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <label>Strategy<select data-s="strategy">${Object.entries(E.STRATEGIES).map(([k, v]) => `<option value="${k}" ${k === S.strategy ? "selected" : ""}>${v.name}</option>`).join("")}</select></label>
      <label>Practise untested (demo only)<input type="checkbox" data-s="untested" ${S.untested ? "checked" : ""}></label>
      <div class="row"><button class="pri" data-a="auto">${auto ? "■ Stop" : sigOnly() ? "▶ Start signals" : "▶ Start auto"}</button></div>
      <div class="note">${auto ? `<b class="ok">AUTO ON</b> ${esc(E.STRATEGIES[auto.strat].name)} on ${esc(auto.sym)} ${auto.tf}${auto.passed ? " (PASSED its backtest)" : " (untested - demo practice)"}` : "Auto is off. It backtests first and only trades a strategy that PASSES."}</div>
      <div class="note">${B ? `Signal now: ${(() => { const s = E.signalAt(B, S.strategy, closedIdx(), params()); return s ? `<b class="${s.side === "buy" ? "ok" : "bad"}">${s.side.toUpperCase()}</b> - ${esc(s.why)}` : "none on the last closed candle"; })()} · ${esc(E.marketView(B).bias)}` : "loading history…"}</div>`;
    else if (tab === "manual" && sigOnly()) body = `<div class="note">Signals only: press for a ready-made plan (entry, stop-loss, take-profit, size) to type into ${esc(SITE.name)} yourself.</div>
      <div class="row"><button class="buy" data-a="buy">Plan a BUY</button><button class="sell" data-a="sell">Plan a SELL</button></div>`;
    else if (tab === "manual") body = `
      <div class="row"><button class="buy" data-a="buy">BUY / LONG</button><button class="sell" data-a="sell">SELL / SHORT</button></div>
      <div class="row"><button data-a="close">Close the bot's trade</button></div>
      <div class="note">Stop ${S.slAtr} × ATR, target ${S.rr} × stop, size from your risk % (${S.risk}% of ${balance().toFixed(2)}). The take-profit and stop-loss are typed into the platform with the order.
        The bot also moves its own stop to break-even and trails it, and clicks Close when that is hit.</div>
      ${p ? `<table><tr><td>side</td><td>${p.side}</td></tr><tr><td>entry</td><td>${fp(p.entry)}</td></tr><tr><td>platform stop</td><td>${fp(p.sl0)}</td></tr><tr><td>bot stop (trailing)</td><td>${fp(p.sl)}</td></tr><tr><td>target</td><td>${fp(p.tp)}</td></tr><tr><td>size</td><td>${p.size}</td></tr></table>` : ""}`;
    else if (tab === "setup") body = `<div class="note">The bot finds the buttons by their names. If one shows ✗ or the practice highlight lands on the wrong thing, press <b>Teach</b> and click that thing on the page (your click is caught, nothing is traded).</div>
      <table>${KEYS.map(([k, l]) => { const e = el(k); return `<tr><td>${l}</td><td>${e ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'}${TEACH[k] ? " taught" : ""}</td><td><button class="tb" data-teach="${k}">Teach</button> <button class="tb" data-show="${k}">Show</button>${TEACH[k] ? ` <button class="tb" data-forget="${k}">×</button>` : ""}</td></tr>`; }).join("")}</table>
      <label>Market name (if not detected)<input data-s="symOverride" value="${esc(S.symOverride || "")}" placeholder="e.g. EURUSD"></label>
      <div class="row"><button data-a="test">Test all (practice highlights)</button></div>`;
    else if (tab === "set") body = `
      <label>Signals only (never click)<input type="checkbox" data-s="signalsOnly" ${sigOnly() ? "checked" : ""} ${SITE.signalsOnly ? "disabled" : ""}></label>
      <label>Practice clicks (only highlight)<input type="checkbox" data-s="practice" ${S.practice ? "checked" : ""}></label>
      <label>Account<select data-s="account"><option value="demo" ${!isReal() ? "selected" : ""}>Demo / paper</option><option value="real" ${isReal() ? "selected" : ""}>REAL money</option></select></label>
      ${isReal() && !S.realOk ? `<label>Type I UNDERSTAND<input data-real placeholder="I UNDERSTAND"></label>` : ""}
      <label>Balance (if not read)<input type="number" data-s="balance" value="${S.balance}"></label>
      <label>Risk per trade %<input type="number" step="0.1" min="0.1" max="5" data-s="risk" value="${S.risk}"></label>
      <label>Size box is in<select data-s="sizeUnit"><option value="coin" ${S.sizeUnit === "coin" ? "selected" : ""}>coins (e.g. BTC)</option><option value="quote" ${S.sizeUnit === "quote" ? "selected" : ""}>money (e.g. USDT)</option><option value="lots" ${S.sizeUnit === "lots" ? "selected" : ""}>lots (forex)</option></select></label>
      <label>Daily loss limit %<input type="number" step="0.5" data-s="dayLoss" value="${S.dayLoss}"></label>
      <label>Max trades / day<input type="number" data-s="maxDay" value="${S.maxDay}"></label>
      <label>Stop (× ATR)<input type="number" step="0.1" data-s="slAtr" value="${S.slAtr}"></label>
      <label>Target (× stop)<input type="number" step="0.1" data-s="rr" value="${S.rr}"></label>
      <label>Break-even at (R, 0 = off)<input type="number" step="0.5" data-s="be" value="${S.be}"></label>
      <label>Trail (× ATR, 0 = off)<input type="number" step="0.5" data-s="trail" value="${S.trail}"></label>
      <label>Max leverage<select data-s="maxLev">${[1, 2, 3].map(v => `<option ${+S.maxLev === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <div class="row"><button data-a="restart">↻ Restart the bot</button><button data-a="forget">Forget the bot's trade</button></div>
      <div class="row"><button data-a="wipe">Reset everything for this site</button></div>
      <div class="note">Version ${VER}. Settings are saved for ${esc(HOST)}. "Forget the bot's trade" only clears the bot's memory - close any real position on the platform yourself.</div>`;
    else if (tab === "hist") body = `<table><tr><td>closed</td><td>side</td><td>result</td><td>why</td></tr>${ST.hist.slice(-25).reverse().map(h => `<tr><td>${new Date(h.exitT).toLocaleTimeString()}</td><td>${h.side}</td><td class="${h.plEst >= 0 ? "ok" : "bad"}">${h.plEst.toFixed(2)}${h.practice ? " (p)" : ""}</td><td>${esc(h.reason)}</td></tr>`).join("") || `<tr><td colspan="4">No trades yet.</td></tr>`}</table>
      <div class="note">Results are estimated from the screen price; the platform's own history is the true record.</div>`;
    P.innerHTML = `<div class="h"><span>🖱️ DigitBot Screen Trader</span><button data-a="restart" title="Restart: stop auto, re-find the buttons, reload the prices">↻</button><button data-a="min">${P.classList.contains("min") ? "▢" : "–"}</button></div>
      <div class="b">${head}${warn}<div class="tabs">${[["auto", "🤖 Auto"], ["manual", "✋ Manual"], ["setup", "🎯 Setup"], ["set", "⚙️ Settings"], ["hist", "📜"]].map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? "on" : ""}">${l}</button>`).join("")}</div>
      ${body}<div class="log">${logs.map(x => `<div>${esc(x)}</div>`).join("")}</div>
      <div class="note">Nothing here is financial advice. Most traders lose money; test on demo/paper for weeks first.</div></div>`;
    const L = P.querySelector(".log"); L.scrollTop = 1e9;
  }
  P.addEventListener("change", e => {
    const k = e.target.dataset.s;
    if (k) { S[k] = e.target.type === "checkbox" ? e.target.checked : e.target.type === "number" ? +e.target.value : e.target.value;
             if (k === "account") { S.realOk = false; if (isReal()) S.practice = true; }
             if (k === "practice" && !S.practice) log("PRACTICE CLICKS OFF: the bot will really click now");
             saveS(); if (k === "tf" || k === "symOverride") { stopAuto(); loadHistory(true).catch(err => log("history: " + err)); } render(); }
    if (e.target.dataset.real != null) { if (e.target.value.trim() === "I UNDERSTAND") { S.realOk = true; saveS(); log("REAL money allowed on " + HOST); render(); } }
  });
  P.addEventListener("click", e => {
    const t = e.target, a = t.dataset.a;
    if (t.dataset.tab) { tab = t.dataset.tab; render(); return; }
    if (a === "min") { P.classList.toggle("min"); render(); return; }
    if (a === "restart") { restart(); return; }
    if (a === "forget") { if (ST.pos && confirm("Forget the bot's open trade? (It does NOT close anything on the platform.)")) { ST.pos = null; saveST(); log("the bot forgot its trade"); render(); } return; }
    if (a === "wipe") { if (confirm("Reset settings, taught buttons and history for " + HOST + "? Practice clicks will be ON again.")) {
      S = Object.assign({}, DEF); TEACH = {}; ST = { pos: null, hist: [] }; saveS(); gset("teach." + HOST, TEACH); saveST(); log("everything reset for " + HOST); restart(); } return; }
    if (a === "auto") { auto ? stopAuto() : startAuto(); return; }
    if (a === "buy" || a === "sell") { if (sigOnly() || confirm(`${a.toUpperCase()} ${symbol()} now${S.practice ? " (practice clicks)" : ""}?`)) enter(a, null, "manual " + a); return; }
    if (a === "close") { if (ST.pos && confirm("Close the bot's trade now?")) exitPos("closed by you"); else if (!ST.pos) log("the bot has no open trade"); return; }
    if (a === "test") { (async () => { for (const [k, l] of KEYS) { const e2 = el(k); if (e2) { flash(e2, l); await sleep(900); } else log(`not found: ${l}`); } })(); return; }
    if (t.dataset.show) { const e2 = el(t.dataset.show); e2 ? flash(e2, KEYS.find(k => k[0] === t.dataset.show)[1]) : log("not found - use Teach"); return; }
    if (t.dataset.forget) { delete TEACH[t.dataset.forget]; gset("teach." + HOST, TEACH); render(); return; }
    if (t.dataset.teach) teach(t.dataset.teach);
  });
  function teach(k) {
    const label = KEYS.find(x => x[0] === k)[1];
    log(`TEACH: click the ${label} on the page (Esc to cancel). Your click is caught - nothing is traded.`);
    let hl = null;
    const over = e => { if (e.target.closest("#dbst")) return; if (hl) hl.style.outline = hl.__o || ""; hl = e.target; hl.__o = hl.style.outline; hl.style.outline = "3px solid #facc15"; };
    const done = () => { document.removeEventListener("mouseover", over, true); ["pointerdown", "mousedown", "mouseup", "pointerup", "click"].forEach(t => document.removeEventListener(t, catchIt, true)); document.removeEventListener("keydown", esc2, true); if (hl) hl.style.outline = hl.__o || ""; };
    const catchIt = e => {
      if (e.target.closest("#dbst")) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      if (e.type !== "click") return;
      let x = e.target;
      if (/size|tp|sl/.test(k) && x.tagName !== "INPUT") x = x.querySelector?.("input") || x.closest("label")?.querySelector("input") || x;
      else if (k !== "price" && x.tagName !== "INPUT") x = x.closest("button,[role=button],[role=tab],[role=checkbox],label,a") || x;
      TEACH[k] = describe(x); gset("teach." + HOST, TEACH); done();
      log(`learned: ${label} = ${x.tagName.toLowerCase()} "${textOf(x).slice(0, 30)}"`); flash(x, "learned: " + label, "#22c55e"); render();
    };
    const esc2 = e => { if (e.key === "Escape") { done(); log("teach cancelled"); } };
    document.addEventListener("mouseover", over, true); ["pointerdown", "mousedown", "mouseup", "pointerup", "click"].forEach(t => document.addEventListener(t, catchIt, true)); document.addEventListener("keydown", esc2, true);
  }
  (function drag() {
    let sx, sy, ox, oy, on = false;
    P.addEventListener("mousedown", e => { if (!e.target.closest(".h") || e.target.tagName === "BUTTON") return; on = true; sx = e.clientX; sy = e.clientY; const r = P.getBoundingClientRect(); ox = r.left; oy = r.top; e.preventDefault(); });
    document.addEventListener("mousemove", e => { if (!on) return; P.style.left = ox + e.clientX - sx + "px"; P.style.top = Math.max(0, oy + e.clientY - sy) + "px"; P.style.right = "auto"; });
    document.addEventListener("mouseup", () => { if (on) { const r = P.getBoundingClientRect(); gset("pos." + HOST, { x: Math.round(r.left), y: Math.round(r.top) }); } on = false; });
  })();

  // ---------------------------------------------------------------- main loop
  function restart() {
    auto = null; busy = false; histKey = ""; lastSym = ""; lastClosed = 0; px = NaN; ratio = 1;
    document.querySelectorAll("div[style*='2147483646']").forEach(e => e.remove());
    log("↻ restarted: auto is off, buttons and prices are read again"); render();
  }
  let lastSym = "", lastRender = 0;
  async function tick() {
    keepPanel(); if (!onTradePage()) return;
    const p = readPrice(); if (p > 0) { px = p; pxT = Date.now(); }
    else if (sigOnly() && bars.length) { px = bars[bars.length - 1].c * ratio; pxT = Date.now(); }
    const s = symbol();
    if (s && s !== lastSym) { lastSym = s; if (auto) stopAuto("the market changed"); loadHistory(true).catch(e => log("could not load history: " + (e.message || e))); }
    else if (s) { if (sigOnly() && !(readPrice() > 0) && Date.now() - histT > 60000) histT = 0; loadHistory(false).catch(() => {}); }
    if (bars.length) { liveIntoBars(); if (Date.now() - (tick.full || 0) > 3000 || !B) { tick.full = Date.now(); recompute(); } if (B) onBar(); }
    manage();
    if (Date.now() - lastRender > 3000 && !P.contains(document.activeElement)) { lastRender = Date.now(); render(); }
  }
  render();
  log(`ready on ${SITE.name}. Start in Setup: press "Test all" and check the yellow highlights.`);
  if (ST.pos) log(`the bot remembers an open ${ST.pos.side} on ${ST.pos.sym} - it keeps watching its stop`);
  // ---- started from the DigitBot page? take its market / timeframe / strategy
  (function takeHandoff() {
    let h = gget("handoff", null); if (!h && localStorage.getItem("dbst.handoff")) try { h = JSON.parse(localStorage.getItem("dbst.handoff")); } catch (e) {}
    if (!h || Date.now() - h.t > 5 * 60000 || h.site !== Object.keys(SITES).find(k => SITES[k] === SITE)) return;
    gset("handoff", null); try { localStorage.removeItem("dbst.handoff"); } catch (e) {}
    if (h.custom && E.addCustom) { E.addCustom(h.strategy, h.custom); S.custom = Object.assign({}, S.custom, { [h.strategy]: h.custom }); }
    if (h.tf && TF_MS[h.tf]) S.tf = h.tf; if (h.strategy && E.STRATEGIES[h.strategy]) S.strategy = h.strategy;
    if (h.symOverride) S.symOverride = h.symOverride; else delete S.symOverride;
    if (h.risk) S.risk = +h.risk; if (h.sizeUnit) S.sizeUnit = h.sizeUnit;
    saveS(); tab = "auto"; render();
    log(`started from the DigitBot ${h.from || ""} page: ${h.label || symbol()} ${S.tf}, ${E.STRATEGIES[S.strategy].name}${h.auto ? " - auto will start after the backtest" : ""}`);
    if (h.auto) { const t0 = Date.now(), w = setInterval(() => { if (B && symbol()) { clearInterval(w); startAuto(); } else if (Date.now() - t0 > 60000) { clearInterval(w); log("auto not started: no price history yet"); } }, 1000); }
  })();
  setInterval(() => tick().catch(e => console.error(e)), 1000);
  window.__dbst = { el, get S() { return S; }, get ST() { return ST; }, get TEACH() { return TEACH; }, enter, exitPos, get px() { return px; }, get B() { return B; },
                    startAuto, stopAuto, resolve, describe, render, keepPanel, setTab: t => { tab = t; render(); } };
})();
