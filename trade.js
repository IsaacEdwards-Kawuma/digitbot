/* DigitBot Forex / Crypto web app: live Binance prices, chart, signals, backtest, practice (paper) trading. */
(function () {
  "use strict";
  const E = window.Engine, $ = id => document.getElementById(id), PC = window.DB_PC || null;
  const DATA = "https://data-api.binance.vision/api/v3/";
  const MARKETS = {
    forex: [["EURUSDT", "EUR/USD", "fx", "spot", "Forex"], ["USDTTRY", "USD/TRY (Turkish lira)", "fx", "spot", "Forex"], ["USDTZAR", "USD/ZAR (S. African rand)", "fx", "spot", "Forex"],
            ["USDTBRL", "USD/BRL (Brazilian real)", "fx", "spot", "Forex"], ["USDTMXN", "USD/MXN (Mexican peso)", "fx", "spot", "Forex"], ["USDTARS", "USD/ARS (Argentine peso)", "fx", "spot", "Forex"],
            ["USDTCOP", "USD/COP (Colombian peso)", "fx", "spot", "Forex"], ["USDTIDR", "USD/IDR (Indonesian rupiah)", "fx", "spot", "Forex"], ["USDTKZT", "USD/KZT (Kazakh tenge)", "fx", "spot", "Forex"],
            ["XAUUSDT", "Gold XAU/USD", "gold", "fut", "Metals & energy"], ["PAXGUSDT", "Gold (PAXG token)", "gold", "spot", "Metals & energy"], ["XAGUSDT", "Silver XAG/USD", "idx", "fut", "Metals & energy"],
            ["XPTUSDT", "Platinum XPT/USD", "idx", "fut", "Metals & energy"], ["XPDUSDT", "Palladium XPD/USD", "idx", "fut", "Metals & energy"], ["COPPERUSDT", "Copper", "idx", "fut", "Metals & energy"],
            ["CLUSDT", "Crude oil (WTI)", "idx", "fut", "Metals & energy"], ["NATGASUSDT", "Natural gas", "idx", "fut", "Metals & energy"]],
    crypto: [["BTCUSDT", "Bitcoin BTC"], ["ETHUSDT", "Ethereum ETH"], ["BNBUSDT", "BNB"], ["SOLUSDT", "Solana SOL"], ["XRPUSDT", "XRP"], ["DOGEUSDT", "Dogecoin DOGE"],
             ["ADAUSDT", "Cardano ADA"], ["TRXUSDT", "TRON TRX"], ["LINKUSDT", "Chainlink LINK"], ["AVAXUSDT", "Avalanche AVAX"], ["SUIUSDT", "Sui SUI"], ["LTCUSDT", "Litecoin LTC"],
             ["BCHUSDT", "Bitcoin Cash BCH"], ["XLMUSDT", "Stellar XLM"], ["DOTUSDT", "Polkadot DOT"], ["HBARUSDT", "Hedera HBAR"], ["NEARUSDT", "NEAR"], ["UNIUSDT", "Uniswap UNI"],
             ["AAVEUSDT", "Aave AAVE"], ["ATOMUSDT", "Cosmos ATOM"], ["ETCUSDT", "Ethereum Classic ETC"], ["FILUSDT", "Filecoin FIL"], ["APTUSDT", "Aptos APT"], ["ARBUSDT", "Arbitrum ARB"],
             ["OPUSDT", "Optimism OP"], ["INJUSDT", "Injective INJ"], ["ICPUSDT", "Internet Computer ICP"], ["TAOUSDT", "Bittensor TAO"], ["FETUSDT", "Fetch.ai FET"], ["RENDERUSDT", "Render"],
             ["WLDUSDT", "Worldcoin WLD"], ["ENAUSDT", "Ethena ENA"], ["ONDOUSDT", "Ondo ONDO"], ["HYPEUSDT", "Hyperliquid HYPE"], ["SEIUSDT", "Sei SEI"], ["TIAUSDT", "Celestia TIA"],
             ["POLUSDT", "Polygon POL"], ["ZECUSDT", "Zcash ZEC"], ["TRUMPUSDT", "TRUMP"], ["PEPEUSDT", "Pepe PEPE (spot only)", "c", "so"], ["SHIBUSDT", "Shiba Inu SHIB (spot only)", "c", "so"]].map(m => [m[0], m[1], m[2] || "c", m[3] || "", "Crypto"]),
    mt5: [["EURUSD", "EUR/USD", "fx"], ["GBPUSD", "GBP/USD", "fx"], ["USDJPY", "USD/JPY", "fx"], ["AUDUSD", "AUD/USD", "fx"], ["USDCAD", "USD/CAD", "fx"],
          ["USDCHF", "USD/CHF", "fx"], ["NZDUSD", "NZD/USD", "fx"], ["EURJPY", "EUR/JPY", "fx"], ["GBPJPY", "GBP/JPY", "fx"], ["XAUUSD", "Gold XAU/USD", "gold"],
          ["XAGUSD", "Silver XAG/USD", "idx"], ["US30", "Dow Jones (US30)", "idx"], ["NAS100", "Nasdaq (NAS100)", "idx"]],
  };
  const TF_MS = { "1s": 1e3, "1m": 6e4, "3m": 18e4, "5m": 3e5, "15m": 9e5, "30m": 18e5, "1h": 36e5, "4h": 144e5, "1d": 864e5 };
  const COLORS = ["#38bdf8", "#f59e0b", "#a78bfa", "#22c55e", "#f472b6"];
  let mode = location.hash === "#crypto" ? "crypto" : "forex";
  let bars = [], B = null, lastClosedT = 0, loading = false, lastFull = 0;
  const isMT5 = () => mode === "forex" && !!PC && $("fxsrc").value === "mt5";
  const mtype = () => mode === "crypto" ? $("mtype").value : isMT5() ? "mt5" : "spot";
  let extra = [];                                // coins typed in "Other coin"
  const mlist = () => isMT5() ? MARKETS.mt5 : mode === "crypto" ? MARKETS.crypto.filter(m => mtype() !== "futures" || m[3] !== "so").concat(extra) : MARKETS.forex;
  // where the prices come from: Binance Spot or Futures (1-second candles only exist on Spot)
  const dataSrc = () => isMT5() ? "mt5" : mode === "crypto" ? mtype() : (market()[3] === "fut" ? "futures" : "spot");
  const tfReq = () => { const tf = $("tf").value; if (tf !== "1s") return tf; return isMT5() || (mode === "forex" && dataSrc() === "futures") ? "1m" : "1s"; };
  const srcFor = () => tfReq() === "1s" ? "spot" : dataSrc();
  const restBase = () => srcFor() === "futures" ? "https://fapi.binance.com/fapi/v1/" : DATA;

  // ---------------------------------------------------------------- helpers
  const dec = p => p >= 1000 ? 2 : p >= 10 ? 3 : p >= 1 ? 5 : 6;
  const fmt = (p, d) => p == null || isNaN(p) ? "–" : (+p).toFixed(d == null ? dec(p) : d);
  const money = v => (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const market = () => mlist().find(m => m[0] === $("sym").value) || mlist()[0];
  const label = s => (MARKETS.forex.concat(MARKETS.crypto, MARKETS.mt5, extra).find(m => m[0] === s) || [s, s])[1];
  function log(msg) { const d = document.createElement("div"); d.textContent = new Date().toTimeString().slice(0, 8) + " " + msg; $("log").appendChild(d); $("log").scrollTop = 1e9; }
  const params = () => ({ sl_atr: +$("btSl").value || 1.5, rr: +$("btRr").value || 2, breakeven_r: +$("btBe").value, longOnly: $("btLong").checked });

  async function klines(sym, tf, limit, endTime) {
    const u = `${restBase()}klines?symbol=${sym}&interval=${tf}&limit=${limit}` + (endTime ? `&endTime=${endTime}` : "");
    const r = await fetch(u); if (!r.ok) throw new Error("price feed " + r.status);
    return (await r.json()).map(k => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
  }
  async function mt5Candles(n) {               // prices from MetaTrader 5, through the PC bot
    const sym = $("sym").value, tf = tfReq(), r = await api(`/api/candles?symbol=${sym}&tf=${tf}&n=${n}`);
    if (r.error) throw new Error(r.error);
    return { sym, tf, bars: r.bars.map(k => ({ t: k[0], o: k[1], h: k[2], l: k[3], c: k[4], v: k[5] })) };
  }
  let lastLoad = 0;
  async function loadHistory(silent) {
    if (loading) return; loading = true; lastLoad = Date.now();
    if (isMT5()) {
      if (!silent) $("px").textContent = "loading…";
      if (ws) { ws.onclose = null; ws.close(); ws = null; wsKey = ""; }
      try {
        const r = await mt5Candles(3000);
        bars = r.bars; if (!silent) lastClosedT = 0; recompute(true); if (!silent) fitChart(); mt5Alive = Date.now(); afterLoad(silent);
        if (!silent) log(`loaded ${bars.length} bars of ${label(r.sym)} ${r.tf} from MetaTrader 5`);
      } catch (e) { $("px").textContent = "no data"; bars = []; log("MetaTrader 5: " + e.message + (/not selected/.test(e.message) ? " - choose 'Forex – MetaTrader 5' in ⚡ Live trading and press Save" : "")); }
      loading = false; return;
    }
    const sym = $("sym").value, tf = tfReq(), per = srcFor() === "futures" ? 1500 : 1000;
    if (!silent) $("px").textContent = "loading…";
    try {
      let all = [], end = null;
      for (let k = 0; k < 3 && all.length < 3000; k++) { const part = await klines(sym, tf, per, end); if (!part.length) break; all = part.concat(all); end = part[0].t - 1; if (part.length < per) break; }
      if (sym !== $("sym").value || tf !== tfReq()) { loading = false; return; }
      bars = all.slice(-3000); if (!silent) lastClosedT = 0; recompute(true); if (!silent) fitChart(); connectWS(); afterLoad(silent);
      if (!silent) log(`loaded ${bars.length} bars of ${label(sym)} ${tf === "1s" ? "live 1-second" : tf} (Binance ${srcFor()})`);
    } catch (e) { if (!silent) { $("px").textContent = "no data"; log("could not load prices: " + e.message); } }
    loading = false;
  }
  let mt5Alive = 0;
  async function mt5Tick() {                    // MT5 has no browser feed: ask the PC bot every 2 s
    if (!isMT5() || loading || !bars.length) return;
    try {
      const r = await mt5Candles(3);
      if (r.sym !== $("sym").value || r.tf !== tfReq() || !isMT5()) return;
      const before = bars.length; r.bars.forEach(mergeBar); mt5Alive = Date.now();
      if (bars.length !== before || Date.now() - lastFull > 3000) recompute(true); else liveTick();
    } catch (e) { /* shown by the status line */ }
  }
  async function refreshLatest() {               // backup if the live feed is quiet
    if (isMT5()) return;
    if (loading || !bars.length || Date.now() - wsAlive < 20000) return;
    try {
      const sym = $("sym").value, tf = tfReq(), k = await klines(sym, tf, 3);
      if (sym !== $("sym").value || tf !== tfReq()) return;
      for (const x of k) mergeBar(x);
      recompute(true);
    } catch (e) { /* try again next time */ }
  }
  function mergeBar(x) {
    const last = bars[bars.length - 1];
    if (last && last.t === x.t) bars[bars.length - 1] = x;
    else if (!last || x.t > last.t) { bars.push(x); if (bars.length > 3200) bars.splice(0, bars.length - 3000); }
    else { const i = bars.findIndex(b => b.t === x.t); if (i >= 0) bars[i] = x; }
  }
  // ---------------------------------------------------------------- live feed (websocket): moves with every trade
  let ws = null, wsAlive = 0, wsN = 0, wsKey = "";
  function connectWS() {
    if (isMT5()) return;
    const sym = $("sym").value.toLowerCase(), tf = tfReq(), key = sym + tf + srcFor();
    if (ws && wsKey === key && ws.readyState <= 1) return;
    if (ws) { ws.onclose = null; ws.close(); }
    wsKey = key; wsN = 0;
    const url = srcFor() === "futures" ? `wss://fstream.binance.com/market/ws/${sym}@kline_${tf}` : `wss://data-stream.binance.vision/ws/${sym}@kline_${tf}`;
    ws = new WebSocket(url);
    ws.onmessage = m => {
      const k = JSON.parse(m.data).k; if (!k || wsKey !== key) return;
      wsAlive = Date.now(); wsN++;
      mergeBar({ t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v });
      if (k.x || Date.now() - lastFull > (tf === "1s" ? 1000 : 3000)) recompute(true); else liveTick();
    };
    ws.onclose = () => setTimeout(() => { if (wsKey === key) { ws = null; connectWS(); } }, 3000);
  }
  setInterval(() => {
    if (isMT5()) {
      const a = (Date.now() - mt5Alive) / 1000;
      $("live").innerHTML = mt5Alive && a < 10 ? `🟢 <b>live</b> · MetaTrader 5 feed (your broker's bid price, broker time) · updated ${a.toFixed(0)} s ago · <span class="pc">PC bot connected</span>`
        : `🟡 waiting for MetaTrader 5… (choose 'Forex – MetaTrader 5' in ⚡ Live trading, press Save, and keep MT5 open and logged in to a DEMO account)`;
      return;
    }
    const age = (Date.now() - wsAlive) / 1000;
    const note = $("tf").value === "1s" && tfReq() !== "1s" ? " · (1-second candles aren't available for this market: showing 1-minute)" : tfReq() === "1s" && mtype() === "futures" ? " · (1-second candles come from Binance Spot)" : "";
    $("live").innerHTML = wsAlive && age < 15 ? `🟢 <b>live</b> · ${srcFor() === "futures" ? "Binance Futures" : "Binance Spot"} feed · last update ${age.toFixed(0)} s ago${note}` +
      (PC ? ` · <span class="pc">PC bot connected</span>` : "") : `🟡 waiting for the live feed… (prices refresh every 15 s meanwhile)`;
  }, 1000);
  // the last bar is still forming; signals only use closed bars
  const closedIdx = () => { if (isMT5()) return Math.max(0, B.n - 2); const tfms = TF_MS[tfReq()]; let i = B.n - 1; while (i > 0 && B.t[i] + tfms > Date.now()) i--; return i; };

  function liveTick() {                          // cheap update between full recomputes
    const x = bars[bars.length - 1]; if (!x || !S.c) return;
    S.c.update(cbar(x)); if (S.vol) S.vol.update(vbar(x));
    $("px").textContent = fmt(x.c); lastPrice[$("sym").value] = x.c; managePositions(); checkAlerts(x.c);
    const nb = $("nowPx"); if (nb) nb.textContent = fmt(x.c);
  }
  function recompute() {
    lastFull = Date.now();
    B = E.addAll(bars);
    const i = B.n - 1, ci = closedIdx(), p = B.c[i];
    let j = i; while (j > 0 && B.t[j] > B.t[i] - 864e5) j--;
    const first = B.o[j], span = B.t[i] - B.t[j] >= 864e5 - TF_MS[tfReq()] ? "24h" : "on this chart";
    $("px").textContent = fmt(p);
    const ch = (p - first) / first * 100;
    $("chg").innerHTML = `<span class="${ch >= 0 ? "up" : "dn"}">${ch >= 0 ? "▲" : "▼"} ${ch.toFixed(2)}% (${span})</span>`;
    const v = E.marketView(B);
    $("bias").innerHTML = `<span class="tag ${v.score >= 25 ? "buy" : v.score <= -25 ? "sell" : "none"}">${v.bias} ${v.score > 0 ? "+" : ""}${v.score}</span>`;
    $("src").textContent = isMT5() ? "price from your MetaTrader 5 broker" : mode === "forex" ? `price from Binance ${$("sym").value} (follows ${label($("sym").value)})` : "live Binance price";
    $("view").innerHTML = `<b>${v.bias}</b> (score ${v.score}, from -100 to +100)<ul style="margin:4px 0 0">${v.notes.map(n => `<li>${n}</li>`).join("")}</ul>`;
    renderSignals(ci); renderCalc(ci); draw(); renderNow(ci, v, ch, span); checkAlerts(p);
    if (B.t[ci] !== lastClosedT) { const isNew = lastClosedT !== 0; lastClosedT = B.t[ci]; if (isNew) { onNewBar(ci); signalAlerts(ci); autoBacktest(); } }
    managePositions(); renderAccount();
  }

  // ---------------------------------------------------------------- chart (TradingView Lightweight Charts, free / open source)
  const LW = window.LightweightCharts, TZ = new Date().getTimezoneOffset() * 60;
  const tsec = ms => isMT5() ? ms / 1000 : ms / 1000 - TZ;   // local time on the chart (MT5: broker time)
  const cbar = x => ({ time: tsec(x.t), open: x.o, high: x.h, low: x.l, close: x.c });
  const vbar = x => ({ time: tsec(x.t), value: x.v, color: x.c >= x.o ? "rgba(34,197,94,.45)" : "rgba(239,68,68,.45)" });
  const IND = [["ema", "EMA 20/50/200", true], ["bb", "Bollinger", false], ["vol", "Volume", true], ["rsi", "RSI", true],
               ["macd", "MACD", false], ["sig", "Signals", true], ["pos", "My trades", true]];
  let chart = null, S = {}, posLines = [];
  function ind(k) { const el = $("in_" + k); return el ? el.checked : true; }
  $("inds").innerHTML = "Show:" + IND.map(([k, l, on]) => `<label><input type="checkbox" id="in_${k}" ${localStorage.getItem("dbInd." + k) ?? (on ? "1" : "") ? "checked" : ""}>${l}</label>`).join("");
  IND.forEach(([k]) => $("in_" + k).onchange = () => { localStorage.setItem("dbInd." + k, $("in_" + k).checked ? "1" : ""); buildChart(); recompute(true); });
  function buildChart() {
    if (chart) chart.remove();
    S = {}; posLines = [];
    chart = LW.createChart($("lw"), { autoSize: true,
      layout: { background: { color: "#0b1220" }, textColor: "#94a3b8", panes: { separatorColor: "#334155", enableResize: true } },
      grid: { vertLines: { color: "#162033" }, horzLines: { color: "#162033" } }, crosshair: { mode: 0 },
      rightPriceScale: { borderColor: "#334155" }, timeScale: { borderColor: "#334155", timeVisible: true, rightOffset: 6 } });
    S.c = chart.addSeries(LW.CandlestickSeries, { upColor: "#22c55e", downColor: "#ef4444", borderVisible: false, wickUpColor: "#22c55e", wickDownColor: "#ef4444" });
    const line = (col, pane = 0, w = 1.5, style = 0) => chart.addSeries(LW.LineSeries, { color: col, lineWidth: w, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, pane);
    if (ind("ema")) { S.e20 = line("#facc15"); S.e50 = line("#38bdf8"); S.e200 = line("#a78bfa"); }
    if (ind("bb")) { S.bbu = line("#94a3b8", 0, 1, 2); S.bbm = line("#64748b", 0, 1, 1); S.bbl = line("#94a3b8", 0, 1, 2); }
    if (ind("vol")) { S.vol = chart.addSeries(LW.HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false });
                      S.vol.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } }); }
    let pane = 1;
    if (ind("rsi")) { S.rsi = line("#f472b6", pane, 1.5); [70, 30].forEach(v => S.rsi.createPriceLine({ price: v, color: "#475569", lineStyle: 2, lineWidth: 1, axisLabelVisible: true, title: "" })); pane++; }
    if (ind("macd")) { S.mh = chart.addSeries(LW.HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane);
                       S.m = line("#38bdf8", pane, 1.5); S.ms = line("#f59e0b", pane, 1.2); pane++; }
    S.mk = LW.createSeriesMarkers(S.c, []);
    chart.subscribeClick(pr => { if (pr && pr.point && S.c) { const v = S.c.coordinateToPrice(pr.point.y); if (v > 0) $("alPx").value = +v.toPrecision(6); } });   // click = alert price
    const panes = chart.panes(); if (panes.length > 1) panes.slice(1).forEach(p => p.setHeight(110));
  }
  function fitChart() { if (chart) chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - 160), to: bars.length + 5 }); }
  function bollinger(c) {
    const up = [], mid = [], lo = [];
    for (let i = 0; i < c.length; i++) {
      if (i < 19) { up.push(NaN); mid.push(NaN); lo.push(NaN); continue; }
      let s = 0; for (let j = i - 19; j <= i; j++) s += c[j]; const m = s / 20;
      let q = 0; for (let j = i - 19; j <= i; j++) q += (c[j] - m) ** 2; const sd = Math.sqrt(q / 19);
      up.push(m + 2 * sd); mid.push(m); lo.push(m - 2 * sd);
    }
    return [up, mid, lo];
  }
  function draw() {
    if (!chart || !B) return;
    const pts = arr => { const o = []; for (let i = 0; i < B.n; i++) if (!isNaN(arr[i])) o.push({ time: tsec(B.t[i]), value: arr[i] }); return o; };
    S.c.setData(bars.map(cbar));
    if (S.e20) { S.e20.setData(pts(B.ema20)); S.e50.setData(pts(B.ema50)); S.e200.setData(pts(B.ema200)); }
    if (S.bbu) { const [u, m, l] = bollinger(B.c); S.bbu.setData(pts(u)); S.bbm.setData(pts(m)); S.bbl.setData(pts(l)); }
    if (S.vol) S.vol.setData(bars.map(vbar));
    if (S.rsi) S.rsi.setData(pts(B.rsi));
    if (S.m) { S.m.setData(pts(B.macd)); S.ms.setData(pts(B.macd_sig));
               S.mh.setData(pts(B.macd_hist).map(x => ({ ...x, color: x.value >= 0 ? "rgba(34,197,94,.6)" : "rgba(239,68,68,.6)" }))); }
    // strategy signals (the strategy chosen in Live or Practice)
    const mk = [];
    if (ind("sig")) {
      const strat = (PC && !$("t_live").classList.contains("hide") ? $("lvStrat").value : $("ptStrat").value) || "ema_pullback";
      const p = Object.assign(params(), { longOnly: mtype() === "spot" && mode === "crypto" ? $("ptLong").checked : false }), ci = closedIdx();
      for (let i = Math.max(210, ci - 400); i <= ci; i++) {
        const sg = E.signalAt(B, strat, i, p); if (!sg) continue;
        const buy = sg.side === "buy";
        mk.push({ time: tsec(B.t[i]), position: buy ? "belowBar" : "aboveBar", color: buy ? "#22c55e" : "#ef4444", shape: buy ? "arrowUp" : "arrowDown", text: buy ? "BUY" : "SELL" });
      }
    }
    S.mk.setMarkers(mk);
    // my trades: practice + live (PC) positions as lines
    posLines.forEach(l => S.c.removePriceLine(l)); posLines = [];
    alerts.filter(a => a.sym === $("sym").value).forEach(a => posLines.push(S.c.createPriceLine({ price: a.price, color: "#f59e0b", lineWidth: 1, lineStyle: 1, axisLabelVisible: true, title: "🔔 " + a.op })));
    if (ind("pos")) {
      const sym = $("sym").value, add = (price, color, title) => posLines.push(S.c.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title }));
      acct.pos.filter(x => x.sym === sym).forEach(x => { add(x.entry, "#e2e8f0", "practice " + x.side); add(x.sl, "#ef4444", "SL"); add(x.tp, "#22c55e", "TP"); });
      (liveOpen || []).filter(x => (x.symbol === sym || x.symbol.toUpperCase().startsWith(sym)) && x.venue === mtype()).forEach(x => {
        add(x.entry, "#38bdf8", `LIVE ${x.venue === "futures" ? (x.side === "buy" ? "LONG" : "SHORT") : x.side.toUpperCase()}`); add(x.sl, "#ef4444", "SL"); add(x.tp, "#22c55e", "TP"); });
    }
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
               : m[2] === "gold" ? `${(units / 100).toFixed(2)} lots (${units.toFixed(2)} oz)` : m[2] === "idx" ? `${units.toFixed(2)} units (contract sizes differ by broker)` : `${units.toFixed(units * px > 100 ? 4 : 2)} ${m[0].replace("USDT", "")}`;
    $("calcOut").innerHTML = `Risk ${money(risk)} with a stop ${fmt(dist)} away → size <b>${size}</b>, worth about ${money(units * px)}` +
      (units * px > bal ? ` <span class="dn">(more than the account: this needs leverage, which makes losses faster)</span>` : "");
  }

  // ---------------------------------------------------------------- backtest
  let lastBt = 0;
  function autoBacktest() { if (!$("t_bt").classList.contains("hide") && Date.now() - lastBt > 60000) runBacktest(true); }
  function afterLoad(silent) { if (!silent && !$("t_bt").classList.contains("hide")) runBacktest(true); }
  function runBacktest(quiet) {
    if (!B) return; lastBt = Date.now();
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
    if (quiet !== true) log(`backtest ${label($("sym").value)} ${$("tf").value}: ${res.filter(r => r.pass).length} of 5 strategies passed`);
    $("btVerdict").insertAdjacentHTML("beforeend", `<div class="note">Updated ${new Date().toTimeString().slice(0, 8)} · it refreshes by itself when a new candle closes.</div>`);
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
    ["sig", "bt", "pt", "live", "help"].forEach(k => $("t_" + k).classList.toggle("hide", k !== t));
    if (t === "live" && B) draw();
    if (t === "bt" && !$("btTable").innerHTML) runBacktest();
  }
  function setMode() {
    mode = location.hash === "#crypto" ? "crypto" : "forex";
    $("title").textContent = mode === "forex" ? "💱 Forex" : "₿ Crypto";
    $("swForex").classList.toggle("on", mode === "forex"); $("swCrypto").classList.toggle("on", mode === "crypto");
    $("fxWrap").classList.toggle("hide", !(mode === "forex" && PC));
    fillMarkets();
    $("otherWrap").style.display = mode === "crypto" ? "" : "none";
    $("btLong").checked = $("ptLong").checked = mode === "crypto" && mtype() === "spot";
    $("mtWrap").style.display = mode === "crypto" ? "" : "none";
    $("btCost").value = mode === "crypto" ? 0.1 : 0.02;
    if (auto) { auto = null; $("ptState").textContent = "Auto is off."; }
    loadAcct(); $("btTable").innerHTML = ""; loadHistory().then(() => { if (!$("t_bt").classList.contains("hide")) runBacktest(); });
  }
  $("ptStrat").innerHTML = Object.entries(E.STRATEGIES).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join("");
  $("stratHelp").innerHTML = "<ul>" + Object.values(E.STRATEGIES).map(s => `<li><b>${s.name}</b>: ${s.desc}</li>`).join("") + "</ul>";
  document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => showTab(b.dataset.t));
  window.addEventListener("hashchange", setMode);
  $("sym").onchange = $("tf").onchange = () => { watch(); if (auto) { auto = null; $("ptState").textContent = "Auto stopped (market changed)."; log("auto stopped: market or timeframe changed"); } $("btTable").innerHTML = ""; loadHistory(); };
  $("ptStrat").onchange = draw; $("ptLong").onchange = draw;
  $("mtype").onchange = () => { fillMarkets($("sym").value); if (auto) { auto = null; $("ptState").textContent = "Auto stopped (market changed)."; } $("btTable").innerHTML = ""; loadHistory(); };
  function fillMarkets(keep) {
    const groups = {}; mlist().forEach(m => (groups[m[4] || "Markets"] = groups[m[4] || "Markets"] || []).push(m));
    $("sym").innerHTML = Object.entries(groups).map(([g, ms]) => `<optgroup label="${g}">${ms.map(m => `<option value="${m[0]}">${m[1]}</option>`).join("")}</optgroup>`).join("") +
      (mode === "forex" && !isMT5() ? `<optgroup label="More forex (GBP, JPY, AUD, CHF…)"><option disabled>use MetaTrader 5 (PC app) for these</option></optgroup>` : "");
    if (keep && [...$("sym").options].some(o => o.value === keep)) $("sym").value = keep;
  }
  $("symOther").onkeydown = async e => {
    if (e.key !== "Enter") return;
    let s = $("symOther").value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""); if (!s) return; if (!/USDT$|USDC$|FDUSD$|BTC$/.test(s)) s += "USDT";
    try { await klines(s, "1h", 2); } catch (x) { return alert(`${s} was not found on Binance ${mtype()}.`); }
    if (!mlist().some(m => m[0] === s)) extra.push([s, s, "c", "", "Your coins"]);
    fillMarkets(s); $("sym").onchange(); $("symOther").value = "";
  };
  // ---- view: full / mini, chart size, full screen
  const SIZES = [600, 760, 940, 440];
  let sizeI = +(localStorage.getItem("dbChartSize") || 0) % SIZES.length;
  const applySize = () => { $("lw").style.height = SIZES[sizeI] + "px"; $("cSize").textContent = sizeI === SIZES.length - 1 ? "⤢ Bigger chart" : sizeI === SIZES.length - 2 ? "⤡ Smaller chart" : "⤢ Bigger chart"; };
  $("cSize").onclick = () => { sizeI = (sizeI + 1) % SIZES.length; localStorage.setItem("dbChartSize", sizeI); applySize(); };
  $("cFull").onclick = () => { const c = $("chartbox"); document.fullscreenElement ? document.exitFullscreen() : (c.requestFullscreen || c.webkitRequestFullscreen).call(c); };
  document.addEventListener("fullscreenchange", () => { $("cFull").textContent = document.fullscreenElement ? "✕ Exit full screen" : "⛶ Full screen"; });
  $("cFit").onclick = fitChart;
  $("viewMode").value = localStorage.getItem("dbView") || "full";
  const applyView = () => { document.body.classList.toggle("mini", $("viewMode").value === "mini"); };
  $("viewMode").onchange = () => { localStorage.setItem("dbView", $("viewMode").value); applyView(); };
  applyView(); applySize();
  // ---- the "Now" box: price + every strategy's latest signal
  function renderNow(ci, v, ch, span) {
    const p = Object.assign(params(), { longOnly: false });
    const rows = Object.entries(E.STRATEGIES).map(([k, st]) => {
      let f = null; for (let i = ci; i > Math.max(210, ci - 30); i--) { const s = E.signalAt(B, k, i, p); if (s) { f = { i, s }; break; } }
      return `<div class="sig"><span>${st.name}</span>${f ? `<span><span class="tag ${f.s.side}">${f.s.side.toUpperCase()}</span> ${ci - f.i === 0 ? "now" : (ci - f.i) + " bars ago"}</span>` : `<span class="mut">–</span>`}</div>`;
    }).join("");
    $("sNow").innerHTML = `<div class="mut" style="font-size:12px">${label($("sym").value)} · ${$("tf").options[$("tf").selectedIndex].text}</div>
      <div class="big" id="nowPx">${fmt(B.c[B.n - 1])}</div><div><span class="${ch >= 0 ? "up" : "dn"}">${ch >= 0 ? "▲" : "▼"} ${ch.toFixed(2)}%</span> <span class="mut">${span}</span></div>
      <div style="margin:6px 0"><span class="tag ${v.score >= 25 ? "buy" : v.score <= -25 ? "sell" : "none"}">${v.bias} ${v.score > 0 ? "+" : ""}${v.score}</span></div>
      <div class="mut" style="font-size:11.5px;margin-bottom:3px">Latest signal (last 30 closed bars)</div>${rows}`;
  }
  // ---- alerts: price above/below and new strategy signals; sound + page toast + browser pop-up
  let alerts = []; try { alerts = JSON.parse(localStorage.getItem("dbAlerts") || "[]"); } catch (e) {}
  const saveAlerts = () => { localStorage.setItem("dbAlerts", JSON.stringify(alerts)); renderAlerts(); };
  $("alStrat").innerHTML = `<option value="all">any strategy</option>` + Object.entries(E.STRATEGIES).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join("");
  $("alSig").checked = localStorage.getItem("dbAlSig") === "1"; $("alStrat").value = localStorage.getItem("dbAlStrat") || "all";
  $("alSig").onchange = () => localStorage.setItem("dbAlSig", $("alSig").checked ? "1" : "");
  $("alStrat").onchange = () => localStorage.setItem("dbAlStrat", $("alStrat").value);
  function renderAlerts() {
    $("alList").innerHTML = alerts.length ? alerts.map((a, i) => `<div class="al"><span>${label(a.sym)} ${a.op} <b>${fmt(a.price)}</b></span><button data-al="${i}">✕</button></div>`).join("")
      : `<div class="mut" style="font-size:12px">No price alerts.</div>`;
    const ok = "Notification" in window && Notification.permission === "granted";
    $("alPerm").textContent = ok ? "✓ Pop-up notifications on" : "Turn on pop-up notifications"; $("alPerm").disabled = ok;
    if (B) draw();
  }
  $("alList").onclick = e => { const i = e.target.dataset.al; if (i != null) { alerts.splice(+i, 1); saveAlerts(); } };
  $("alAdd").onclick = () => {
    const price = +$("alPx").value; if (!(price > 0)) return alert("Type the alert price first.");
    const now = B ? B.c[B.n - 1] : price;
    $("alPx").value = "";
    if (($("alOp").value === "above" && now >= price) || ($("alOp").value === "below" && now <= price))
      return notify(`${label($("sym").value)} is already ${$("alOp").value} ${fmt(price)}`, `price now ${fmt(now)}`);
    alerts.push({ sym: $("sym").value, op: $("alOp").value, price, t: Date.now() }); saveAlerts();
    log(`alert added: ${label($("sym").value)} ${$("alOp").value} ${fmt(price)}`);
  };
  $("alPerm").onclick = () => { if ("Notification" in window) Notification.requestPermission().then(renderAlerts); else alert("This browser has no pop-up notifications; alerts still show here with a sound."); };
  function beep() { try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; g.gain.value = 0.08; o.connect(g); g.connect(a.destination); o.start(); setTimeout(() => { o.frequency.value = 1320; }, 150); setTimeout(() => { o.stop(); a.close(); }, 320); } catch (e) {} }
  function notify(title, body) {
    beep(); log(`🔔 ${title}: ${body}`);
    const d = document.createElement("div"); d.textContent = `🔔 ${title} - ${body}`; $("toast").appendChild(d); setTimeout(() => d.remove(), 9000);
    try { if ("Notification" in window && Notification.permission === "granted") new Notification("DigitBot: " + title, { body, tag: "db" + title + body }); } catch (e) {}
  }
  function checkAlerts(px) {
    const sym = $("sym").value; let hit = false;
    alerts = alerts.filter(a => { if (a.sym !== sym) return true; const f = a.op === "above" ? px >= a.price : px <= a.price;
      if (f) { notify(`${label(sym)} ${a.op} ${fmt(a.price)}`, `price now ${fmt(px)}`); hit = true; } return !f; });
    if (hit) saveAlerts();
  }
  function signalAlerts(ci) {
    if (!$("alSig").checked || !B) return;
    const p = Object.assign(params(), { longOnly: false }), which = $("alStrat").value;
    Object.entries(E.STRATEGIES).filter(([k]) => which === "all" || k === which).forEach(([k, st]) => {
      const s = E.signalAt(B, k, ci, p);
      if (s) notify(`${s.side.toUpperCase()} signal on ${label($("sym").value)} ${$("tf").value}`, `${st.name}: ${s.why}. Stop ${fmt(s.sl)}, target ${fmt(s.tp)}`);
    });
  }
  renderAlerts();
  // ---- watchlist: live prices of the other markets (click to open)
  async function watch() {
    if (isMT5() || document.hidden) { if (isMT5()) $("watch").innerHTML = `<div class="mut" style="font-size:12px">Your MetaTrader 5 markets are in the Market list.</div>`; return; }
    const list = mlist().slice(0, 24), spot = list.filter(m => (mode === "crypto" ? mtype() !== "futures" : m[3] !== "fut")).map(m => m[0]), fut = list.map(m => m[0]).filter(s => !spot.includes(s));
    const got = {};
    try {
      if (spot.length) (await (await fetch(`${DATA}ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(spot))}&type=MINI`)).json()).forEach(x => got[x.symbol] = x);
      if (fut.length) await Promise.all(fut.map(async s => { try { got[s] = await (await fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${s}`)).json(); } catch (e) {} }));
    } catch (e) { return; }
    $("watch").innerHTML = list.map(m => { const x = got[m[0]]; if (!x || !x.lastPrice) return "";
      const c = +x.lastPrice, ch = (c - +x.openPrice) / +x.openPrice * 100;
      return `<div class="wl ${m[0] === $("sym").value ? "on" : ""}" data-sym="${m[0]}"><span>${m[1]}</span><span><b>${fmt(c)}</b> <span class="${ch >= 0 ? "up" : "dn"}">${ch >= 0 ? "+" : ""}${ch.toFixed(2)}%</span></span></div>`; }).join("");
  }
  $("watch").onclick = e => { const r = e.target.closest(".wl"); if (r) { $("sym").value = r.dataset.sym; $("sym").onchange(); } };
  setInterval(watch, 10000); setTimeout(watch, 1500);
  // ---- auto-refresh: re-download the history now and then (the chart itself moves live)
  setInterval(() => { if (!$("autoRef").checked || loading || document.hidden) return;
    const per = ["1s", "1m", "3m", "5m"].includes($("tf").value) ? 120000 : 300000; if (Date.now() - lastLoad > per) loadHistory(true); }, 15000);
  // click the chart to put that price in the alert box
  $("fxsrc").onchange = () => { localStorage.setItem("dbFxSrc", $("fxsrc").value); setMode(); };
  if (PC && localStorage.getItem("dbFxSrc") === "mt5") $("fxsrc").value = "mt5";
  setInterval(mt5Tick, 2000);
  $("reload").onclick = loadHistory; $("btRun").onclick = runBacktest;
  ["calcBal", "calcRisk", "calcSl"].forEach(id => $(id).oninput = () => B && renderCalc(closedIdx()));

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
  // ---------------------------------------------------------------- ⚡ live trading through DigitBot.exe (only when opened from the PC app)
  var liveOpen = [];
  async function api(path, body) {
    const r = await fetch(path, { method: body ? "POST" : "GET", headers: { "X-DB-Token": PC.token, "Content-Type": "application/json" },
                                  body: body ? JSON.stringify(body) : undefined });
    return r.json();
  }
  if (PC) {
    $("tabLive").classList.remove("hide");
    $("lvStrat").innerHTML = Object.entries(E.STRATEGIES).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join("");
    let filled = false, lastSt = null, ccy = "USDT";
    const lvMoney = v => (v < 0 ? "-" : "") + Math.abs(v).toFixed(2) + " " + ccy;
    function lvShow() {                      // MT5 has no testnet/leverage choice; Binance has no MT5 note
      const m = $("lvMarket").value === "mt5";
      document.querySelectorAll(".bnOnly").forEach(e => e.classList.toggle("hide", m));
      document.querySelectorAll(".mt5Only").forEach(e => e.classList.toggle("hide", !m));
    }
    function chartToMarket(mk) {             // show the chart that matches the live market
      if (mk === "mt5") {
        if (mode !== "forex" || $("fxsrc").value !== "mt5") { $("fxsrc").value = "mt5"; localStorage.setItem("dbFxSrc", "mt5");
          if (location.hash !== "#forex") location.hash = "#forex"; else setMode(); }
      } else {
        if (mode !== "crypto") { $("mtype").value = mk; location.hash = "#crypto"; }
        else if ($("mtype").value !== mk) { $("mtype").value = mk; loadHistory(); }
      }
    }
    const chartMatches = () => lastSt && (lastSt.market === "mt5" ? isMT5() : mode === "crypto" && $("mtype").value === lastSt.market);
    function needMatch() {
      if (chartMatches()) return true;
      alert(lastSt && lastSt.market === "mt5" ? "Switch the chart to Forex with 'Prices from: MetaTrader 5' first (live trading is set to MetaTrader 5)."
        : `Live trading is set to Binance ${lastSt ? lastSt.market : ""}: switch the chart to Crypto › ${lastSt ? lastSt.market : ""} first (or change the market in Account and limits, then Save).`);
      return false;
    }
    async function poll() {
      let st; try { st = await api("/api/status"); } catch (e) { $("lvKpi").innerHTML = `<div>PC bot<b class="dn">not reachable</b></div>`; return; }
      liveOpen = st.open || []; lastSt = st; ccy = st.ccy || "USDT";
      if (!filled) {
        filled = true; const s = st.settings;
        $("lvMarket").value = s.market; lvShow();
        $("lvNet").value = s.testnet ? "1" : "0"; $("lvLev").value = String(s.leverage);
        $("lvRisk").value = s.risk_per_trade_pct; $("lvDay").value = s.max_daily_loss_pct; $("lvOpen").value = s.max_open_trades; $("lvMaxDay").value = s.max_trades_per_day;
        if (s.market === "mt5") chartToMarket("mt5");
        else if (mode === "crypto" && $("mtype").value !== s.market) { $("mtype").value = s.market; loadHistory(); }
      }
      $("lvWhere").textContent = st.market === "mt5" ? "in MetaTrader 5" : "on Binance";
      const k = (l, v, c) => `<div>${l}<b class="${c || ""}">${v}</b></div>`;
      const mt5 = st.market === "mt5";
      const keyOk = mt5 ? !!st.account : st.market === "futures" ? (st.mode === "LIVE" ? st.keys.live : st.keys.futures_testnet) : (st.mode === "LIVE" ? st.keys.live : st.keys.spot_testnet);
      $("lvKpi").innerHTML = k("money", st.mode, st.mode === "LIVE" ? "dn" : "up") + k("market", mt5 ? "MetaTrader 5" : st.market + (st.market === "futures" ? ` ${st.leverage}x` : "")) +
        k("equity", st.equity == null ? "–" : lvMoney(st.equity)) + k("available", st.available == null ? "–" : lvMoney(st.available)) +
        k("today", lvMoney(st.today_pl || 0), (st.today_pl || 0) >= 0 ? "up" : "dn") + k("open", liveOpen.length) +
        k("auto", st.auto ? `${st.auto.strategy} ${st.auto.symbol} ${st.auto.tf}` : "off", st.auto ? "up" : "") +
        (mt5 ? k("MT5 account", st.account ? `${st.account.login} demo` : "not connected", keyOk ? "up" : "dn") : k("API key", keyOk ? "set" : "missing", keyOk ? "up" : "dn"));
      $("lvAutoState").innerHTML = st.account_error ? `<span class="dn">Account: ${st.account_error}</span>` : (st.auto ? `<b class="up">AUTO ON</b> ${st.auto.passed ? "(strategy PASSED its backtest)" : `(untested strategy - ${st.mode} practice)`}` : "Auto is off.");
      $("lvPos").innerHTML = `<tr><th>market</th><th>side</th><th>size</th><th>entry</th><th>stop</th><th>target</th><th>P/L now</th><th>strategy</th><th></th></tr>` +
        (liveOpen.map(x => `<tr><td>${x.symbol} ${x.venue === "mt5" ? "MT5" : x.venue}${x.venue === "futures" ? " " + x.lev + "x" : ""}</td><td><span class="tag ${x.side}">${x.venue === "futures" ? (x.side === "buy" ? "LONG" : "SHORT") : x.side.toUpperCase()}</span></td>
          <td>${x.venue === "mt5" ? (+x.qty) + " lots" : (+x.qty).toPrecision(4)}</td><td>${fmt(x.entry)}</td><td>${fmt(x.sl)}</td><td>${fmt(x.tp)}</td><td class="${(x.upl || 0) >= 0 ? "up" : "dn"}">${x.upl == null ? "–" : lvMoney(x.upl)}</td>
          <td>${x.strategy}</td><td><button data-lvclose="${x.symbol}">Close</button></td></tr>`).join("") || `<tr><td colspan="9" class="mut">No open positions.</td></tr>`);
      $("lvHist").innerHTML = `<tr><th>closed</th><th>market</th><th>side</th><th>entry</th><th>exit</th><th>P/L</th><th>reason</th></tr>` +
        ((st.closed || []).slice().reverse().map(x => `<tr><td>${(x.closed || "").replace("T", " ")}</td><td>${x.symbol}</td><td>${x.side}</td><td>${fmt(x.entry)}</td><td>${fmt(x.exit)}</td>
          <td class="${x.pl >= 0 ? "up" : "dn"}">${lvMoney(x.pl || 0)}</td><td>${x.reason}</td></tr>`).join("") || `<tr><td colspan="7" class="mut">No closed trades yet.</td></tr>`);
      const L = $("lvLog"), atEnd = L.scrollTop + L.clientHeight >= L.scrollHeight - 5;
      L.innerHTML = (st.log || []).map(l => `<div>${l.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</div>`).join(""); if (atEnd) L.scrollTop = 1e9;
      if (B) draw();
    }
    poll(); setInterval(poll, 3000);
    $("lvMarket").onchange = lvShow;
    $("lvSave").onclick = async () => {
      const b = { market: $("lvMarket").value, testnet: $("lvNet").value === "1", leverage: +$("lvLev").value, risk_per_trade_pct: +$("lvRisk").value,
                  max_daily_loss_pct: +$("lvDay").value, max_open_trades: +$("lvOpen").value, max_trades_per_day: +$("lvMaxDay").value,
                  futures_testnet_key: $("lvFk").value.trim(), futures_testnet_secret: $("lvFs").value.trim(),
                  testnet_key: $("lvSk").value.trim(), testnet_secret: $("lvSs").value.trim() };
      if (b.market === "mt5") b.testnet = true;
      if (!b.testnet && !confirm("LIVE = REAL MONEY on Binance. Continue?")) return;
      await api("/api/settings", b); ["lvFk", "lvFs", "lvSk", "lvSs"].forEach(id => $(id).value = ""); filled = false;
      chartToMarket(b.market); setTimeout(() => { if (isMT5()) loadHistory(); }, 2500); poll();
    };
    $("lvAutoOn").onclick = () => {
      if (!needMatch()) return;
      if (["1s"].includes($("tf").value)) return alert("Auto trading needs 1-minute candles or longer. Pick M1 or more.");
      api("/api/auto", { on: true, symbol: $("sym").value, tf: $("tf").value, strategy: $("lvStrat").value, untested: $("lvUntested").checked });
    };
    $("lvAutoOff").onclick = () => api("/api/auto", { on: false });
    $("lvBuy").onclick = () => needMatch() && confirm(`BUY / LONG ${$("sym").value} now (${lastSt.mode})?`) && api("/api/order", { symbol: $("sym").value, side: "buy" });
    $("lvSell").onclick = () => needMatch() && confirm(`SELL / SHORT ${$("sym").value} now (${lastSt.mode})?`) && api("/api/order", { symbol: $("sym").value, side: "sell" });
    $("lvClose").onclick = () => confirm(`Close the bot's ${$("sym").value} position now?`) && api("/api/close", { symbol: $("sym").value });
    $("lvPos").onclick = e => { const s = e.target.dataset.lvclose; if (s && confirm(`Close ${s} now?`)) api("/api/close", { symbol: s }); };
    $("lvStrat").onchange = draw;
  }
  buildChart();
  setMode();
  window.__trade = { get B() { return B; }, get acct() { return acct; }, runBacktest, openTrade, managePositions, lastPrice, closedIdx, onNewBar, setAuto: a => { auto = a; } };
})();
