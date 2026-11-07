/* DigitBot cloud alerts: runs on GitHub every 15 minutes (see .github/workflows/cloud-alerts.yml), even when all your devices are off.
   - 📡 trade ideas: the same strategies and the same PASS backtest rule as the Finder, on the markets in cloud-alerts.json,
     sent once when a candle closes with a signal (entry, stop-loss, take-profit, reward:risk, backtest).
   - 📰 news warnings: high-impact news coming up for those markets.
   Needs two repository secrets: TG_TOKEN (your Telegram bot token) and TG_CHAT (your chat id). Without them it does nothing. */
"use strict";
const fs = require("fs"), path = require("path");
const E = require(path.join(__dirname, "..", "engine.js"));
const TOKEN = process.env.TG_TOKEN, CHAT = process.env.TG_CHAT;
const ROOT = path.join(__dirname, "..");
const CFG = Object.assign({ crypto_top: 15, crypto: [], forex: ["EURUSDT", "XAUUSDT"], timeframes: ["1h", "4h"], strategies: "all",
  only_pass: true, with_trend: true, sl_atr: 1.5, rr: 2, news_minutes: 45, news_impact: ["High"], every_minutes: 15 },
  JSON.parse(fs.readFileSync(path.join(ROOT, "cloud-alerts.json"), "utf8")));
const TF_MS = { "15m": 9e5, "30m": 18e5, "1h": 36e5, "4h": 144e5, "1d": 864e5 };
const SPOT = "https://data-api.binance.vision/api/v3/", FUT = "https://fapi.binance.com/fapi/v1/";
const STABLE = /^(USDC|FDUSD|TUSD|USD1|RLUSD|USDP|DAI|BUSD|U|XUSD|BFUSD|EUR|AEUR|EURI|PAXG|XAUT|USDE|PYUSD)USDT$/;
const FUT_ONLY = /^(XAU|XAG|XPT|XPD|COPPER|CL|NATGAS)USDT$/;
const DRY = process.argv.includes("--dry");     // print instead of sending (for testing)
if (process.argv.includes("--loose")) Object.assign(CFG, { only_pass: false, with_trend: false });   // testing only

async function j(url) { const r = await fetch(url, { headers: { "User-Agent": "DigitBot-cloud/1.0" } }); if (!r.ok) throw new Error(url + " " + r.status); return r.json(); }
async function send(text) {
  if (DRY) { console.log("---- would send ----\n" + text); return; }
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, { method: "POST", body: new URLSearchParams({ chat_id: CHAT, text: "☁️ DigitBot cloud\n" + text, disable_web_page_preview: "true" }) });
  const res = await r.json(); if (!res.ok) console.log("telegram:", res.description);
}
const dec = p => p >= 1000 ? 2 : p >= 10 ? 3 : p >= 1 ? 4 : 6;
const fmt = p => (+p).toFixed(dec(p));
const name = s => s.replace(/USDT$/, "") + (FUT_ONLY.test(s) ? "/USD" : "/USDT");
function ccys(sym, crypto) {
  if (crypto || /^(XAU|XAG|XPT|XPD|COPPER|CL|NATGAS|PAXG)/.test(sym)) return ["USD"];
  let m = /^USDT([A-Z]{3})$/.exec(sym); if (m) return ["USD", m[1]];
  m = /^([A-Z]{3})USDT$/.exec(sym); return m ? [m[1], "USD"] : ["USD"];
}

