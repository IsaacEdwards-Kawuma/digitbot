/* DigitBot trading engine (browser + Node): indicators, strategies, backtest, stats.
   A faithful port of chart_bot/indicators.py, strategies.py and backtest.py, so results match the PC app.
   Bars: arrays {t, o, h, l, c}. Indicators are added as arrays on the returned object. */
(function (root) {
  "use strict";

  // ---------------------------------------------------------------- indicators (pandas-compatible)
  function ema(x, n) {                       // pandas ewm(span=n, adjust=False), skipping leading NaN
    const a = 2 / (n + 1), out = new Array(x.length).fill(NaN);
    let prev = NaN;
    for (let i = 0; i < x.length; i++) {
      const v = x[i];
      if (isNaN(v)) { out[i] = prev; continue; }
      prev = isNaN(prev) ? v : a * v + (1 - a) * prev;
      out[i] = prev;
    }
    return out;
  }
  function wilder(x, n) {                    // ewm(alpha=1/n, adjust=False)
    const a = 1 / n, out = new Array(x.length).fill(NaN);
    let prev = NaN;
    for (let i = 0; i < x.length; i++) {
      const v = x[i];
      if (isNaN(v)) { out[i] = prev; continue; }
      prev = isNaN(prev) ? v : a * v + (1 - a) * prev;
      out[i] = prev;
    }
    return out;
  }
  function rsi(c, n = 14) {
    const up = [NaN], dn = [NaN];
    for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1]; up.push(Math.max(d, 0)); dn.push(Math.max(-d, 0)); }
    const U = wilder(up, n), D = wilder(dn, n);
    return U.map((u, i) => { if (!(D[i] > 0) || isNaN(u)) return 50; const rs = u / D[i]; return 100 - 100 / (1 + rs); });
  }
  function atr(b, n = 14) {
    const tr = b.h.map((h, i) => i === 0 ? h - b.l[i]
      : Math.max(h - b.l[i], Math.abs(h - b.c[i - 1]), Math.abs(b.l[i] - b.c[i - 1])));
    return wilder(tr, n);
  }
  function rollMaxPrev(x, n) {               // rolling(n).max().shift(1)
    const out = new Array(x.length).fill(NaN);
    for (let i = n; i < x.length; i++) { let m = -Infinity; for (let j = i - n; j < i; j++) m = Math.max(m, x[j]); out[i] = m; }
    return out;
  }
  function rollMinPrev(x, n) {
    const out = new Array(x.length).fill(NaN);
    for (let i = n; i < x.length; i++) { let m = Infinity; for (let j = i - n; j < i; j++) m = Math.min(m, x[j]); out[i] = m; }
    return out;
  }
  function addAll(bars) {
    const b = { t: bars.map(x => x.t), o: bars.map(x => x.o), h: bars.map(x => x.h), l: bars.map(x => x.l), c: bars.map(x => x.c) };
    b.n = b.c.length;
    for (const n of [9, 20, 21, 50, 200]) b["ema" + n] = ema(b.c, n);
    b.rsi = rsi(b.c); b.atr = atr(b);
    const f = ema(b.c, 12), s = ema(b.c, 26);
    b.macd = f.map((v, i) => v - s[i]); b.macd_sig = ema(b.macd, 9); b.macd_hist = b.macd.map((v, i) => v - b.macd_sig[i]);
    b.dc_hi = rollMaxPrev(b.h, 20); b.dc_lo = rollMinPrev(b.l, 20);
    return b;
  }

  // ---------------------------------------------------------------- strategies (closed bar i)
  function order(side, entry, a, p, why) {
    const risk = a * p.sl_atr;
    return side === "buy" ? { side, sl: entry - risk, tp: entry + risk * p.rr, why }
                          : { side, sl: entry + risk, tp: entry - risk * p.rr, why };
  }
  const STRATEGIES = {
    ema_pullback: {
      name: "EMA pullback (trend)", desc: "In an up-trend (EMA50 above EMA200) buy when price dips to EMA20 and closes back above it; the mirror for sells.",
      fn(b, i, p) {
        const q = i - 1;
        if (b.ema50[i] > b.ema200[i] && b.l[q] <= b.ema20[q] && b.c[i] > b.ema20[i] && b.c[i] > b.o[i])
          return order("buy", b.c[i], b.atr[i], p, "up-trend pullback to EMA20, bullish close");
        if (b.ema50[i] < b.ema200[i] && b.h[q] >= b.ema20[q] && b.c[i] < b.ema20[i] && b.c[i] < b.o[i])
          return order("sell", b.c[i], b.atr[i], p, "down-trend pullback to EMA20, bearish close");
        return null;
      } },
    ema_cross: {
      name: "EMA 9/21 crossover", desc: "EMA9 crosses EMA21, only in the direction of the EMA200 trend.",
      fn(b, i, p) {
        const q = i - 1;
        if (b.ema9[q] <= b.ema21[q] && b.ema9[i] > b.ema21[i] && b.c[i] > b.ema200[i])
          return order("buy", b.c[i], b.atr[i], p, "EMA9 crossed above EMA21, above EMA200");
        if (b.ema9[q] >= b.ema21[q] && b.ema9[i] < b.ema21[i] && b.c[i] < b.ema200[i])
          return order("sell", b.c[i], b.atr[i], p, "EMA9 crossed below EMA21, below EMA200");
        return null;
      } },
    rsi_reversion: {
      name: "RSI reversion", desc: "Buy when RSI climbs back above 30 in an up-trend; sell when it falls back below 70 in a down-trend.",
      fn(b, i, p) {
        const q = i - 1;
        if (b.c[i] > b.ema200[i] && b.rsi[q] < 30 && 30 <= b.rsi[i]) return order("buy", b.c[i], b.atr[i], p, "RSI back above 30 in an up-trend");
        if (b.c[i] < b.ema200[i] && b.rsi[q] > 70 && 70 >= b.rsi[i]) return order("sell", b.c[i], b.atr[i], p, "RSI back below 70 in a down-trend");
        return null;
      } },
    donchian_breakout: {
      name: "Donchian breakout", desc: "Close breaks the previous 20-bar high (buy) or low (sell), with the EMA200 trend filter.",
      fn(b, i, p) {
        if (b.c[i] > b.dc_hi[i] && b.c[i] > b.ema200[i]) return order("buy", b.c[i], b.atr[i], p, "broke above 20-bar high");
        if (b.c[i] < b.dc_lo[i] && b.c[i] < b.ema200[i]) return order("sell", b.c[i], b.atr[i], p, "broke below 20-bar low");
        return null;
      } },
    macd_trend: {
      name: "MACD trend", desc: "MACD crosses its signal line below zero in an up-trend (buy), or above zero in a down-trend (sell).",
      fn(b, i, p) {
        const q = i - 1;
        if (b.macd_hist[q] <= 0 && 0 < b.macd_hist[i] && b.c[i] > b.ema200[i] && b.macd[i] < 0)
          return order("buy", b.c[i], b.atr[i], p, "MACD bullish cross below zero, up-trend");
        if (b.macd_hist[q] >= 0 && 0 > b.macd_hist[i] && b.c[i] < b.ema200[i] && b.macd[i] > 0)
          return order("sell", b.c[i], b.atr[i], p, "MACD bearish cross above zero, down-trend");
        return null;
      } },
  };
  function signalAt(b, name, i, p) {
    const s = STRATEGIES[name].fn(b, i, p);
    if (s && p.longOnly && s.side === "sell") return null;
    return s;
  }

  // ---------------------------------------------------------------- backtest (same honest rules as backtest.py)
  function simulate(b, name, p, spread = 0, start = 210, end = null) {
    end = end == null ? b.n - 1 : end;
    const trades = []; let pos = null;
    for (let i = start; i < end; i++) {
      if (!pos) {
        const sig = signalAt(b, name, i, p);
        if (!sig) continue;
        const entry = b.o[i + 1] + (sig.side === "buy" ? spread : 0), shift = entry - b.c[i];
        pos = { side: sig.side, entry, sl: sig.sl + shift, tp: sig.tp + shift, risk: Math.abs(entry - (sig.sl + shift)), bar: i + 1, be: false };
        if (!(pos.risk > 0)) pos = null;
        continue;
      }
      const j = i, buy = pos.side === "buy";
      const lo = buy ? b.l[j] : b.l[j] + spread, hi = buy ? b.h[j] : b.h[j] + spread;
      const hitSl = buy ? lo <= pos.sl : hi >= pos.sl, hitTp = buy ? hi >= pos.tp : lo <= pos.tp;
      const ex = hitSl ? pos.sl : hitTp ? pos.tp : null;
      if (ex != null) {
        const pnl = buy ? ex - pos.entry : pos.entry - ex;
        trades.push({ side: pos.side, r: pnl / pos.risk, bars: j - pos.bar + 1, entry_i: pos.bar, exit_i: j });
        pos = null; continue;
      }
      if (p.breakeven_r && !pos.be) {
        const moved = buy ? hi - pos.entry : pos.entry - lo;
        if (moved >= p.breakeven_r * pos.risk) { pos.sl = pos.entry; pos.be = true; }
      }
    }
    return trades;
  }
  function stats(trades, riskPct = 1) {
    if (!trades.length) return { trades: 0 };
    const r = trades.map(t => t.r); let e = 1, peak = 1, dd = 0, cur = 0, streak = 0, wins = 0, ws = 0, ls = 0;
    const eq = [];
    for (const x of r) {
      e *= 1 + x * riskPct / 100; eq.push(e); peak = Math.max(peak, e); dd = Math.max(dd, 1 - e / peak);
      if (x > 0) { wins++; ws += x; } else ls += x;
      cur = x <= 0 ? cur + 1 : 0; streak = Math.max(streak, cur);
    }
    return { trades: r.length, win_rate: 100 * wins / r.length, avg_r: r.reduce((a, b) => a + b, 0) / r.length,
             profit_factor: ls < 0 ? ws / -ls : Infinity, total_r: r.reduce((a, b) => a + b, 0),
             return_pct: (e - 1) * 100, max_dd_pct: dd * 100, worst_losing_streak: streak, equity: eq };
  }
  // TRAIN = older 70%, TEST = newest 30%. PASS = profitable enough on BOTH, with enough trades (same rule as the PC bot).
  function backtestAll(b, p, spread, riskPct) {
    const split = Math.floor(b.n * 0.7), out = [];
    for (const name of Object.keys(STRATEGIES)) {
      const a = stats(simulate(b, name, p, spread, 210, split), riskPct), t = stats(simulate(b, name, p, spread, split), riskPct);
      const pass = a.trades >= 30 && t.trades >= 15 && a.profit_factor > 1.15 && t.profit_factor > 1.1;
      out.push({ name, train: a, test: t, pass });
    }
    return out;
  }

  // ---------------------------------------------------------------- plain-language market reading (market_view)
  function marketView(b) {
    const i = b.n - 1; let score = 0; const notes = [];
    if (b.ema50[i] > b.ema200[i]) { score += 30; notes.push("long-term uptrend (EMA50 above EMA200)"); }
    else { score -= 30; notes.push("long-term downtrend (EMA50 below EMA200)"); }
    if (b.c[i] > b.ema20[i]) { score += 15; notes.push("price above EMA20 (short-term strength)"); }
    else { score -= 15; notes.push("price below EMA20 (short-term weakness)"); }
    if (b.macd_hist[i] > 0) { score += 15; notes.push("MACD momentum positive"); } else { score -= 15; notes.push("MACD momentum negative"); }
    const slope = (b.ema50[i] - b.ema50[i - 10]) / Math.max(1e-12, b.atr[i]);
    score += Math.trunc(Math.max(-20, Math.min(20, slope * 10)));
    if (b.rsi[i] > 70) { score -= 20; notes.push(`RSI ${b.rsi[i].toFixed(0)}: overbought, pullback risk`); }
    else if (b.rsi[i] < 30) { score += 20; notes.push(`RSI ${b.rsi[i].toFixed(0)}: oversold, bounce risk`); }
    else notes.push(`RSI ${b.rsi[i].toFixed(0)}: neutral`);
    score = Math.max(-100, Math.min(100, score));
    return { score, bias: score >= 25 ? "BULLISH" : score <= -25 ? "BEARISH" : "NEUTRAL / RANGING", notes };
  }

  // ---------------------------------------------------------------- your own strategies: simple rules, same backtest
  // def = { name, buy: [cond], sell: [cond], sl_atr?, rr? }   cond = { a, op, b, n }   op: ">" "<" "xa" (crosses above) "xb" (crosses below)
  const SRC = { close: ["Close", "c"], open: ["Open", "o"], high: ["High", "h"], low: ["Low", "l"], prev_close: ["Previous close", "c", -1],
                ema9: ["EMA 9", "ema9"], ema20: ["EMA 20", "ema20"], ema21: ["EMA 21", "ema21"], ema50: ["EMA 50", "ema50"], ema200: ["EMA 200", "ema200"],
                rsi: ["RSI 14", "rsi"], macd: ["MACD line", "macd"], macd_sig: ["MACD signal", "macd_sig"], macd_hist: ["MACD histogram", "macd_hist"],
                atr: ["ATR 14", "atr"], dc_hi: ["20-bar high", "dc_hi"], dc_lo: ["20-bar low", "dc_lo"], num: ["number", null] };
  const OPS = { ">": "is above", "<": "is below", xa: "crosses above", xb: "crosses below" };
  function val(b, k, i, n) { if (k === "num") return +n; const d = SRC[k]; if (!d) return NaN; const j = i + (d[2] || 0); return j < 0 ? NaN : b[d[1]][j]; }
  function condOk(b, c, i) {
    const a0 = val(b, c.a, i), b0 = val(b, c.b, i, c.n);
    if (c.op === ">") return a0 > b0; if (c.op === "<") return a0 < b0;
    const a1 = val(b, c.a, i - 1), b1 = val(b, c.b, i - 1, c.n);
    return c.op === "xa" ? a0 > b0 && a1 <= b1 : c.op === "xb" ? a0 < b0 && a1 >= b1 : false;
  }
  const condText = c => `${SRC[c.a][0]} ${OPS[c.op]} ${c.b === "num" ? c.n : SRC[c.b][0]}`;
  function compileRule(def) {
    let cur = null;
    const all = (cs, i) => cs && cs.length && cs.every(c => condOk(cur, c, i));
    return { name: "⭐ " + def.name, custom: true, def,
      desc: (def.buy && def.buy.length ? "BUY when " + def.buy.map(condText).join(" and ") : "") + (def.sell && def.sell.length ? (def.buy && def.buy.length ? "; " : "") + "SELL when " + def.sell.map(condText).join(" and ") : ""),
      fn: (b, i, p) => {
        if (i < 1) return null; cur = b;
        const q = Object.assign({}, p, def.sl_atr ? { sl_atr: +def.sl_atr } : {}, def.rr ? { rr: +def.rr } : {});
        if (all(def.buy, i)) return order("buy", b.c[i], b.atr[i], q, def.buy.map(condText).join(", "));
        if (all(def.sell, i)) return order("sell", b.c[i], b.atr[i], q, def.sell.map(condText).join(", "));
        return null; } };
  }
  function addCustom(id, def) { STRATEGIES[id] = compileRule(def); return STRATEGIES[id]; }
  function removeCustom(id) { if (STRATEGIES[id] && STRATEGIES[id].custom) delete STRATEGIES[id]; }

  const API = { ema, rsi, atr, addAll, STRATEGIES, signalAt, simulate, stats, backtestAll, marketView, SRC, OPS, compileRule, addCustom, removeCustom, condText };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.Engine = API;
})(typeof window !== "undefined" ? window : this);
