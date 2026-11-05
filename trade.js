/* DigitBot Forex / Crypto web app: live Binance prices, chart, signals, backtest, practice (paper) trading. */
(function () {
  "use strict";
  const E = window.Engine, $ = id => document.getElementById(id), PC = window.DB_PC || null;
  const SET_DEF = { remember: true, tf: "1h", startView: "full", up: "#22c55e", down: "#ef4444", bg: "#0b1220", grid: true, utc: false,
                    sound: true, volume: 0.08, slAtr: 1.5, rr: 2, be: 1, risk: 1, trail: 2, dayLoss: 3, start: 10000, autoRef: true, watchN: 24 };
  let SET = Object.assign({}, SET_DEF); try { Object.assign(SET, JSON.parse(localStorage.getItem("dbSettings") || "{}")); } catch (e) {}
  const saveSet = () => localStorage.setItem("dbSettings", JSON.stringify(SET));
  let MY = {}; try { MY = JSON.parse(localStorage.getItem("dbMyStrats") || "{}"); } catch (e) {}
  Object.entries(MY).forEach(([id, d]) => { try { E.addCustom(id, d); } catch (e) {} });
  let favs = []; try { favs = JSON.parse(localStorage.getItem("dbFavs") || "[]"); } catch (e) {}
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
  const COLORS = ["#38bdf8", "#f59e0b", "#a78bfa", "#22c55e", "#f472b6", "#facc15", "#fb7185", "#2dd4bf", "#c084fc", "#94a3b8"];
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
  let again = false;
  async function loadHistory(silent) {
    if (loading) { if (!silent) again = true; return; }        // a newer request waits for the current one, then runs
    loading = true; lastLoad = Date.now();
    try { await loadHistory2(silent); } finally { loading = false; if (again) { again = false; loadHistory(); } }
  }
  async function loadHistory2(silent) {
    if (isMT5()) {
      if (!silent) $("px").textContent = "loading…";
      if (ws) { ws.onclose = null; ws.close(); ws = null; wsKey = ""; }
      try {
        const r = await mt5Candles(3000);
        bars = r.bars; if (!silent) lastClosedT = 0; recompute(true); if (!silent) fitChart(); mt5Alive = Date.now(); afterLoad(silent);
        if (!silent) log(`loaded ${bars.length} bars of ${label(r.sym)} ${r.tf} from MetaTrader 5`);
      } catch (e) { $("px").textContent = "no data"; bars = []; log("MetaTrader 5: " + e.message + (/not selected/.test(e.message) ? " - choose 'Forex – MetaTrader 5' in ⚡ Live trading and press Save" : "")); }
      return;
    }
    const sym = $("sym").value, tf = tfReq(), per = srcFor() === "futures" ? 1500 : 1000;
    if (!silent) $("px").textContent = "loading…";
    try {
      let all = [], end = null;
      for (let k = 0; k < 3 && all.length < 3000; k++) { const part = await klines(sym, tf, per, end); if (!part.length) break; all = part.concat(all); end = part[0].t - 1; if (part.length < per) break; }
      if (sym !== $("sym").value || tf !== tfReq()) { again = true; return; }
      bars = all.slice(-3000); if (!silent) lastClosedT = 0; recompute(true); if (!silent) fitChart(); connectWS(); afterLoad(silent);
      if (!silent) log(`loaded ${bars.length} bars of ${label(sym)} ${tf === "1s" ? "live 1-second" : tf} (Binance ${srcFor()})`);
    } catch (e) { if (!silent) { $("px").textContent = "no data"; log("could not load prices: " + e.message); } }
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
  const LW = window.LightweightCharts, TZL = new Date().getTimezoneOffset() * 60;
  const tsec = ms => isMT5() || SET.utc ? ms / 1000 : ms / 1000 - TZL;   // local time on the chart (MT5: broker time)
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
      layout: { background: { color: SET.bg }, textColor: "#94a3b8", panes: { separatorColor: "#334155", enableResize: true } },
      grid: { vertLines: { color: "#162033", visible: SET.grid }, horzLines: { color: "#162033", visible: SET.grid } }, crosshair: { mode: 0 },
      rightPriceScale: { borderColor: "#334155" }, timeScale: { borderColor: "#334155", timeVisible: true, rightOffset: 6 } });
    S.c = chart.addSeries(LW.CandlestickSeries, { upColor: SET.up, downColor: SET.down, borderVisible: false, wickUpColor: SET.up, wickDownColor: SET.down });
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
    chart.subscribeClick(pr => chartClick(pr));
    chart.priceScale("right").applyOptions({ mode: SET.logScale ? 1 : 0 });
    S.mkText = LW.createSeriesMarkers(S.c, []); S.dl = []; S.fib = [];
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
      (acct.orders || []).filter(o => o.sym === sym).forEach(o => add(o.price, o.side === "buy" ? "#38bdf8" : "#f472b6", `${o.side.toUpperCase()} ${o.type}`));
      (lines || []).filter(l => l.sym === sym).forEach(l => add(l.price, "#a3a3a3", "line"));
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
  function afterLoad(silent) { if (!silent && !$("t_bt").classList.contains("hide")) runBacktest(true); if (!silent) renderDrawings(); }
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
  function loadAcct() { try { acct = JSON.parse(localStorage.getItem(AKEY())); } catch (e) {} if (!acct || !acct.pos) acct = { bal: +SET.start || 10000, start: +SET.start || 10000, pos: [], hist: [] }; }
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
  function fillOrders() {
    if (!B || !acct.orders || !acct.orders.length) return;
    const sym = $("sym").value, px = B.c[B.n - 1];
    for (const o of acct.orders.slice()) {
      if (o.sym !== sym) continue;
      const hit = o.side === "buy" ? (o.type === "limit" ? px <= o.price : px >= o.price) : (o.type === "limit" ? px >= o.price : px <= o.price);
      if (!hit) continue;
      acct.orders = acct.orders.filter(x => x !== o); saveAcct();
      log(`order filled: ${o.side.toUpperCase()} ${o.type} ${label(sym)} at ${fmt(o.price)}`);
      notify(`${o.side.toUpperCase()} ${o.type} filled`, `${label(sym)} at ${fmt(px)} (practice)`);
      openTrade(o.side, closedIdx(), null, "order", `${o.type} order at ${fmt(o.price)}`);
    }
  }
  function managePositions() {
    if (B) lastPrice[$("sym").value] = B.c[B.n - 1];
    fillOrders();
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
    $("ptOrd").innerHTML = `<tr><th>market</th><th>order</th><th>price</th><th>now</th><th></th></tr>` + ((acct.orders || []).map((o, i) => `<tr><td>${label(o.sym)}</td>
      <td><span class="tag ${o.side}">${o.side.toUpperCase()} ${o.type}</span></td><td>${fmt(o.price)}</td><td>${fmt(lastPrice[o.sym])}</td><td><button data-ocancel="${i}">Cancel</button></td></tr>`).join("") ||
      `<tr><td colspan="5" class="mut">No pending orders. They fill while that market is on the chart.</td></tr>`);
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
    ["sig", "mk", "bt", "sb", "pt", "live", "st", "help"].forEach(k => $("t_" + k).classList.toggle("hide", k !== t));
    if (t === "live" && B) draw();
    if (t === "bt" && !$("btTable").innerHTML) runBacktest();
    if (t === "mk") marketTab(true);
  }
  function setMode() {
    mode = location.hash === "#crypto" ? "crypto" : "forex";
    $("title").textContent = mode === "forex" ? "💱 Forex" : "₿ Crypto";
    $("swForex").classList.toggle("on", mode === "forex"); $("swCrypto").classList.toggle("on", mode === "crypto");
    $("fxWrap").classList.toggle("hide", !(mode === "forex" && PC));
    const last = SET.remember ? JSON.parse(localStorage.getItem("dbLast." + mode) || "null") : null;
    if (last && mode === "crypto" && last.mtype && !pendingSym) $("mtype").value = last.mtype;
    if (last && last.extra) last.extra.forEach(x => { if (!extra.some(e => e[0] === x[0])) extra.push(x); });
    fillMarkets(pendingSym || (last && last.sym)); pendingSym = null;
    if (!tfSet) { tfSet = true; $("tf").value = (last && last.tf) || SET.tf; }
    else if (last && last.tf && SET.remember) $("tf").value = last.tf;
    $("otherWrap").style.display = mode === "crypto" ? "" : "none"; rememberLast();
    $("btLong").checked = $("ptLong").checked = mode === "crypto" && mtype() === "spot";
    $("mtWrap").style.display = mode === "crypto" ? "" : "none";
    $("btCost").value = mode === "crypto" ? 0.1 : 0.02;
    if (auto) { auto = null; $("ptState").textContent = "Auto is off."; }
    loadAcct(); $("btTable").innerHTML = ""; loadHistory().then(() => { if (!$("t_bt").classList.contains("hide")) runBacktest(); });
  }
  function refreshStrats() {
    const opts = (filter) => Object.entries(E.STRATEGIES).filter(([k, s]) => !filter || !s.custom).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join("");
    const keep = (id, html) => { const el = $(id); if (!el) return; const v = el.value; el.innerHTML = html; if ([...el.options].some(o => o.value === v)) el.value = v; else el.selectedIndex = 0; };
    keep("ptStrat", opts()); keep("stStrat", opts()); keep("lvStrat", opts(true)); keep("alStrat", `<option value="all">any strategy</option>` + opts());
    keep("scStrat", `<option value="all">all strategies</option>` + opts());
    $("stratHelp").innerHTML = "<ul>" + Object.values(E.STRATEGIES).map(s => `<li><b>${s.name}</b>: ${s.desc}</li>`).join("") + "</ul>";
  }
  $("ptStrat").innerHTML = Object.entries(E.STRATEGIES).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join("");
  $("stratHelp").innerHTML = "<ul>" + Object.values(E.STRATEGIES).map(s => `<li><b>${s.name}</b>: ${s.desc}</li>`).join("") + "</ul>";
  document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => showTab(b.dataset.t));
  window.addEventListener("hashchange", setMode);
  let pendingSym = null, tfSet = false;
  const rememberLast = () => { if (SET.remember) localStorage.setItem("dbLast." + mode, JSON.stringify({ sym: $("sym").value, tf: $("tf").value, mtype: $("mtype").value, extra })); };
  $("sym").onchange = $("tf").onchange = () => { watch(); rememberLast(); setTimeout(stRender, 0); tempLine = null; $("measure").classList.add("hide"); setTimeout(renderFavBtn, 0); if (auto) { auto = null; $("ptState").textContent = "Auto stopped (market changed)."; log("auto stopped: market or timeframe changed"); } $("btTable").innerHTML = ""; loadHistory(); };
  $("ptStrat").onchange = draw; $("ptLong").onchange = draw;
  $("mtype").onchange = () => { fillMarkets($("sym").value); rememberLast(); if (auto) { auto = null; $("ptState").textContent = "Auto stopped (market changed)."; } $("btTable").innerHTML = ""; loadHistory(); };
  function fillMarkets(keep) {
    const groups = {}, myFav = favs.filter(f => f.mode === mode && !!f.mt5 === isMT5());
    if (myFav.length) groups["⭐ Favourites"] = myFav.map(f => [f.sym, f.name]);
    myFav.forEach(f => { if (mode === "crypto" && !mlist().some(m => m[0] === f.sym)) extra.push([f.sym, f.name, "c", f.fut ? "" : "", "Your coins"]); }); mlist().forEach(m => (groups[m[4] || "Markets"] = groups[m[4] || "Markets"] || []).push(m));
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
  $("viewMode").value = localStorage.getItem("dbView") || SET.startView;
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
  function beep() { if (!SET.sound) return; try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; g.gain.value = +SET.volume || 0.08; o.connect(g); g.connect(a.destination); o.start(); setTimeout(() => { o.frequency.value = 1320; }, 150); setTimeout(() => { o.stop(); a.close(); }, 320); } catch (e) {} }
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
    const favRows = favs.filter(f => !f.mt5).map(f => Object.assign([f.sym, "⭐ " + f.name, "", f.mode === "forex" ? ((MARKETS.forex.find(m => m[0] === f.sym) || [])[3] || "") : (f.fut ? "fut" : ""), f.mode], { fav: true }));
    const isFut = m => m.fav ? m[3] === "fut" : mode === "crypto" ? mtype() === "futures" : m[3] === "fut";
    const list = favRows.concat(mlist().filter(m => !favRows.some(f => f[0] === m[0])).slice(0, +SET.watchN || 24)), spot = list.filter(m => !isFut(m)).map(m => m[0]), fut = list.map(m => m[0]).filter(s => !spot.includes(s));
    const got = {};
    try {
      if (spot.length) (await (await fetch(`${DATA}ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(spot))}&type=MINI`)).json()).forEach(x => got[x.symbol] = x);
      if (fut.length) await Promise.all(fut.map(async s => { try { got[s] = await (await fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${s}`)).json(); } catch (e) {} }));
    } catch (e) { return; }
    $("watch").innerHTML = list.map(m => { const x = got[m[0]]; if (!x || !x.lastPrice) return "";
      const c = +x.lastPrice, ch = (c - +x.openPrice) / +x.openPrice * 100;
      return `<div class="wl ${m[0] === $("sym").value ? "on" : ""}" data-sym="${m[0]}" data-mode="${m.fav ? m[4] : mode}"><span>${m[1]}</span><span><b>${fmt(c)}</b> <span class="${ch >= 0 ? "up" : "dn"}">${ch >= 0 ? "+" : ""}${ch.toFixed(2)}%</span></span></div>`; }).join("");
  }
  $("watch").onclick = e => { const r = e.target.closest(".wl"); if (!r) return;
    if (r.dataset.mode !== mode) { const f = favs.find(x => x.sym === r.dataset.sym) || {}; openMarket({ sym: r.dataset.sym, name: f.name || r.dataset.sym, mode: r.dataset.mode, futOnly: !!f.fut, where: "" }); return; }
    $("sym").value = r.dataset.sym; $("sym").onchange(); };
  setInterval(watch, 10000); setTimeout(watch, 1500);
  // ---- 🔎 search: every Binance USDT coin (spot + futures), forex, metals, energy, MT5 symbols
  let ALL = null, qSel = 0, qHits = [];
  const WORDS = { gold: "XAUUSDT", silver: "XAGUSDT", oil: "CLUSDT", crude: "CLUSDT", wti: "CLUSDT", gas: "NATGASUSDT", copper: "COPPERUSDT", platinum: "XPTUSDT",
                  palladium: "XPDUSDT", euro: "EURUSDT", eur: "EURUSDT", bitcoin: "BTCUSDT", ethereum: "ETHUSDT" };
  async function allMarkets() {
    if (ALL) return ALL;
    const list = [], seen = new Set(), add = x => { if (!seen.has(x.sym + (x.mt5 ? "5" : ""))) { seen.add(x.sym + (x.mt5 ? "5" : "")); list.push(x); } };
    MARKETS.crypto.forEach(m => add({ sym: m[0], name: m[1], mode: "crypto", where: m[3] === "so" ? "Crypto · spot only" : "Crypto · spot + futures" }));
    MARKETS.forex.forEach(m => add({ sym: m[0], name: m[1], mode: "forex", where: m[4] + (m[3] === "fut" ? " · futures" : "") }));
    if (PC) MARKETS.mt5.forEach(m => add({ sym: m[0], name: m[1], mode: "forex", mt5: true, where: "MetaTrader 5 (PC)" }));
    try {
      const [sp, fu] = await Promise.all([fetch(DATA + "ticker/price").then(r => r.json()), fetch("https://fapi.binance.com/fapi/v1/ticker/price").then(r => r.json()).catch(() => [])]);
      const px = {}, spot = new Set(sp.map(x => x.symbol)), fut = new Set(fu.map(x => x.symbol));
      sp.forEach(x => px[x.symbol] = +x.price); fu.forEach(x => { if (px[x.symbol] == null) px[x.symbol] = +x.price; });
      [...spot, ...fut].filter(s => /USDT$/.test(s) && !/^USDT/.test(s)).forEach(s => add({ sym: s, name: s.replace(/USDT$/, "") + "/USDT", mode: "crypto",
        where: spot.has(s) && fut.has(s) ? "Crypto · spot + futures" : spot.has(s) ? "Crypto · spot only" : "Crypto · futures only", futOnly: !spot.has(s) }));
      list.forEach(x => x.px = px[x.sym]);
    } catch (e) { /* offline: built-in lists only */ }
    return (ALL = list);
  }
  async function search() {
    const q = $("q").value.trim().toLowerCase(); if (!q) { $("qres").classList.add("hide"); return; }
    const list = await allMarkets(), w = WORDS[q];
    qHits = list.map(x => { const s = x.sym.toLowerCase(), n = x.name.toLowerCase();
      const sc = x.sym === w ? 9 : s === q || s === q + "usdt" ? 8 : s.startsWith(q) ? 6 : n.startsWith(q) ? 5 : n.includes(q) ? 4 : s.includes(q) ? 2 : 0;
      return { x, sc: sc ? sc + (MARKETS.crypto.concat(MARKETS.forex).some(m => m[0] === x.sym) ? 0.5 : 0) : 0 }; })
      .filter(h => h.sc > 0).sort((a, b) => b.sc - a.sc || a.x.sym.length - b.x.sym.length).slice(0, 14).map(h => h.x);
    qSel = 0; renderQ();
  }
  function renderQ() {
    $("qres").innerHTML = qHits.length ? qHits.map((x, i) => `<div class="r ${i === qSel ? "sel" : ""}" data-i="${i}"><span><b>${x.name}</b> <small>${x.sym}</small><br><small>${x.where}</small></span>
      <span style="text-align:right">${x.px ? fmt(x.px) : ""} <span class="fav" data-star="${i}" title="favourite">${favs.some(f => f.sym === x.sym && f.mode === x.mode && !!f.mt5 === !!x.mt5) ? "★" : "☆"}</span></span></div>`).join("") : `<div class="r mut">No market found. Coins must trade against USDT on Binance.</div>`;
    $("qres").classList.remove("hide");
  }
  function openMarket(x) {
    $("qres").classList.add("hide"); $("q").value = ""; $("q").blur();
    if (x.mode === "crypto") {
      if (!MARKETS.crypto.some(m => m[0] === x.sym) && !extra.some(m => m[0] === x.sym)) extra.push([x.sym, x.name, "c", x.futOnly ? "" : (x.where.includes("spot only") ? "so" : ""), "Your coins"]);
      if (x.futOnly) $("mtype").value = "futures"; else if (x.where.includes("spot only")) $("mtype").value = "spot";
    }
    if (PC && x.mode === "forex") $("fxsrc").value = x.mt5 ? "mt5" : "web";
    if (x.mode !== mode || (PC && x.mode === "forex" && isMT5() !== !!x.mt5)) { pendingSym = x.sym; if (x.mode !== mode) location.hash = "#" + x.mode; else setMode(); return; }
    fillMarkets(x.sym); $("sym").onchange(); log(`opened ${x.name} (${x.where})`);
  }
  let qT = 0;
  $("q").oninput = () => { clearTimeout(qT); qT = setTimeout(search, 120); };
  $("q").onkeydown = e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); qSel = Math.max(0, Math.min(qHits.length - 1, qSel + (e.key === "ArrowDown" ? 1 : -1))); renderQ(); }
    else if (e.key === "Enter" && qHits[qSel]) openMarket(qHits[qSel]);
    else if (e.key === "Escape") { $("qres").classList.add("hide"); $("q").blur(); }
  };
  $("qres").onmousedown = e => { const st = e.target.dataset.star; if (st != null) { e.preventDefault(); const x = qHits[+st]; toggleFav({ mode: x.mode, sym: x.sym, name: x.name, mt5: !!x.mt5, fut: !!x.futOnly }); renderQ(); return; }
    const r = e.target.closest(".r[data-i]"); if (r) { e.preventDefault(); openMarket(qHits[+r.dataset.i]); } };
  $("q").onblur = () => setTimeout(() => $("qres").classList.add("hide"), 150);
  $("q").onfocus = () => { allMarkets(); if ($("q").value) search(); };
  document.addEventListener("keydown", e => { if (e.key === "/" && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); $("q").focus(); } });
  // ---- ⚙️ settings page
  function applySettings(first) {
    ["btSl", "btRr", "btBe", "btRisk", "ptRisk", "ptTrail", "ptDay"].forEach((id, k) => { const v = [SET.slAtr, SET.rr, SET.be, SET.risk, SET.risk, SET.trail, SET.dayLoss][k]; if ($(id)) $(id).value = v; });
    $("autoRef").checked = !!SET.autoRef;
    if (!first) { buildChart(); if (B) { recompute(true); fitChart(); } }
  }
  function settingsPage() {
    const f = (k, l, type, extra2) => `<label>${l}<input data-k="${k}" type="${type}" ${type === "checkbox" ? (SET[k] ? "checked" : "") : `value="${SET[k]}"`} ${extra2 || ""}></label>`;
    const sel = (k, l, opts) => `<label>${l}<select data-k="${k}">${opts.map(([v, t]) => `<option value="${v}" ${String(SET[k]) === String(v) ? "selected" : ""}>${t}</option>`).join("")}</select></label>`;
    $("setBox").innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><h2>⚙️ Settings</h2><button id="setClose">✕ Close</button></div>
      <div class="note" style="margin-top:0">Saved in this browser and used every time you open the page.</div>
      <h3>Start-up</h3><div class="grid">
        ${f("remember", "Open the market and timeframe I used last", "checkbox")}
        ${sel("tf", "Default timeframe", [["1s", "Live (1 s)"], ["1m", "M1"], ["3m", "M3"], ["5m", "M5"], ["15m", "M15"], ["30m", "M30"], ["1h", "H1"], ["4h", "H4"], ["1d", "D1"]])}
        ${sel("startView", "Start in", [["full", "Full view"], ["mini", "Mini view"]])}
        ${f("autoRef", "Auto-refresh the history", "checkbox")}</div>
      <h3>Chart</h3><div class="grid">
        ${f("up", "Rising candles", "color")}${f("down", "Falling candles", "color")}${f("bg", "Background", "color")}
        ${f("grid", "Show grid lines", "checkbox")}${sel("utc", "Times shown in", [["false", "my local time"], ["true", "UTC"]])}</div>
      <h3>Strategies, backtest and practice trading</h3><div class="grid">
        ${f("slAtr", "Stop-loss (× ATR)", "number", 'step="0.1" min="0.3"')}${f("rr", "Take-profit (× stop)", "number", 'step="0.1" min="0.5"')}
        ${f("be", "Break-even at (R, 0 = off)", "number", 'step="0.5" min="0"')}${f("trail", "Trailing stop (× ATR, 0 = off)", "number", 'step="0.5" min="0"')}
        ${f("risk", "Risk per trade (%)", "number", 'step="0.1" min="0.1" max="5"')}${f("dayLoss", "Daily loss limit (%)", "number", 'step="0.5" min="0.5"')}
        ${f("start", "Practice account start ($)", "number", 'step="100" min="100"')}</div>
      <h3>Alerts</h3><div class="grid">
        ${f("sound", "Sound", "checkbox")}${sel("volume", "Volume", [["0.03", "quiet"], ["0.08", "normal"], ["0.2", "loud"]])}
        <label>Pop-up notifications<button id="setPerm">${"Notification" in window && Notification.permission === "granted" ? "✓ on" : "Turn on"}</button></label>
        <label>Test<button id="setTest">🔔 Play an alert</button></label></div>
      <h3>Side panel</h3><div class="grid">${sel("watchN", "Markets shown", [[8, "8"], [16, "16"], [24, "24"], [41, "all"]])}</div>
      <div class="row" style="margin-top:16px"><button id="setReset">Reset all settings</button><button class="pri" id="setDone">Done</button></div>`;
  }
  $("setBtn").onclick = () => { settingsPage(); $("setModal").classList.remove("hide"); };
  $("setModal").onclick = e => { if (e.target.id === "setModal" || e.target.id === "setClose" || e.target.id === "setDone") $("setModal").classList.add("hide");
    if (e.target.id === "setReset" && confirm("Put every setting back to the default?")) { SET = Object.assign({}, SET_DEF); saveSet(); applySettings(); settingsPage(); }
    if (e.target.id === "setPerm" && "Notification" in window) Notification.requestPermission().then(() => { settingsPage(); renderAlerts(); });
    if (e.target.id === "setTest") notify("Test alert", "this is how an alert looks and sounds"); };
  $("setModal").onchange = e => { const k = e.target.dataset.k; if (!k) return;
    let v = e.target.type === "checkbox" ? e.target.checked : e.target.type === "number" ? +e.target.value : e.target.value;
    if (k === "utc") v = v === "true"; if (k === "watchN") v = +v;
    SET[k] = v; saveSet();
    if (k === "startView") { localStorage.setItem("dbView", v); $("viewMode").value = v; applyView(); }
    if (k === "tf" && !SET.remember) { $("tf").value = v; $("tf").onchange(); }
    applySettings(); if (B) draw(); };
  applySettings(true);
  // ---- 🖱️ Screen Trader hand-off: open this market on a platform with the same timeframe + strategy
  const PLAT = [["binfut", "Binance Futures", "binance"], ["bindemo", "Binance Demo Trading (futures)", "binance"], ["binspot", "Binance Spot", "binance"],
                ["tv", "TradingView (Paper Trading or your broker)", "tradingview"], ["mt5web", "MetaTrader 5 Web", "mt5web"], ["tr", "Trade Republic (signals only)", "traderepublic"]];
  const TVMAP = { EURUSDT: "FX:EURUSD", XAUUSDT: "OANDA:XAUUSD", PAXGUSDT: "BINANCE:PAXGUSDT", XAGUSDT: "OANDA:XAGUSD", XPTUSDT: "OANDA:XPTUSD", XPDUSDT: "OANDA:XPDUSD",
                  CLUSDT: "TVC:USOIL", NATGASUSDT: "NYMEX:NG1!", COPPERUSDT: "COMEX:HG1!", XAUUSD: "OANDA:XAUUSD", XAGUSD: "OANDA:XAGUSD", US30: "TVC:DJI", NAS100: "NASDAQ:NDX" };
  const plainName = s => /^USDT/.test(s) ? "USD" + s.slice(4) : { XAUUSDT: "XAUUSD", XAGUSDT: "XAGUSD", XPTUSDT: "XPTUSD", XPDUSDT: "XPDUSD", CLUSDT: "USOIL", NATGASUSDT: "NATGAS",
                        COPPERUSDT: "COPPER", EURUSDT: "EURUSD", PAXGUSDT: "XAUUSD" }[s] || s;
  function stTarget(plat) {
    const s = $("sym").value, crypto = mode === "crypto", fx = !crypto;
    const fut = crypto ? mtype() === "futures" : market()[3] === "fut";
    switch (plat) {
      case "binfut": return (crypto || fut) && !/^USDT/.test(s) && !isMT5() ? { url: `https://www.binance.com/en/futures/${s}` } : null;
      case "bindemo": return (crypto || fut) && !/^USDT/.test(s) && !isMT5() ? { url: `https://demo.binance.com/en/futures/${s}` } : null;
      case "binspot": return !isMT5() && !(fx && fut) ? { url: `https://www.binance.com/en/trade/${/^USDT/.test(s) ? "USDT_" + s.slice(4) : s.replace(/USDT$/, "") + "_USDT"}` } : null;
      case "tv": { const t = TVMAP[s] || (isMT5() ? "FX:" + s : /^USDT/.test(s) ? "FX:USD" + s.slice(4) : `BINANCE:${s}${crypto && fut ? ".P" : ""}`);
                   return { url: `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(t)}` }; }
      case "mt5web": return { url: "https://trade.mql5.com/trade", symOverride: crypto ? s : plainName(s) };
      case "tr": return { url: "https://app.traderepublic.com/", symOverride: crypto ? s : plainName(s) };
    }
    return null;
  }
  const stInstalled = () => document.documentElement.dataset.dbst;
  function stRender() {
    const v = stInstalled();
    $("stStatus").innerHTML = v ? `✅ Screen Trader ${v} is installed in this browser.`
      : `⚠️ The Screen Trader is not installed in this browser (or Tampermonkey is off for this page). <a href="screen.html" target="_blank">Install it</a>, then reload this page.`;
    const cur = $("stPlat").value;
    $("stPlat").innerHTML = PLAT.map(([k, n]) => `<option value="${k}" ${stTarget(k) ? "" : "disabled"}>${n}${stTarget(k) ? "" : " - not for this market"}</option>`).join("");
    if (cur && stTarget(cur)) $("stPlat").value = cur; else $("stPlat").value = (PLAT.find(p => stTarget(p[0])) || PLAT[3])[0];
    const tf = $("tf").value === "1s" ? "1m" : $("tf").value;
    $("stWhat").innerHTML = `Opens <b>${label($("sym").value)}</b> on <b>${PLAT.find(p => p[0] === $("stPlat").value)[1]}</b> · timeframe <b>${tf}</b> · strategy <b>${E.STRATEGIES[$("stStrat").value].name}</b>` +
      ($("tf").value === "1s" ? " (live 1-second is too fast for trading: it uses 1 minute)" : "") + (stTarget($("stPlat").value).symOverride ? ` · market name for the bot: <b>${stTarget($("stPlat").value).symOverride}</b>` : "");
  }
  $("stStrat").innerHTML = Object.entries(E.STRATEGIES).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join("");
  $("stStrat").value = localStorage.getItem("dbStStrat") || "ema_pullback"; if (!$("stStrat").value) $("stStrat").selectedIndex = 0;
  $("stPlat").value = localStorage.getItem("dbStPlat") || "";
  $("stPlat").onchange = $("stStrat").onchange = () => { localStorage.setItem("dbStPlat", $("stPlat").value); localStorage.setItem("dbStStrat", $("stStrat").value); stRender(); };
  $("stGo").onclick = () => {
    const plat = $("stPlat").value, t = stTarget(plat); if (!t) return;
    const h = { site: PLAT.find(p => p[0] === plat)[2], tf: $("tf").value === "1s" ? "1m" : $("tf").value, strategy: $("stStrat").value, auto: $("stAuto").checked,
                label: label($("sym").value), from: mode === "crypto" ? "Crypto" : "Forex", symOverride: t.symOverride || null, risk: SET.risk,
                sizeUnit: plat === "mt5web" && mode === "forex" ? "lots" : "coin",
                custom: E.STRATEGIES[$("stStrat").value].custom ? E.STRATEGIES[$("stStrat").value].def : null };
    if (!stInstalled()) { if (!confirm("The Screen Trader doesn't seem to be installed in this browser. Open the platform anyway?")) return; }
    else window.dispatchEvent(new CustomEvent("dbst-handoff", { detail: JSON.stringify(h) }));
    log(`Screen Trader: opening ${h.label} on ${PLAT.find(p => p[0] === plat)[1]} (${h.tf}, ${E.STRATEGIES[h.strategy].name}${h.auto ? ", auto" : ""})`);
    window.open(t.url, "_blank", "noopener");
  };
  setTimeout(stRender, 800); setInterval(() => { if (!$("t_st").classList.contains("hide")) stRender(); }, 3000);
  // ---- right-click menu on the chart (like TradingView)
  let lines = []; try { lines = JSON.parse(localStorage.getItem("dbLines") || "[]"); } catch (e) {}
  let mouseY = null;
  $("lw").addEventListener("mousemove", e => { mouseY = e.clientY - $("lw").getBoundingClientRect().top; });
  const priceAtY = y => { if (!S.c || y == null) return null; const v = S.c.coordinateToPrice(y); return v > 0 ? +(+v).toPrecision(7) : null; };
  function hideMenu() { $("cmenu").classList.add("hide"); }
  function placeOrder(side, price) {
    const now = B.c[B.n - 1], type = side === "buy" ? (price < now ? "limit" : "stop") : (price > now ? "limit" : "stop");
    acct.orders = acct.orders || []; acct.orders.push({ sym: $("sym").value, side, type, price, t: Date.now() }); saveAcct();
    log(`practice order placed: ${side.toUpperCase()} ${type} ${label($("sym").value)} at ${fmt(price)}`); renderAccount(); draw();
  }
  function addAlertAt(price) {
    const now = B.c[B.n - 1], op = price >= now ? "above" : "below";
    alerts.push({ sym: $("sym").value, op, price, t: Date.now() }); saveAlerts(); log(`alert added: ${label($("sym").value)} ${op} ${fmt(price)}`);
  }
  function showMenu(x, y, price) {
    const sym = label($("sym").value), now = B ? B.c[B.n - 1] : 0, p = fmt(price);
    const bt = price < now ? "limit" : "stop", st = price > now ? "limit" : "stop";
    const items = [["reset", "⟲ Reset chart view", "Alt + R"], "-", ["copy", `Copy price ${p}`, ""], ["alert", `🔔 Add alert on ${sym} at ${p}`, "Alt + A"], "-",
                   ["sell", `⌄ Sell @ ${p} ${st} (practice)`, "Alt + Shift + S"], ["buy", `⌃ Buy @ ${p} ${bt} (practice)`, "Alt + Shift + B"],
                   ["line", `― Draw a line at ${p}`, ""], ["clearlines", "Remove my lines", ""], "-",
                   ["full", document.fullscreenElement ? "Exit full screen" : "⛶ Full screen", ""], ["settings", "⚙️ Settings…", ""]];
    $("cmenu").innerHTML = items.map(i => i === "-" ? "<hr>" : `<div class="i" data-c="${i[0]}"><span>${i[1]}</span><small>${i[2]}</small></div>`).join("");
    $("cmenu").dataset.price = price; $("cmenu").classList.remove("hide");
    const r = $("cmenu").getBoundingClientRect();
    $("cmenu").style.left = Math.min(x, innerWidth - r.width - 8) + "px"; $("cmenu").style.top = Math.min(y, innerHeight - r.height - 8) + "px";
    (document.fullscreenElement || document.body).appendChild($("cmenu"));
  }
  function menuAction(c, price) {
    hideMenu();
    if (c === "reset") { chart.timeScale().resetTimeScale(); chart.priceScale("right").applyOptions({ autoScale: true }); fitChart(); }
    else if (c === "copy") { navigator.clipboard && navigator.clipboard.writeText(String(price)); log(`copied ${price}`); }
    else if (c === "alert") addAlertAt(price);
    else if (c === "buy" || c === "sell") placeOrder(c, price);
    else if (c === "line") { lines.push({ sym: $("sym").value, price }); localStorage.setItem("dbLines", JSON.stringify(lines)); draw(); }
    else if (c === "clearlines") { lines = lines.filter(l => l.sym !== $("sym").value); localStorage.setItem("dbLines", JSON.stringify(lines)); draw(); }
    else if (c === "full") $("cFull").onclick();
    else if (c === "settings") $("setBtn").onclick();
  }
  $("lw").addEventListener("contextmenu", e => {
    const y = e.clientY - $("lw").getBoundingClientRect().top, price = priceAtY(y); if (!price || !B) return;
    e.preventDefault(); showMenu(e.clientX, e.clientY, price);
  });
  let pressT = 0;                                          // phones: long-press opens the menu
  $("lw").addEventListener("touchstart", e => { const t = e.touches[0]; clearTimeout(pressT);
    pressT = setTimeout(() => { const pr = priceAtY(t.clientY - $("lw").getBoundingClientRect().top); if (pr && B) showMenu(t.clientX, t.clientY, pr); }, 650); }, { passive: true });
  ["touchend", "touchmove"].forEach(ev => $("lw").addEventListener(ev, () => clearTimeout(pressT), { passive: true }));
  $("cmenu").addEventListener("click", e => { const i = e.target.closest("[data-c]"); if (i) menuAction(i.dataset.c, +$("cmenu").dataset.price); });
  document.addEventListener("mousedown", e => { if (!e.target.closest("#cmenu")) hideMenu(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") hideMenu();
    if (!e.altKey || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) || !B) return;
    const k = e.key.toLowerCase(), pr = priceAtY(mouseY) || B.c[B.n - 1];
    if (k === "r" && !e.shiftKey) { e.preventDefault(); menuAction("reset"); }
    else if (k === "a" && !e.shiftKey) { e.preventDefault(); menuAction("alert", pr); }
    else if (k === "b" && e.shiftKey) { e.preventDefault(); menuAction("buy", pr); }
    else if (k === "s" && e.shiftKey) { e.preventDefault(); menuAction("sell", pr); }
  });
  $("ptOrd").onclick = e => { const i = e.target.dataset.ocancel; if (i == null) return; const o = acct.orders.splice(+i, 1)[0]; saveAcct(); log(`order cancelled: ${o.side} ${o.type} at ${fmt(o.price)}`); renderAccount(); draw(); };
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
  $("ptReset").onclick = () => { if (confirm(`Reset the practice account to ${money(+SET.start || 10000)} and delete its history?`)) { acct = { bal: +SET.start || 10000, start: +SET.start || 10000, pos: [], hist: [] }; saveAcct(); renderAccount(); draw(); log("practice account reset"); } };
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
      if (E.STRATEGIES[$("lvStrat").value] && E.STRATEGIES[$("lvStrat").value].custom) return alert("Your own strategies run in the browser: use 🤖 Practice trading or the 🖱️ Screen Trader for them.");
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
  // ================================================================ ⭐ favourites
  function toggleFav(f) {
    const i = favs.findIndex(x => x.sym === f.sym && x.mode === f.mode && !!x.mt5 === !!f.mt5);
    if (i >= 0) favs.splice(i, 1); else favs.push(f);
    localStorage.setItem("dbFavs", JSON.stringify(favs)); renderFavBtn(); fillMarkets($("sym").value); watch();
    log(`${i >= 0 ? "removed from" : "added to"} favourites: ${f.name}`);
  }
  function renderFavBtn() { const on = favs.some(f => f.sym === $("sym").value && f.mode === mode && !!f.mt5 === isMT5()); $("favBtn").textContent = on ? "★" : "☆"; $("favBtn").title = on ? "Remove from favourites" : "Add to favourites"; }
  $("favBtn").onclick = () => toggleFav({ mode, sym: $("sym").value, name: label($("sym").value), mt5: isMT5(), fut: mode === "crypto" && mtype() === "futures" && !MARKETS.crypto.some(m => m[0] === $("sym").value) });
  setInterval(renderFavBtn, 1000);

  // ================================================================ 🖥️ focus view (extreme full screen) + A / L price scale
  function focusOn() {
    document.body.classList.add("focus"); renderFocus();
    const el = document.documentElement; if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
    log("focus view: Esc or F to leave");
  }
  function focusOff() { document.body.classList.remove("focus"); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
  $("cFocus").onclick = () => document.body.classList.contains("focus") ? focusOff() : focusOn();
  $("fbExit").onclick = focusOff;
  document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && document.body.classList.contains("focus")) document.body.classList.remove("focus"); });
  document.addEventListener("keydown", e => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "f" || e.key === "F") { e.preventDefault(); $("cFocus").onclick(); }
    if (e.key === "Escape") { if (document.body.classList.contains("focus")) focusOff(); setTool("cursor"); }
  });
  function renderFocus() {
    if (!document.body.classList.contains("focus") || !B) return;
    const p = B.c[B.n - 1]; $("fbName").textContent = label($("sym").value); $("fbPx").textContent = fmt(p); $("fbChg").innerHTML = $("chg").innerHTML;
    $("fbTf").innerHTML = ["1m", "5m", "15m", "1h", "4h", "1d"].map(t => `<button data-fbtf="${t}" class="${$("tf").value === t ? "pri" : ""}">${t}</button>`).join("");
  }
  $("fbTf").onclick = e => { const t = e.target.dataset.fbtf; if (t) { $("tf").value = t; $("tf").onchange(); renderFocus(); } };
  setInterval(renderFocus, 1000);
  const renderScale = () => { $("scA").classList.toggle("on", SET.autoScale !== false); $("scL").classList.toggle("on", !!SET.logScale); };
  $("scA").onclick = () => { SET.autoScale = true; saveSet(); chart.priceScale("right").applyOptions({ autoScale: true }); renderScale(); };
  $("scL").onclick = () => { SET.logScale = !SET.logScale; saveSet(); chart.priceScale("right").applyOptions({ mode: SET.logScale ? 1 : 0 }); renderScale(); };
  renderScale();

  // ================================================================ ✏️ drawing tools (saved per market + timeframe)
  let tool = "cursor", pend = null, drawHidden = false, drawings = {};
  try { drawings = JSON.parse(localStorage.getItem("dbDraw") || "{}"); } catch (e) {}
  const dKey = () => `${mode}|${$("sym").value}|${tfReq()}`;
  const myD = () => (drawings[dKey()] = drawings[dKey()] || []);
  const saveD = () => { localStorage.setItem("dbDraw", JSON.stringify(drawings)); renderDrawings(); };
  function setTool(t) { tool = t; pend = null; document.querySelectorAll("#dtools [data-tool]").forEach(b => b.classList.toggle("on", b.dataset.tool === t)); }
  $("dtools").onclick = e => {
    const t = e.target.closest("[data-tool]"); if (!t) return; const k = t.dataset.tool;
    if (k === "hide") { drawHidden = !drawHidden; t.classList.toggle("on", drawHidden); renderDrawings(); draw(); return; }
    if (k === "del") { if (confirm(`Delete your drawings on ${label($("sym").value)} ${$("tf").value}?`)) { drawings[dKey()] = []; lines = lines.filter(l => l.sym !== $("sym").value); localStorage.setItem("dbLines", JSON.stringify(lines)); saveD(); draw(); } return; }
    setTool(k); if (k === "measure") $("measure").classList.add("hide");
    if (k !== "cursor") log({ trend: "trend line: click two points", hline: "horizontal line: click a price", fib: "Fibonacci: click the swing low and the swing high", measure: "measure: click two points", text: "text: click where the note goes" }[k]);
  };
  const tfMs = () => TF_MS[tfReq()];
  const toMs = sec => (sec + (isMT5() || SET.utc ? 0 : TZL)) * 1000;
  function clickPoint(pr) {
    if (!pr || !pr.point || !S.c || !B) return null;
    const p = S.c.coordinateToPrice(pr.point.y); if (!(p > 0)) return null;
    let t = pr.time != null ? toMs(pr.time) : pr.logical != null ? B.t[0] + Math.round(pr.logical) * tfMs() : null;
    return t == null ? null : { t, p: +(+p).toPrecision(7) };
  }
  function chartClick(pr) {
    const pt = clickPoint(pr); if (!pt) return;
    if (tool === "cursor") { $("alPx").value = pt.p; return; }
    if (tool === "hline") { lines.push({ sym: $("sym").value, price: pt.p }); localStorage.setItem("dbLines", JSON.stringify(lines)); draw(); setTool("cursor"); return; }
    if (tool === "text") { const txt = prompt("Note text:"); if (txt) { myD().push({ type: "text", t: pt.t, p: pt.p, txt: txt.slice(0, 60) }); saveD(); } setTool("cursor"); return; }
    if (!pend) { pend = pt; log("now click the second point"); return; }
    const a = pend, b = pt; pend = null;
    if (tool === "trend" && a.t !== b.t) { myD().push({ type: "trend", t1: a.t, p1: a.p, t2: b.t, p2: b.p }); saveD(); }
    if (tool === "fib") { myD().push({ type: "fib", p1: a.p, p2: b.p }); saveD(); }
    if (tool === "measure") {
      const d = b.p - a.p, pc = d / a.p * 100, bars2 = Math.round(Math.abs(b.t - a.t) / tfMs()), hrs = Math.abs(b.t - a.t) / 36e5;
      $("measure").innerHTML = `📏 ${d >= 0 ? "+" : ""}${fmt(d)} (${pc >= 0 ? "+" : ""}${pc.toFixed(2)}%) · ${bars2} bars · ${hrs >= 48 ? (hrs / 24).toFixed(1) + " days" : hrs.toFixed(1) + " h"}`;
      $("measure").classList.remove("hide"); tempLine = [a, b]; renderDrawings();
    }
    setTool("cursor");
  }
  let tempLine = null;
  function renderDrawings() {
    if (!chart || !S.c) return;
    (S.dl || []).forEach(s => { try { chart.removeSeries(s); } catch (e) {} }); S.dl = [];
    (S.fib || []).forEach(l => { try { S.c.removePriceLine(l); } catch (e) {} }); S.fib = [];
    if (S.mkText) S.mkText.setMarkers([]);
    if (drawHidden) return;
    const seg = (a, b, color, w) => { if (a.t === b.t) return; const s = chart.addSeries(LW.LineSeries, { color, lineWidth: w || 2, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
      s.setData([a, b].sort((x, y) => x.t - y.t).map(x => ({ time: tsec(x.t), value: x.p }))); S.dl.push(s); };
    const mk = [];
    (drawings[dKey()] || []).forEach(d => {
      if (d.type === "trend") seg({ t: d.t1, p: d.p1 }, { t: d.t2, p: d.p2 }, "#facc15");
      if (d.type === "fib") [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].forEach(f => S.fib.push(S.c.createPriceLine({ price: d.p2 - (d.p2 - d.p1) * f, color: f === 0 || f === 1 ? "#94a3b8" : "#a78bfa", lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: `${(f * 100).toFixed(1)}%` })));
      if (d.type === "text") { const tb = Math.floor(d.t / tfMs()) * tfMs(); if (B && tb >= B.t[0] && tb <= B.t[B.n - 1]) mk.push({ time: tsec(tb), position: "aboveBar", color: "#e2e8f0", shape: "circle", text: d.txt }); }
    });
    if (tempLine) seg(tempLine[0], tempLine[1], "#fde68a", 1);
    if (S.mkText) S.mkText.setMarkers(mk.sort((x, y) => x.time - y.time));
  }

  // ================================================================ 🔥 market overview (both Crypto and Forex)
  const STABLE = /^(USDC|FDUSD|TUSD|USD1|RLUSD|USDP|DAI|BUSD|U|XUSD|BFUSD|EUR|AEUR|EURI|PAXG|XAUT|USDE|PYUSD)USDT$/;
  let mkLast = 0, delistCache = null;
  const row = (sym, name, a, b, cls, md) => `<tr data-open="${sym}" data-m="${md || mode}"><td>${name}</td><td>${a}</td><td class="${cls || ""}">${b}</td></tr>`;
  const pct = v => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
  const vol = v => v >= 1e9 ? (v / 1e9).toFixed(2) + " B" : v >= 1e6 ? (v / 1e6).toFixed(1) + " M" : (v / 1e3).toFixed(0) + " K";
  async function marketTab(force) {
    if (!force && Date.now() - mkLast < 60000) return; mkLast = Date.now();
    $("mkNote").textContent = "loading…";
    const cards = [];
    try {
      if (mode === "crypto") {
        const fut = mtype() === "futures";
        const all = await (await fetch(fut ? "https://fapi.binance.com/fapi/v1/ticker/24hr" : DATA + "ticker/24hr")).json();
        const t = all.filter(x => /USDT$/.test(x.symbol) && !STABLE.test(x.symbol) && !/(UP|DOWN|BULL|BEAR)USDT$/.test(x.symbol) && +x.quoteVolume > 2e6 && +x.count > 0)
          .map(x => ({ s: x.symbol, n: x.symbol.replace(/USDT$/, ""), ch: +x.priceChangePercent, v: +x.quoteVolume, p: +x.lastPrice, r: (+x.highPrice - +x.lowPrice) / +x.lowPrice * 100 }));
        const top = (arr, f, n) => arr.slice().sort(f).slice(0, n || 10);
        cards.push(["🚀 Best performers (24 h)", top(t, (a, b) => b.ch - a.ch).map(x => row(x.s, x.n, fmt(x.p), pct(x.ch), "up"))]);
        cards.push(["📉 Worst performers (24 h)", top(t, (a, b) => a.ch - b.ch).map(x => row(x.s, x.n, fmt(x.p), pct(x.ch), "dn"))]);
        cards.push(["💰 Most traded: where the action is", top(t, (a, b) => b.v - a.v).map(x => row(x.s, x.n, vol(x.v) + " $", pct(x.ch), x.ch >= 0 ? "up" : "dn"))]);
        cards.push(["⚠️ Most risky: biggest 24 h swings", top(t, (a, b) => b.r - a.r).map(x => row(x.s, x.n, "range " + x.r.toFixed(1) + "%", pct(x.ch), x.ch >= 0 ? "up" : "dn"))]);
        cards.push(["😌 Calmest big coins (smallest swings)", top(t.filter(x => x.v > 5e7), (a, b) => a.r - b.r).map(x => row(x.s, x.n, "range " + x.r.toFixed(1) + "%", pct(x.ch), x.ch >= 0 ? "up" : "dn"))]);
        // coins Binance is removing
        if (!delistCache || force) {
          delistCache = { fut: [], news: [] };
          try { const fi = await (await fetch("https://fapi.binance.com/fapi/v1/exchangeInfo")).json(), now = Date.now();
                delistCache.fut = fi.symbols.filter(s => s.contractType === "PERPETUAL" && s.status === "TRADING" && s.deliveryDate > now && s.deliveryDate < 4e12)
                  .map(s => ({ s: s.symbol, d: s.deliveryDate })).sort((a, b) => a.d - b.d); } catch (e) {}
          try { const a = await (await fetch("https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&catalogId=161&pageNo=1&pageSize=8")).json();
                delistCache.news = a.data.catalogs[0].articles.map(x => ({ title: x.title, url: "https://www.binance.com/en/support/announcement/detail/" + x.code, t: x.releaseDate })); } catch (e) {}
        }
        cards.push(["⛔ To be delisted / removed", delistCache.fut.map(x => row(x.s, x.s.replace(/USDT$/, ""), "futures end", new Date(x.d).toLocaleDateString(), "dn", "crypto"))
          .concat(delistCache.news.map(n => `<tr><td colspan="3"><a href="${n.url}" target="_blank" rel="noopener">${n.title.replace(/</g, "&lt;")}</a> <span class="mut">${new Date(n.t).toLocaleDateString()}</span></td></tr>`))]);
      } else {
        const list = MARKETS.forex, sp = list.filter(m => m[3] !== "fut").map(m => m[0]), fu = list.filter(m => m[3] === "fut").map(m => m[0]), got = {};
        (await (await fetch(`${DATA}ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(sp))}`)).json()).forEach(x => got[x.symbol] = x);
        await Promise.all(fu.map(async s => { try { got[s] = await (await fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${s}`)).json(); } catch (e) {} }));
        const t = list.filter(m => got[m[0]]).map(m => { const x = got[m[0]]; return { s: m[0], n: m[1], ch: +x.priceChangePercent, p: +x.lastPrice, r: (+x.highPrice - +x.lowPrice) / +x.lowPrice * 100 }; });
        cards.push(["🚀 Best performers (24 h)", t.slice().sort((a, b) => b.ch - a.ch).slice(0, 8).map(x => row(x.s, x.n, fmt(x.p), pct(x.ch), "up"))]);
        cards.push(["📉 Worst performers (24 h)", t.slice().sort((a, b) => a.ch - b.ch).slice(0, 8).map(x => row(x.s, x.n, fmt(x.p), pct(x.ch), "dn"))]);
        cards.push(["⚠️ Most risky: biggest 24 h swings", t.slice().sort((a, b) => b.r - a.r).slice(0, 8).map(x => row(x.s, x.n, "range " + x.r.toFixed(2) + "%", pct(x.ch), x.ch >= 0 ? "up" : "dn"))]);
        cards.push(["🕒 Forex sessions now", sessions()]);
      }
    } catch (e) { $("mkNote").textContent = "could not load: " + e.message; return; }
    $("mkGrid").innerHTML = cards.map(([h, rows]) => `<div class="box"><h3>${h}</h3><table>${rows.join("") || `<tr><td class="mut">nothing right now</td></tr>`}</table></div>`).join("");
    $("mkNote").textContent = `updated ${new Date().toTimeString().slice(0, 5)} · click a market to open it · it refreshes every minute while this tab is open`;
    news();
  }
  function sessions() {
    const h = new Date().getUTCHours() + new Date().getUTCMinutes() / 60, day = new Date().getUTCDay();
    const S2 = [["Sydney", 21, 6], ["Tokyo", 0, 9], ["London", 7, 16], ["New York", 12, 21]];
    const open = (a, b) => a < b ? h >= a && h < b : h >= a || h < b;
    const wk = day === 6 || (day === 0 && h < 21) || (day === 5 && h >= 21);
    return S2.map(([n, a, b]) => `<tr><td>${n}</td><td>${String(a).padStart(2, "0")}:00–${String(b).padStart(2, "0")}:00 UTC</td><td class="${!wk && open(a, b) ? "up" : "mut"}">${wk ? "weekend" : open(a, b) ? "OPEN" : "closed"}</td></tr>`)
      .concat([`<tr><td colspan="3" class="mut">Most movement: London + New York overlap (12:00–16:00 UTC).</td></tr>`]);
  }
  let newsFor = "";
  async function news() {
    const feed = mode === "crypto" ? "https://www.coindesk.com/arc/outboundfeeds/rss/" : "https://www.fxstreet.com/rss/news";
    if (newsFor === feed + Math.floor(Date.now() / 6e5)) return; newsFor = feed + Math.floor(Date.now() / 6e5);
    $("newsTitle").textContent = mode === "crypto" ? "📰 Crypto news" : "📰 Forex & commodities news";
    try {
      const j = await (await fetch("https://api.rss2json.com/v1/api.json?rss_url=" + encodeURIComponent(feed))).json();
      $("news").innerHTML = (j.items || []).slice(0, 12).map(it => `<div style="padding:5px 0;border-bottom:1px solid #1e293b"><a href="${it.link}" target="_blank" rel="noopener" style="color:#7dd3fc">${it.title.replace(/</g, "&lt;")}</a>
        <span class="mut" style="font-size:12px"> · ${new Date(it.pubDate.replace(" ", "T") + "Z").toLocaleString()}</span></div>`).join("") || "no news right now";
    } catch (e) { $("news").textContent = "news could not be loaded right now"; }
  }
  $("mkRefresh").onclick = () => marketTab(true);
  $("mkGrid").onclick = e => { const r = e.target.closest("tr[data-open]"); if (!r) return; const s = r.dataset.open, md = r.dataset.m;
    if (md === mode && mlist().some(m => m[0] === s)) { $("sym").value = s; $("sym").onchange(); }
    else openMarket({ sym: s, name: label(s) === s ? s.replace(/USDT$/, "") + "/USDT" : label(s), mode: md, where: md === "crypto" && mtype() === "futures" ? "Crypto · futures only" : "Crypto", futOnly: md === "crypto" && mtype() === "futures" });
    window.scrollTo({ top: 0, behavior: "smooth" }); };
  setInterval(() => { if (!$("t_mk").classList.contains("hide") && !document.hidden) marketTab(false); }, 15000);
  // 🎯 signal scanner
  $("scGo").onclick = async () => {
    const what = $("scWhat").value, tf = tfReq() === "1s" ? "1m" : tfReq(), strat = $("scStrat").value;
    let syms = [];
    if (what === "fav") syms = favs.filter(f => f.mode === mode && !f.mt5).map(f => f.sym);
    else if (mode === "crypto") { const all = await (await fetch(DATA + "ticker/24hr")).json();
      syms = all.filter(x => /USDT$/.test(x.symbol) && !STABLE.test(x.symbol) && !/(UP|DOWN)USDT$/.test(x.symbol)).sort((a, b) => +b.quoteVolume - +a.quoteVolume).slice(0, +what).map(x => x.symbol); }
    else syms = MARKETS.forex.map(m => m[0]);
    if (!syms.length) return alert("No markets to scan (add favourites first).");
    $("scTable").innerHTML = `<tr><td class="mut">scanning ${syms.length} markets on ${tf}…</td></tr>`;
    const out = [], p = Object.assign(params(), { longOnly: false });
    for (const s of syms) {
      try {
        const src = mode === "forex" ? ((MARKETS.forex.find(m => m[0] === s) || [])[3] === "fut" ? "fut" : "spot") : "spot";
        const r = await fetch(`${src === "fut" ? "https://fapi.binance.com/fapi/v1/" : DATA}klines?symbol=${s}&interval=${tf}&limit=1000`); if (!r.ok) continue;
        const k = (await r.json()).map(x => ({ t: x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5] }));
        if (k.length < 300) continue;
        const b = E.addAll(k); let ci = b.n - 1; while (ci > 0 && b.t[ci] + TF_MS[tf] > Date.now()) ci--;
        const names = strat === "all" ? Object.keys(E.STRATEGIES) : [strat];
        const bt = E.backtestAll(b, p, b.c[b.n - 1] * (mode === "crypto" ? 0.002 : 0.0004), 1);
        names.forEach(nm => { const sg = E.signalAt(b, nm, ci, p); if (sg) { const r2 = bt.find(x => x.name === nm); out.push({ s, nm, sg, pass: r2 && r2.pass, pf: r2 && r2.test.trades ? r2.test.profit_factor : 0 }); } });
        $("scTable").innerHTML = `<tr><td class="mut">scanning… ${syms.indexOf(s) + 1}/${syms.length}</td></tr>`;
      } catch (e) {}
    }
    out.sort((a, b) => (b.pass - a.pass) || (b.pf - a.pf));
    $("scTable").innerHTML = `<tr><th>market</th><th>signal</th><th>strategy</th><th>backtest here</th><th>why</th></tr>` + (out.map(o => `<tr data-open="${o.s}" data-m="${mode}" style="cursor:pointer"><td>${label(o.s) === o.s ? o.s.replace(/USDT$/, "") : label(o.s)}</td>
      <td><span class="tag ${o.sg.side}">${o.sg.side.toUpperCase()}</span></td><td>${E.STRATEGIES[o.nm].name}</td><td><span class="tag ${o.pass ? "pass" : "fail"}">${o.pass ? "PASS" : "fail"}</span> PF ${o.pf ? Math.min(o.pf, 99).toFixed(2) : "–"}</td><td class="mut" style="white-space:normal">${o.sg.why}</td></tr>`).join("")
      || `<tr><td class="mut">No signal on the last closed ${tf} candle in these markets. Try another timeframe or later.</td></tr>`);
    log(`scanner: ${out.length} signals in ${syms.length} markets (${out.filter(o => o.pass).length} with a PASS backtest)`);
  };
  $("scTable").onclick = e => { const r = e.target.closest("tr[data-open]"); if (r) { $("mkGrid").onclick({ target: r }); } };

  // ================================================================ 🛠️ strategy builder
  const SRCOPT = (sel, withNum) => Object.entries(E.SRC).filter(([k]) => withNum || k !== "num").map(([k, v]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${v[0]}</option>`).join("");
  const OPOPT = sel => Object.entries(E.OPS).map(([k, v]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${v}</option>`).join("");
  function condRow(c) {
    c = c || { a: "close", op: ">", b: "ema200", n: 50 };
    return `<div class="sbrow"><select data-f="a">${SRCOPT(c.a)}</select><select data-f="op">${OPOPT(c.op)}</select><select data-f="b">${SRCOPT(c.b, true)}</select>
      <input data-f="n" type="number" step="any" value="${c.n ?? 50}" style="width:80px;${c.b === "num" ? "" : "display:none"}"><button data-rm="1">✕</button></div>`;
  }
  const readConds = id => [...$(id).querySelectorAll(".sbrow")].map(r => ({ a: r.querySelector("[data-f=a]").value, op: r.querySelector("[data-f=op]").value, b: r.querySelector("[data-f=b]").value, n: +r.querySelector("[data-f=n]").value }));
  ["sbBuy", "sbSell"].forEach(id => {
    $(id).onclick = e => { if (e.target.dataset.rm) e.target.closest(".sbrow").remove(); };
    $(id).onchange = e => { if (e.target.dataset.f === "b") e.target.parentElement.querySelector("[data-f=n]").style.display = e.target.value === "num" ? "" : "none"; };
  });
  $("sbAddBuy").onclick = () => $("sbBuy").insertAdjacentHTML("beforeend", condRow());
  $("sbAddSell").onclick = () => $("sbSell").insertAdjacentHTML("beforeend", condRow({ a: "close", op: "<", b: "ema200" }));
  const TPL = {
    "RSI dip in up-trend": { buy: [{ a: "close", op: ">", b: "ema200" }, { a: "rsi", op: "xa", b: "num", n: 30 }], sell: [{ a: "close", op: "<", b: "ema200" }, { a: "rsi", op: "xb", b: "num", n: 70 }], sl_atr: 1.5, rr: 2 },
    "Golden cross": { buy: [{ a: "ema50", op: "xa", b: "ema200" }], sell: [{ a: "ema50", op: "xb", b: "ema200" }], sl_atr: 2, rr: 2.5 },
    "Breakout with trend": { buy: [{ a: "close", op: ">", b: "dc_hi" }, { a: "ema20", op: ">", b: "ema50" }], sell: [{ a: "close", op: "<", b: "dc_lo" }, { a: "ema20", op: "<", b: "ema50" }], sl_atr: 1.5, rr: 2 },
    "MACD zero-line cross": { buy: [{ a: "macd", op: "xa", b: "num", n: 0 }, { a: "close", op: ">", b: "ema50" }], sell: [{ a: "macd", op: "xb", b: "num", n: 0 }, { a: "close", op: "<", b: "ema50" }], sl_atr: 1.5, rr: 2 },
    "EMA 9/21 scalp (short timeframes)": { buy: [{ a: "ema9", op: "xa", b: "ema21" }, { a: "rsi", op: ">", b: "num", n: 50 }], sell: [{ a: "ema9", op: "xb", b: "ema21" }, { a: "rsi", op: "<", b: "num", n: 50 }], sl_atr: 1, rr: 1.5 },
  };
  $("sbTpl").innerHTML += Object.keys(TPL).map(k => `<option>${k}</option>`).join("");
  let sbEdit = null;
  function loadEditor(id, d) {
    sbEdit = id; d = d || { name: "", buy: [{ a: "close", op: ">", b: "ema200" }], sell: [], sl_atr: SET.slAtr, rr: SET.rr };
    $("sbName").value = d.name || ""; $("sbSl").value = d.sl_atr || 1.5; $("sbRr").value = d.rr || 2;
    $("sbBuy").innerHTML = (d.buy || []).map(condRow).join(""); $("sbSell").innerHTML = (d.sell || []).map(condRow).join("");
    $("sbMsg").textContent = id ? `editing "${d.name}"` : "";
  }
  $("sbTpl").onchange = () => { const k = $("sbTpl").value; if (k) loadEditor(null, Object.assign({ name: k }, JSON.parse(JSON.stringify(TPL[k])))); $("sbTpl").value = ""; };
  $("sbNew").onclick = () => loadEditor(null);
  function renderSbList() {
    const ids = Object.keys(MY);
    $("sbList").innerHTML = ids.length ? ids.map(id => `<div class="al" style="padding:6px 0"><span><b>⭐ ${MY[id].name}</b><br><span class="mut" style="font-size:12px">${E.STRATEGIES[id] ? E.STRATEGIES[id].desc : ""}</span></span>
      <span style="white-space:nowrap"><button data-sb="test" data-id="${id}">Test</button> <button data-sb="practise" data-id="${id}">Practise</button> <button data-sb="send" data-id="${id}">→ Platform</button>
      <button data-sb="edit" data-id="${id}">Edit</button> <button data-sb="del" data-id="${id}">✕</button></span></div>`).join("")
      : `<div class="mut">No strategies yet. Pick an example on the left, change it, and press Save.</div>`;
  }
  function testStrat(id) {
    if (!B) return;
    const res = E.backtestAll(B, params(), B.c[B.n - 1] * (+$("btCost").value || 0) / 100, +$("btRisk").value || 1);
    const r = res.find(x => x.name === id), c = s => s.trades ? `${s.trades} trades, win ${s.win_rate.toFixed(0)}%, PF ${Math.min(s.profit_factor, 99).toFixed(2)}, return ${pct(s.return_pct)}, max DD ${s.max_dd_pct.toFixed(1)}%` : "no trades";
    const best = res.filter(x => !E.STRATEGIES[x.name].custom && x.pass).length;
    $("sbResult").innerHTML = `<div class="box"><b>${E.STRATEGIES[id].name}</b> on ${label($("sym").value)} ${$("tf").value}: <span class="tag ${r.pass ? "pass" : "fail"}">${r.pass ? "PASS" : "fail"}</span>
      <br>TRAIN (older 70%): ${c(r.train)}<br>TEST (newest 30%, unseen): ${c(r.test)}
      <div class="note">${r.pass ? "It made money on both periods with enough trades. Next: practise it for weeks before real money." :
        "It did not pass here. Change the rules, the stop/target, or try another market or timeframe."} Built-in strategies that pass here: ${best}.</div></div>`;
    $("ptStrat").value = id; draw(); log(`tested ${E.STRATEGIES[id].name}: ${r.pass ? "PASS" : "fail"} (test PF ${r.test.trades ? r.test.profit_factor.toFixed(2) : "-"})`);
  }
  $("sbSave").onclick = () => {
    const d = { name: $("sbName").value.trim() || "My strategy", buy: readConds("sbBuy"), sell: readConds("sbSell"), sl_atr: +$("sbSl").value || 1.5, rr: +$("sbRr").value || 2 };
    if (!d.buy.length && !d.sell.length) return alert("Add at least one BUY or SELL condition.");
    const id = sbEdit || "my_" + Date.now().toString(36);
    MY[id] = d; localStorage.setItem("dbMyStrats", JSON.stringify(MY)); E.addCustom(id, d); sbEdit = id;
    refreshStrats(); renderSbList(); testStrat(id); $("sbMsg").textContent = `saved "${d.name}" - its BUY/SELL arrows are on the chart now`;
  };
  $("sbList").onclick = e => {
    const b = e.target.closest("[data-sb]"); if (!b) return; const id = b.dataset.id, k = b.dataset.sb;
    if (k === "edit") loadEditor(id, MY[id]);
    if (k === "test") testStrat(id);
    if (k === "del" && confirm(`Delete "${MY[id].name}"?`)) { delete MY[id]; localStorage.setItem("dbMyStrats", JSON.stringify(MY)); E.removeCustom(id); refreshStrats(); renderSbList(); }
    if (k === "practise") { $("ptStrat").value = id; showTab("pt"); $("ptStart").onclick(); }
    if (k === "send") { $("stStrat").value = id; showTab("st"); stRender(); }
  };
  loadEditor(null); renderSbList(); refreshStrats();

  buildChart();
  setMode();
  window.__trade = { get B() { return B; }, get acct() { return acct; }, get favs() { return favs; }, get drawings() { return drawings; }, chartClick, setTool, marketTab, testStrat, runBacktest, openTrade, managePositions, lastPrice, closedIdx, onNewBar, setAuto: a => { auto = a; } };
})();