(async () => {
  if ((!TOKEN || !CHAT) && !DRY) { console.log("TG_TOKEN / TG_CHAT secrets not set - nothing to do. See CLOUD-ALERTS.md."); return; }
  const wArg = process.argv.find(a => a.startsWith("--window=")), now = Date.now(), win = (wArg ? +wArg.split("=")[1] : CFG.every_minutes + 1) * 60e3;
  let cal = []; try { cal = JSON.parse(fs.readFileSync(path.join(ROOT, "calendar.json"), "utf8")).map(e => Object.assign(e, { ms: Date.parse(e.date) })); } catch (e) {}
  const markets = [];
  if (CFG.crypto_top > 0) {
    try {
      const t = await j(SPOT + "ticker/24hr");
      t.filter(x => /USDT$/.test(x.symbol) && !STABLE.test(x.symbol) && !/(UP|DOWN)USDT$/.test(x.symbol) && +x.count > 0)
        .sort((a, b) => +b.quoteVolume - +a.quoteVolume).slice(0, CFG.crypto_top).forEach(x => markets.push({ sym: x.symbol, crypto: true }));
    } catch (e) { console.log("top coins:", e.message); }
  }
  CFG.crypto.forEach(s => markets.some(m => m.sym === s) || markets.push({ sym: s, crypto: true }));
  CFG.forex.forEach(s => markets.push({ sym: s, crypto: false }));
  const strats = CFG.strategies === "all" ? Object.keys(E.STRATEGIES) : CFG.strategies.filter(k => E.STRATEGIES[k]);
  const p = { sl_atr: CFG.sl_atr, rr: CFG.rr, breakeven_r: 1, longOnly: false };
  const ideas = [];
  for (const m of markets) for (const tf of CFG.timeframes) {
    try {
      const k = (await j(`${FUT_ONLY.test(m.sym) ? FUT : SPOT}klines?symbol=${m.sym}&interval=${tf}&limit=1000`)).map(x => ({ t: x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5] }));
      if (k.length < 300) continue;
      const b = E.addAll(k); let ci = b.n - 1; while (ci > 0 && b.t[ci] + TF_MS[tf] > now) ci--;
      const closedAt = b.t[ci] + TF_MS[tf];
      if (now - closedAt > win) continue;                         // only candles that closed since the last run → each signal once
      const sig = strats.map(nm => [nm, E.signalAt(b, nm, ci, p)]).filter(x => x[1]); if (!sig.length) continue;
      const bt = E.backtestAll(b, p, b.c[b.n - 1] * (m.crypto ? 0.002 : 0.0004), 1), mv = E.marketView(b);
      for (const [nm, sg] of sig) {
        const r = bt.find(x => x.name === nm); if (CFG.only_pass && !(r && r.pass)) continue;
        if (CFG.with_trend && (sg.side === "buy" ? mv.score < 0 : mv.score > 0)) continue;
        const px = b.c[b.n - 1], sh = px - b.c[ci], sl = sg.sl + sh, tp = sg.tp + sh;
        const news = cal.find(e => CFG.news_impact.includes(e.impact) && ccys(m.sym, m.crypto).includes(e.country) && Math.abs(e.ms - now) < CFG.news_minutes * 60e3);
        const pct = v => { const q = (v - px) / px * 100; return (q >= 0 ? "+" : "") + q.toFixed(2) + "%"; };
        ideas.push(`${sg.side === "buy" ? "🟢 BUY" : "🔴 SELL"} ${name(m.sym)} (${tf})\nentry ≈ ${fmt(px)}\nstop-loss ${fmt(sl)} (${pct(sl)})\ntake-profit ${fmt(tp)} (${pct(tp)})\n` +
          `R:R 1:${(Math.abs(tp - px) / Math.abs(px - sl)).toFixed(1)} · ${E.STRATEGIES[nm].name}\nbacktest ${r && r.pass ? "PASS" : "not passed"}, PF ${r && r.test.trades ? Math.min(r.test.profit_factor, 99).toFixed(2) : "–"}, ${r ? r.test.trades : 0} trades` +
          (news ? `\n⚠️ news: ${news.country} ${news.title} ${news.ms > now ? "in " + Math.round((news.ms - now) / 60e3) + " min" : "just out"}` : ""));
      }
    } catch (e) { console.log(m.sym, tf, e.message); }
  }
  if (ideas.length) await send("📡 Trade ideas\n\n" + ideas.join("\n\n") + "\n\nNot advice. Practise first, keep risk small.");
  // 📰 high-impact news starting in the next run window (so each one is announced once, ~15-30 min ahead)
  const watch = new Set(markets.flatMap(m => ccys(m.sym, m.crypto)));
  const soon = cal.filter(e => CFG.news_impact.includes(e.impact) && watch.has(e.country) && e.ms > now + 15 * 60e3 && e.ms <= now + 15 * 60e3 + win);
  if (soon.length) await send("📰 High-impact news soon - prices can jump, the bots pause around it:\n" + soon.map(e => `• ${new Date(e.ms).toISOString().slice(11, 16)} UTC ${e.country} ${e.title}`).join("\n"));
  console.log(`checked ${markets.length} markets × ${CFG.timeframes.length} timeframes: ${ideas.length} ideas, ${soon.length} news warnings`);
})().catch(e => { console.error(e); process.exit(1); });
