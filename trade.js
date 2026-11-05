/* DigitBot Forex / Crypto web app: live Binance prices, chart, signals, backtest, practice (paper) trading. */
(function () {
  "use strict";
  const E = window.Engine, $ = id => document.getElementById(id);
  const DATA = "https://data-api.binance.vision/api/v3/";
  const MARKETS = {
    forex: [["EURUSDT", "EUR/USD", "fx"], ["GBPUSDT", "GBP/USD", "fx"], ["AUDUSDT", "AUD/USD", "fx"], ["PAXGUSDT", "Gold XAU/USD", "gold"]],
    crypto: [["BTCUSDT", "Bitcoin BTC/USDT", "c"], ["ETHUSDT", "Ethereum ETH/USDT", "c"], ["BNBUSDT", "BNB/USDT", "c"], ["SOLUSDT", "Solana SOL/USDT", "c"],
             ["XRPUSDT", "XRP/USDT", "c"], ["DOGEUSDT", "Dogecoin DOGE/USDT", "c"], ["ADAUSDT", "Cardano ADA/USDT", "c"], ["TRXUSDT", "TRON TRX/USDT", "c"]],
  };
  const TF_MS = { "15m": 9e5, "1h": 36e5, "4h": 144e5, "1d": 864e5 };
  const COLORS = ["#38bdf8", "#f59e0b", "#a78bfa", "#22c55e", "#f472b6"];
  let mode = location.hash === "#crypto" ? "crypto" : "forex";
  let bars = [], B = null, lastClosedT = 0, loading = false;

  // ---------------------------------------------------------------- helpers
  const dec = p => p >= 1000 ? 2 : p >= 10 ? 3 : p >= 1 ? 5 : 6;
  const fmt = (p, d) => p == null || isNaN(p) ? "–" : (+p).toFixed(d == null ? dec(p) : d);
  const money = v => (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const market = () => MARKETS[mode].find(m => m[0] === $("sym").value) || MARKETS[mode][0];
  const label = s => (MARKETS.forex.concat(MARKETS.crypto).find(m => m[0] === s) || [s, s])[1];
  function log(msg) { const d = document.createElement("div"); d.textContent = new Date().toTimeString().slice(0, 8) + " " + msg; $("log").appendChild(d); $("log").scrollTop = 1e9; }
  const params = () => ({ sl_atr: +$("btSl").value || 1.5, rr: +$("btRr").value || 2, breakeven_r: +$("btBe").value, longOnly: $("btLong").checked });

  async function klines(sym, tf, limit, endTime) {
    const u = `${DATA}klines?symbol=${sym}&interval=${tf}&limit=${limit}` + (endTime ? `&endTime=${endTime}` : "");
    const r = await fetch(u); if (!r.ok) throw new Error("price feed " + r.status);
    return (await r.json()).map(k => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4] }));
  }
  async function loadHistory() {
    if (loading) return; loading = true;
    const sym = $("sym").value, tf = $("tf").value;
    $("px").textContent = "loading…";
    try {
      let all = [], end = null;
      for (let k = 0; k < 3; k++) { const part = await klines(sym, tf, 1000, end); if (!part.length) break; all = part.concat(all); end = part[0].t - 1; if (part.length < 1000) break; }
      bars = all; lastClosedT = 0; recompute(); log(`loaded ${bars.length} bars of ${label(sym)} ${tf}`);
    } catch (e) { $("px").textContent = "no data"; log("could not load prices: " + e.message); }
    loading = false;
  }
  async function refreshLatest() {
    if (loading || !bars.length) return;
    try {
      const sym = $("sym").value, tf = $("tf").value, k = await klines(sym, tf, 3);
      if (sym !== $("sym").value || tf !== $("tf").value) return;
      for (const x of k) { const i = bars.findIndex(b => b.t === x.t); if (i >= 0) bars[i] = x; else if (x.t > bars[bars.length - 1].t) bars.push(x); }
      if (bars.length > 3200) bars.splice(0, bars.length - 3000);
      recompute();
    } catch (e) { /* try again next time */ }
  }
  // the last bar is still forming; signals only use closed bars
  const closedIdx = () => { const tfms = TF_MS[$("tf").value]; let i = B.n - 1; while (i > 0 && B.t[i] + tfms > Date.now()) i--; return i; };

  function recompute() {
    B = E.addAll(bars);
    const i = B.n - 1, ci = closedIdx(), p = B.c[i], first = B.c[Math.max(0, i - Math.round(864e5 / TF_MS[$("tf").value]))];
    $("px").textContent = fmt(p);
    const ch = (p - first) / first * 100;
    $("chg").innerHTML = `<span class="${ch >= 0 ? "up" : "dn"}">${ch >= 0 ? "▲" : "▼"} ${ch.toFixed(2)}% (24h)</span>`;
    const v = E.marketView(B);
    $("bias").innerHTML = `<span class="tag ${v.score >= 25 ? "buy" : v.score <= -25 ? "sell" : "none"}">${v.bias} ${v.score > 0 ? "+" : ""}${v.score}</span>`;
    $("src").textContent = mode === "forex" ? `price from Binance ${$("sym").value} (follows ${label($("sym").value)})` : "live Binance price";
    $("view").innerHTML = `<b>${v.bias}</b> (score ${v.score}, from -100 to +100)<ul style="margin:4px 0 0">${v.notes.map(n => `<li>${n}</li>`).join("")}</ul>`;
    renderSignals(ci); renderCalc(ci); draw();
    if (B.t[ci] !== lastClosedT) { const isNew = lastClosedT !== 0; lastClosedT = B.t[ci]; if (isNew) onNewBar(ci); }
    managePositions(); renderAccount();
  }

  // ---------------------------------------------------------------- chart
  function draw() {
    const cv = $("cv"), dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = 330;
    cv.width = W * dpr; cv.height = H * dpr; const g = cv.getContext("2d"); g.scale(dpr, dpr);
    g.fillStyle = "#0b1220"; g.fillRect(0, 0, W, H);
    if (!B) return;
    const n = Math.min(+$("zoom").value, B.n), s = B.n - n, padR = 70, plotW = W - padR, cw = plotW / n;
    let hi = -Infinity, lo = Infinity;
    for (let i = s; i < B.n; i++) { hi = Math.max(hi, B.h[i]); lo = Math.min(lo, B.l[i]); }
    const pos = acct.pos.filter(x => x.sym === $("sym").value);
    for (const x of pos) { hi = Math.max(hi, x.tp, x.sl); lo = Math.min(lo, x.tp, x.sl); }
    const pad = (hi - lo) * 0.06; hi += pad; lo -= pad;
    const y = v => 10 + (H - 30) * (hi - v) / (hi - lo), x = i => (i - s) * cw + cw / 2;
    g.strokeStyle = "#1e293b"; g.fillStyle = "#64748b"; g.font = "11px system-ui"; g.lineWidth = 1;
    for (let k = 0; k <= 5; k++) { const v = lo + (hi - lo) * k / 5, yy = y(v); g.beginPath(); g.moveTo(0, yy); g.lineTo(plotW, yy); g.stroke(); g.fillText(fmt(v), plotW + 6, yy + 4); }
    for (let i = s; i < B.n; i++) {
      const up = B.c[i] >= B.o[i]; g.strokeStyle = g.fillStyle = up ? "#22c55e" : "#ef4444";
      g.beginPath(); g.moveTo(x(i), y(B.h[i])); g.lineTo(x(i), y(B.l[i])); g.stroke();
      const t = y(Math.max(B.o[i], B.c[i])), bt = y(Math.min(B.o[i], B.c[i]));
      g.fillRect(x(i) - Math.max(1, cw * 0.35), t, Math.max(1.5, cw * 0.7), Math.max(1, bt - t));
    }
    [["ema20", "#facc15"], ["ema50", "#38bdf8"], ["ema200", "#a78bfa"]].forEach(([k, col]) => {
      g.strokeStyle = col; g.lineWidth = 1.4; g.beginPath(); let st = false;
      for (let i = s; i < B.n; i++) { const v = B[k][i]; if (isNaN(v)) continue; st ? g.lineTo(x(i), y(v)) : g.moveTo(x(i), y(v)); st = true; }
      g.stroke();
    });
    // signals of the chosen strategy
    const strat = $("ptStrat").value, p = Object.assign(params(), { longOnly: $("ptLong").checked }), ci = closedIdx();
    for (let i = Math.max(s, 210); i <= ci; i++) {
      const sg = E.signalAt(B, strat, i, p); if (!sg) continue;
      const buy = sg.side === "buy", yy = buy ? y(B.l[i]) + 12 : y(B.h[i]) - 12;
      g.fillStyle = buy ? "#22c55e" : "#ef4444"; g.beginPath();
      if (buy) { g.moveTo(x(i), yy - 7); g.lineTo(x(i) - 5, yy + 2); g.lineTo(x(i) + 5, yy + 2); }
      else { g.moveTo(x(i), yy + 7); g.lineTo(x(i) - 5, yy - 2); g.lineTo(x(i) + 5, yy - 2); }
      g.fill();
    }
    // open practice trades
    for (const t of pos) [["entry", "#e2e8f0"], ["sl", "#ef4444"], ["tp", "#22c55e"]].forEach(([k, col]) => {
      g.strokeStyle = col; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(0, y(t[k])); g.lineTo(plotW, y(t[k])); g.stroke(); g.setLineDash([]);
      g.fillStyle = col; g.fillText(`${k.toUpperCase()} ${fmt(t[k])}`, 6, y(t[k]) - 3);
    });
    g.fillStyle = "#94a3b8"; g.fillText(`${label($("sym").value)} · ${$("tf").value} · ▲▼ = ${E.STRATEGIES[strat].name} signals`, 8, H - 8);
    const last = B.c[B.n - 1]; g.fillStyle = "#0ea5b7"; g.fillRect(plotW, y(last) - 8, padR, 16); g.fillStyle = "#fff"; g.fillText(fmt(last), plotW + 6, y(last) + 4);
  }

  // ---------------------------------------------------------------- signals + calculator
  function renderSignals(ci) {
    const p = Object.assign(params(), { longOnly: false });
    $("sigs").innerHTML = Object.entries(E.STRATEGIES).map(([k, st]) => {
      let found = null;
      for (let i = ci; i > Math.max(210, ci - 60); i--) { const s = E.signalAt(B, k, i, p); if (s) { found = { i, s }; break; } }
      const body = found ? `<span class="tag ${found.s.side}">${found.s.side.toUpperCase()}</span> ${ci - found.i === 0 ? "<b>on the last closed bar</b>" : `${ci - found.i} bars ago`}
        at ${fmt(B.c[found.i])}<br>Stop-loss ${fmt(found.s.sl)} · Take-profit ${fmt(found.s.tp)}<br><span class="mut">${found.s.why}</span>`
        : `<span class="tag none">no signal</span> <span class="mut">in the last 60 bars</span>`;
      return `<div class="box"><h3>${st.name}</h3>${body}<div class="note">${st.desc}</div></div>`;
    }).join("");
  }
  function renderCalc(ci) {
    const bal = +$("calcBal").value || 0, risk = bal * (+$("calcRisk").value || 0) / 100, a = B.atr[ci], dist = a * (+$("calcSl").value), px = B.c[B.n - 1];
    if (!(dist > 0)) return;
    const units = risk / dist, m = market();
    const size = m[2] === "fx" ? `${(units / 1e5).toFixed(2)} lots (${Math.round(units).toLocaleString()} units)`
               : m[2] === "gold" ? `${(units / 100).toFixed(2)} lots (${units.toFixed(2)} oz)` : `${units.toFixed(units * px > 100 ? 4 : 2)} ${m[0].replace("USDT", "")}`;
    $("calcOut").innerHTML = `Risk ${money(risk)} with a stop ${fmt(dist)} away → size <b>${size}</b>, worth about ${money(units * px)}` +
      (units * px > bal ? ` <span class="dn">(more than the account: this needs leverage, which makes losses faster)</span>` : "");
  }

  // ---------------------------------------------------------------- backtest
  function runBacktest() {
    if (!B) return;
    const p = params(), spread = B.c[B.n - 1] * (+$("btCost").value || 0) / 100, risk = +$("btRisk").value || 1;
    const res = E.backtestAll(B, p, spread, risk), c = s => s.trades ? `<td>${s.trades}</td><td>${s.win_rate.toFixed(0)}%</td><td>${Math.min(s.profit_factor, 99).toFixed(2)}</td><td class="${s.return_pct >= 0 ? "up" : "dn"}">${s.return_pct >= 0 ? "+" : ""}${s.return_pct.toFixed(1)}%</td><td>${s.max_dd_pct.toFixed(1)}%</td>`
                                                     : `<td>0</td><td>–</td><td>–</td><td>–</td><td>–</td>`;
    $("btTable").innerHTML = `<tr><th></th><th colspan="5" style="text-align:center">TRAIN (older 70%)</th><th colspan="5" style="text-align:center">TEST (newest 30%)</th><th></th></tr>
      <tr><th>Strategy</th><th>trades</th><th>win</th><th>PF</th><th>return</th><th>max DD</th><th>trades</th><th>win</th><th>PF</th><th>return</th><th>max DD</th><th>verdict</th></tr>` +
      res.map(r => `<tr><td>${E.STRATEGIES[r.name].name}</td>${c(r.train)}${c(r.test)}<td><span class="tag ${r.pass ? "pass" : "fail"}">${r.pass ? "PASS" : "fail"}</span></td></tr>`).join("");
    // equity curves of the TEST period
    const cv = $("eq"), dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = 200; cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext("2d"); g.scale(dpr, dpr); g.fillStyle = "#0b1220"; g.fillRect(0, 0, W, H);
    let mx = 1.02, mn = 0.98; res.forEach(r => (r.test.equity || []).forEach(v => { mx = Math.max(mx, v); mn = Math.min(mn, v); }));
    const yy = v => 10 + (H - 40) * (mx - v) / (mx - mn);
    g.strokeStyle = "#334155"; g.beginPath(); g.moveTo(0, yy(1)); g.lineTo(W, yy(1)); g.stroke();
    res.forEach((r, k) => { const e = [1].concat(r.test.equity || []); if (e.length < 2) return; g.strokeStyle = COLORS[k]; g.lineWidth = 2; g.beginPath();
      e.forEach((v, i) => { const xx = 10 + (W - 20) * i / (e.length - 1); i ? g.lineTo(xx, yy(v)) : g.moveTo(xx, yy(v)); }); g.stroke();
      g.fillStyle = COLORS[k]; g.font = "11px system-ui"; g.fillText(E.STRATEGIES[r.name].name, 10 + k * Math.min(170, (W - 20) / 5), H - 10); });
    const best = res.filter(r => r.pass).sort((a, b) => b.test.profit_factor - a.test.profit_factor)[0];
    $("btVerdict").innerHTML = best
      ? `✅ Best strategy that passed both periods: <b>${E.STRATEGIES[best.name].name}</b>. <button id="useBest" class="pri">Use it for practice trading</button>
         <br>Next step: practise it for weeks and compare with these numbers.`
      : `❌ <b>No strategy passed</b> on ${label($("sym").value)} ${$("tf").value} with these settings. Don't trade this market/timeframe with them; try another timeframe or market.`;
    if (best) $("useBest").onclick = () => { $("ptStrat").value = best.name; draw(); showTab("pt"); log("practice strategy set to " + E.STRATEGIES[best.name].name); };
    log(`backtest ${label($("sym").value)} ${$("tf").value}: ${res.filter(r => r.pass).length} of 5 strategies passed`);
  }

  // ---------------------------------------------------------------- practice account
  const AKEY = () => "dbTrade.acct." + mode;
  let acct = null, auto = null;
  function loadAcct() { try { acct = JSON.parse(localStorage.getItem(AKEY())); } catch (e) {} if (!acct || !acct.pos) acct = { bal: 10000, start: 10000, pos: [], hist: [] }; }
  const saveAcct = () => localStorage.setItem(AKEY(), JSON.stringify(acct));
  const today = () => new Date().toDateString();
  const todayHist = () => acct.hist.filter(h => new Date(h.exitT).toDateString() === today());
  const lastPrice = {};
  function unreal(t) { const px = lastPrice[t.sym]; if (px == null) return 0; return (t.side === "buy" ? px - t.entry : t.entry - px) * t.units; }
  function blocked(manual) {
    const dayPL = todayHist().reduce((s, h) => s + h.pl, 0), dayStartBal = acct.bal - dayPL, lim = dayStartBal * (+$("ptDay").value || 0) / 100;
    if (lim > 0 && -dayPL >= lim) return `daily loss limit reached (${money(dayPL)} today, limit ${money(-lim)}); no new trades until tomorrow`;
    if (manual) return "";
    if (acct.pos.length >= (+$("ptOpen").value || 1)) return "max open trades reached";
    const tradesToday = acct.hist.filter(h => new Date(h.t).toDateString() === today()).length + acct.pos.filter(t => new Date(t.t).toDateString() === today()).length;
    if (tradesToday >= (+$("ptMaxDay").value || 1)) return "max trades per day reached";
    return "";
  }
  function openTrade(side, ci, sig, stratName, why) {
    const px = B.c[B.n - 1], a = B.atr[ci], slA = +$("btSl").value || 1.5, rr = +$("btRr").value || 2;
    let sl, tp;
    if (sig) { const shift = px - B.c[ci]; sl = sig.sl + shift; tp = sig.tp + shift; }
    else { sl = side === "buy" ? px - a * slA : px + a * slA; tp = side === "buy" ? px + a * slA * rr : px - a * slA * rr; }
    const dist = Math.abs(px - sl); if (!(dist > 0)) return;
    const riskMoney = acct.bal * (+$("ptRisk").value || 1) / 100, units = riskMoney / dist;
    const t = { id: Date.now(), sym: $("sym").value, tf: $("tf").value, side, units, entry: px, sl, tp, risk: dist, riskMoney, atr: a, be: false, t: Date.now(), strat: stratName, why };
    acct.pos.push(t); lastPrice[t.sym] = px; saveAcct();
    log(`OPEN ${side.toUpperCase()} ${label(t.sym)} at ${fmt(px)} · SL ${fmt(sl)} · TP ${fmt(tp)} · risk ${money(riskMoney)} (${stratName})`);
    renderAccount(); draw();
  }
  function closeTrade(t, px, reason) {
    const cost = t.units * px * (+$("btCost").value || 0) / 100;
    const pl = (t.side === "buy" ? px - t.entry : t.entry - px) * t.units - cost;
    acct.bal += pl; acct.pos = acct.pos.filter(x => x.id !== t.id);
    acct.hist.push({ t: t.t, exitT: Date.now(), sym: t.sym, tf: t.tf, side: t.side, entry: t.entry, exit: px, units: t.units, pl, r: pl / t.riskMoney, strat: t.strat, reason });
    saveAcct(); log(`CLOSE ${t.side.toUpperCase()} ${label(t.sym)} at ${fmt(px)} (${reason}): ${pl >= 0 ? "+" : ""}${money(pl)}`);
  }
  function managePositions() {
    if (B) lastPrice[$("sym").value] = B.c[B.n - 1];
    const trail = +$("ptTrail").value || 0;
    for (const t of acct.pos.slice()) {
      const px = lastPrice[t.sym]; if (px == null) continue;
      const buy = t.side === "buy";
      if (buy ? px <= t.sl : px >= t.sl) { closeTrade(t, t.sl, t.be ? "stop (break-even/trail)" : "stop-loss"); continue; }
      if (buy ? px >= t.tp : px <= t.tp) { closeTrade(t, t.tp, "take-profit"); continue; }
      const moved = buy ? px - t.entry : t.entry - px;
      if (!t.be && moved >= (+$("btBe").value || 1) * t.risk) { t.sl = t.entry; t.be = true; log(`${label(t.sym)}: stop moved to break-even`); saveAcct(); }
      if (t.be && trail > 0) { const ns = buy ? px - trail * t.atr : px + trail * t.atr; if (buy ? ns > t.sl : ns < t.sl) { t.sl = ns; saveAcct(); } }
    }
  }
  async function pollOtherPrices() {
    const syms = [...new Set(acct.pos.map(t => t.sym).filter(s => s !== $("sym").value))];
    if (!syms.length) return;
    try {
      const r = await fetch(`${DATA}ticker/price?symbols=${encodeURIComponent(JSON.stringify(syms))}`);
      (await r.json()).forEach(x => { lastPrice[x.symbol] = +x.price; });
      managePositions(); renderAccount();
    } catch (e) {}
  }
  function onNewBar(ci) {
    if (!auto) return;
    if (auto.sym !== $("sym").value || auto.tf !== $("tf").value) return;
    const p = Object.assign(params(), { longOnly: $("ptLong").checked }), sig = E.signalAt(B, auto.strat, ci, p);
    if (!sig) { $("ptState").textContent = `Auto ON: ${E.STRATEGIES[auto.strat].name} on ${label(auto.sym)} ${auto.tf}. Last bar ${new Date().toTimeString().slice(0, 5)}: no signal.`; return; }
    const why = blocked(false);
    if (why) { log(`signal ${sig.side.toUpperCase()} skipped: ${why}`); return; }
    openTrade(sig.side, ci, sig, E.STRATEGIES[auto.strat].name, sig.why);
  }
  function renderAccount() {
    if (!acct) return;
    const eqv = acct.bal + acct.pos.reduce((s, t) => s + unreal(t), 0), th = todayHist(), dayPL = th.reduce((s, h) => s + h.pl, 0);
    const wins = acct.hist.filter(h => h.pl > 0).length, tot = acct.hist.reduce((s, h) => s + h.pl, 0);
    const k = (l, v, c) => `<div>${l}<b class="${c || ""}">${v}</b></div>`;
    $("ptKpi").innerHTML = k("balance", money(acct.bal)) + k("equity", money(eqv), eqv >= acct.bal ? "up" : "dn") + k("today", money(dayPL), dayPL >= 0 ? "up" : "dn") +
      k("open trades", acct.pos.length) + k("closed trades", acct.hist.length) + k("win rate", acct.hist.length ? Math.round(100 * wins / acct.hist.length) + "%" : "–") +
      k("total P/L", money(tot), tot >= 0 ? "up" : "dn");
    $("ptPos").innerHTML = `<tr><th>market</th><th>side</th><th>entry</th><th>stop</th><th>target</th><th>now</th><th>P/L</th><th></th></tr>` +
      (acct.pos.map(t => { const u = unreal(t); return `<tr><td>${label(t.sym)}</td><td><span class="tag ${t.side}">${t.side.toUpperCase()}</span></td><td>${fmt(t.entry)}</td><td>${fmt(t.sl)}</td><td>${fmt(t.tp)}</td>
        <td>${fmt(lastPrice[t.sym])}</td><td class="${u >= 0 ? "up" : "dn"}">${money(u)}</td><td><button data-close="${t.id}">Close</button></td></tr>`; }).join("") ||
       `<tr><td colspan="8" class="mut">No open trades.</td></tr>`);
    $("ptHist").innerHTML = `<tr><th>closed</th><th>market</th><th>side</th><th>strategy</th><th>entry</th><th>exit</th><th>result</th><th>reason</th></tr>` +
      (acct.hist.slice(-30).reverse().map(h => `<tr><td>${new Date(h.exitT).toLocaleString()}</td><td>${label(h.sym)}</td><td>${h.side}</td><td>${h.strat}</td>
        <td>${fmt(h.entry)}</td><td>${fmt(h.exit)}</td><td class="${h.pl >= 0 ? "up" : "dn"}">${money(h.pl)} (${h.r >= 0 ? "+" : ""}${h.r.toFixed(2)}R)</td><td>${h.reason}</td></tr>`).join("") ||
       `<tr><td colspan="8" class="mut">No closed trades yet.</td></tr>`);
    if (B) { const ci = closedIdx(), a = B.atr[ci], slA = +$("btSl").value || 1.5, risk = acct.bal * (+$("ptRisk").value || 1) / 100;
      $("ptPreview").textContent = `Now: stop ${fmt(a * slA)} away, risk ${money(risk)} (${$("ptRisk").value}% of balance).`; }
  }

  // ---------------------------------------------------------------- UI wiring
  function showTab(t) {
    document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.t === t));
    ["sig", "bt", "pt", "help"].forEach(k => $("t_" + k).classList.toggle("hide", k !== t));
    if (t === "bt" && !$("btTable").innerHTML) runBacktest();
  }
  function setMode() {
    mode = location.hash === "#crypto" ? "crypto" : "forex";
    $("title").textContent = mode === "forex" ? "💱 Forex" : "₿ Crypto";
    $("swForex").classList.toggle("on", mode === "forex"); $("swCrypto").classList.toggle("on", mode === "crypto");
    $("sym").innerHTML = MARKETS[mode].map(m => `<option value="${m[0]}">${m[1]}</option>`).join("");
    $("btLong").checked = $("ptLong").checked = mode === "crypto";
    $("btCost").value = mode === "crypto" ? 0.1 : 0.02;
    if (auto) { auto = null; $("ptState").textContent = "Auto is off."; }
    loadAcct(); $("btTable").innerHTML = ""; loadHistory().then(() => { if (!$("t_bt").classList.contains("hide")) runBacktest(); });
  }
  $("ptStrat").innerHTML = Object.entries(E.STRATEGIES).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join("");
  $("stratHelp").innerHTML = "<ul>" + Object.values(E.STRATEGIES).map(s => `<li><b>${s.name}</b>: ${s.desc}</li>`).join("") + "</ul>";
  document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => showTab(b.dataset.t));
  window.addEventListener("hashchange", setMode);
  $("sym").onchange = $("tf").onchange = () => { if (auto) { auto = null; $("ptState").textContent = "Auto stopped (market changed)."; log("auto stopped: market or timeframe changed"); } $("btTable").innerHTML = ""; loadHistory(); };
  $("zoom").onchange = draw; $("ptStrat").onchange = draw; $("ptLong").onchange = draw;
  $("reload").onclick = loadHistory; $("btRun").onclick = runBacktest;
  ["calcBal", "calcRisk", "calcSl"].forEach(id => $(id).oninput = () => B && renderCalc(closedIdx()));
  window.addEventListener("resize", () => B && draw());
  $("ptStart").onclick = () => {
    if (!B) return;
    auto = { sym: $("sym").value, tf: $("tf").value, strat: $("ptStrat").value };
    $("ptState").innerHTML = `<b class="up">Auto ON</b>: ${E.STRATEGIES[auto.strat].name} on ${label(auto.sym)} ${auto.tf}. It checks each new closed bar. Keep this page open.`;
    log(`auto started: ${E.STRATEGIES[auto.strat].name} on ${label(auto.sym)} ${auto.tf}`);
  };
  $("ptStop").onclick = () => { auto = null; $("ptState").textContent = "Auto is off."; log("auto stopped"); };
  $("ptBuy").onclick = $("ptSell").onclick = e => {
    if (!B) return; const side = e.target.id === "ptBuy" ? "buy" : "sell", why = blocked(true);
    if (why) { log("trade refused: " + why); return; }
    openTrade(side, closedIdx(), null, "manual", "manual " + side);
  };
  $("ptPos").onclick = e => { const id = e.target.dataset.close; if (!id) return; const t = acct.pos.find(x => String(x.id) === id); if (t) { closeTrade(t, lastPrice[t.sym] ?? t.entry, "closed by you"); renderAccount(); draw(); } };
  $("ptReset").onclick = () => { if (confirm("Reset the practice account to $10,000 and delete its history?")) { acct = { bal: 10000, start: 10000, pos: [], hist: [] }; saveAcct(); renderAccount(); draw(); log("practice account reset"); } };
  $("ptCsv").onclick = () => {
    const rows = [["opened", "closed", "market", "timeframe", "side", "strategy", "entry", "exit", "units", "P/L", "R", "reason"]].concat(acct.hist.map(h =>
      [new Date(h.t).toISOString(), new Date(h.exitT).toISOString(), label(h.sym), h.tf, h.side, h.strat, h.entry, h.exit, h.units, h.pl.toFixed(2), h.r.toFixed(3), h.reason]));
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" }));
    a.download = `digitbot-${mode}-practice.csv`; document.body.appendChild(a); a.click(); a.remove();
  };
  if (/embed=1/.test(location.search)) document.querySelector("header a").style.display = "none";   // inside the Digit Bot window
  setInterval(refreshLatest, 15000); setInterval(pollOtherPrices, 6000);
  setMode();
  window.__trade = { get B() { return B; }, get acct() { return acct; }, runBacktest, openTrade, managePositions, lastPrice, closedIdx, onNewBar, setAuto: a => { auto = a; } };
})();
