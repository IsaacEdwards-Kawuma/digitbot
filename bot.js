// ==UserScript==
// @name         MMG Digit Bot
// @namespace    digitbot.local
// @version      2.15.0
// @description  Trades every mode on mmgpredictions.com (Match/Differ, Over/Under, Even/Odd, Rise/Fall). Sets the game up for you, follows your trigger, stop-loss and limits. Works on PC, Android and iPhone/iPad browsers.
// @match        https://mmgpredictions.com/*
// @match        https://www.mmgpredictions.com/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://isaacedwards-kawuma.github.io/digitbot/mmg-digit-bot.user.js
// @downloadURL  https://isaacedwards-kawuma.github.io/digitbot/mmg-digit-bot.user.js
// ==/UserScript==
/*
  HOW IT WORKS
  - Reads the game straight from the page (no screen reading): the live price, the lit
    digit circle, the trade buttons, your balance and the DEMO badge.
  - "Set up the game for me": picks the game mode, the Pick digit / barrier, the
    Rise/Fall duration and the Amount itself - and puts them back if they change.
  - When your trigger shows (a digit, any even/odd digit, or every tick), N times in a
    row, it presses the button you chose.
  - Safety: DEMO only unless you tick "Allow REAL", max stake, stop-loss, take-profit,
    max trades, max minutes, cooldown. Stops if the page changes or the chart freezes.
*/
(function () {
  "use strict";
  if (window.__mmgDigitBot) { window.__mmgDigitBot.show(); return; }   // bookmarklet tapped twice

  const KEY = "mmgDigitBot.settings.v1";
  const BUTTONS = ["differ", "match", "over", "under", "even", "odd", "rise", "fall"];
  const MODE = { differ: "Matches/Differs", match: "Matches/Differs", over: "Over/Under", under: "Over/Under",
                 even: "Even/Odd", odd: "Even/Odd", rise: "Rise/Fall", fall: "Rise/Fall" };
  const MODE_NAME = { "Matches/Differs": "Match/Differ", "Over/Under": "Over/Under", "Even/Odd": "Even/Odd", "Rise/Fall": "Rise/Fall" };
  const NEEDS_PICK = { differ: 1, match: 1, over: 1, under: 1 };
  const DURATIONS = ["5t", "15t", "30t", "60t", "120t", "300t"];
  const TRIGGERS = [["any", "every tick"], ["even", "any even digit"], ["odd", "any odd digit"],
                    ...[...Array(10).keys()].map(i => [String(i), "digit " + i])];
  const DEF = { button: "differ", pick: 0, duration: "5t", stakeSet: 1, autoSetup: true,
                trigger: "0", inRow: 1, maxTrades: 10, maxMinutes: 20, cooldown: 2,
                maxStake: 10, stopLoss: 20, takeProfit: 20, allowReal: false, live: false };
  DEF.strategy = "custom"; DEF.tab = "auto"; DEF.autoStake = 1; DEF.mode = "auto"; DEF.dayLimit = 20; DEF.alerts = true;
  DEF.plan = "flat"; DEF.planMult = 2; DEF.planSteps = 4;
  // Stake plans (as in MMG's Auto Trader). They change HOW you win or lose, never the average: each trade still loses a little.
  const PLANS = { flat: "Flat – same stake every trade (safest)", martingale: "Martingale – multiply after a loss, reset after a win",
                  paroli: "Paroli – multiply after a win, reset after a loss", dalembert: "D'Alembert – +1 base after a loss, −1 after a win",
                  fibonacci: "Fibonacci – follow 1,1,2,3,5,8… after losses" };
  const FIB = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
  // next stake after a result; ps = { step } ; returns the new stake (0 = back to base)
  function planNext(plan, base, cur, res, ps, mult, steps) {
    if (plan === "martingale") { if (res === "loss" && ps.step < steps) { ps.step++; return cur * mult; } ps.step = 0; return base; }
    if (plan === "paroli") { if (res === "win" && ps.step < steps) { ps.step++; return cur * mult; } ps.step = 0; return base; }
    if (plan === "dalembert") { ps.step = res === "loss" ? Math.min(steps, ps.step + 1) : Math.max(0, ps.step - 1); return base * (1 + ps.step); }
    if (plan === "fibonacci") { ps.step = res === "loss" ? Math.min(steps, ps.step + 1) : Math.max(0, ps.step - 2); return base * FIB[ps.step]; }
    ps.step = 0; return base;
  }

  // Ready-made strategies: picking one fills in every setting below (you can still change them).
  // Safe defaults for all: $1 stake, stop-loss $10, take-profit $10, max stake $5, LIVE clicks on.
  // Honest note: digits are random, so no strategy changes the odds - they only change how
  // often you trade, how big the swings are and when you stop.
  const SAFE = { stakeSet: 1, maxStake: 5, stopLoss: 10, takeProfit: 10, maxMinutes: 15, autoSetup: true, live: true };
  const STRATEGIES = [
    { id: "differ_after", group: "Match / Differ", name: "Differ – after its own digit",
      desc: "When 7 shows, bet the next result is NOT 7. Wins ~9 in 10, but each win pays little and one loss costs about 10 wins.",
      set: { button: "differ", pick: 7, trigger: "7", inRow: 1, maxTrades: 20, cooldown: 2 } },
    { id: "differ_steady", group: "Match / Differ", name: "Differ – steady every tick",
      desc: "Bets NOT 0 on every tick, with a 4 s pause between trades. Many small wins, a few bigger losses.",
      set: { button: "differ", pick: 0, trigger: "any", inRow: 1, maxTrades: 15, cooldown: 4 } },
    { id: "match_hot", group: "Match / Differ", name: "Match – hot digit (5 twice)",
      desc: "When 5 shows twice in a row, bet the result IS 5. Wins ~1 in 10 but pays about 8x. Long losing runs are normal.",
      set: { button: "match", pick: 5, trigger: "5", inRow: 2, maxTrades: 15, cooldown: 2 } },
    { id: "over2", group: "Over / Under", name: "Over 2 – high win rate",
      desc: "Bets the result is 3-9 (wins ~7 in 10), after any odd digit. Small wins, bigger losses.",
      set: { button: "over", pick: 2, trigger: "odd", inRow: 1, maxTrades: 15, cooldown: 3 } },
    { id: "under7", group: "Over / Under", name: "Under 7 – high win rate",
      desc: "Bets the result is 0-6 (wins ~7 in 10), after any even digit. Small wins, bigger losses.",
      set: { button: "under", pick: 7, trigger: "even", inRow: 1, maxTrades: 15, cooldown: 3 } },
    { id: "over4_low", group: "Over / Under", name: "Over 4 – after 0 shows",
      desc: "When 0 shows, bet the result is 5-9 (wins ~1 in 2, pays about 1x).",
      set: { button: "over", pick: 4, trigger: "0", inRow: 1, maxTrades: 15, cooldown: 2 } },
    { id: "even_after_odd", group: "Even / Odd", name: "Even – after 3 odd in a row",
      desc: "Waits for 3 odd digits in a row, then bets Even. Wins ~1 in 2 (the streak does not really change the odds).",
      set: { button: "even", trigger: "odd", inRow: 3, maxTrades: 15, cooldown: 2 } },
    { id: "odd_after_even", group: "Even / Odd", name: "Odd – after 3 even in a row",
      desc: "Waits for 3 even digits in a row, then bets Odd. Wins ~1 in 2 (the streak does not really change the odds).",
      set: { button: "odd", trigger: "even", inRow: 3, maxTrades: 15, cooldown: 2 } },
    { id: "even_steady", group: "Even / Odd", name: "Even – steady every tick",
      desc: "Bets Even on every tick with a 5 s pause between trades. Wins ~1 in 2.",
      set: { button: "even", trigger: "any", inRow: 1, maxTrades: 10, cooldown: 5 } },
    { id: "rise_5t", group: "Rise / Fall", name: "Rise – 5 ticks, steady",
      desc: "Bets the price is higher after 5 ticks, then waits 6 s before the next trade. Wins ~1 in 2.",
      set: { button: "rise", duration: "5t", trigger: "any", inRow: 1, maxTrades: 10, cooldown: 6 } },
    { id: "fall_5t", group: "Rise / Fall", name: "Fall – 5 ticks, steady",
      desc: "Bets the price is lower after 5 ticks, then waits 6 s before the next trade. Wins ~1 in 2.",
      set: { button: "fall", duration: "5t", trigger: "any", inRow: 1, maxTrades: 10, cooldown: 6 } },
  ];
  const strategyById = id => STRATEGIES.find(s => s.id === id);
  let S = Object.assign({}, DEF);
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) {}
  S.trigger = String(S.trigger);
  const save = () => localStorage.setItem(KEY, JSON.stringify(S));

  // ------------------------------------------------------------------ reading the page
  const visible = el => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const txt = el => (el && (el.innerText || el.textContent) || "").replace(/\s+/g, " ").trim();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function waitFor(fn, ms) { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(100); } return !!fn(); }

  function priceText() {
    const sel = [...document.querySelectorAll('button[aria-label^="Select index"]')].find(visible)
             || document.querySelector('button[aria-label^="Select index"]');
    if (!sel) return null;
    for (const s of sel.querySelectorAll("span")) {
      const t = txt(s);
      if (/^[\d.,\s]+$/.test(t) && /\d/.test(t)) return t;       // e.g. "9.184,86"
    }
    return null;
  }
  function symbolName() {
    const sel = document.querySelector('button[aria-label^="Select index"]');
    const m = sel && /Current:\s*(.+)$/.exec(sel.getAttribute("aria-label") || "");
    return m ? m[1] : "?";
  }
  function circleRow() {   // the row of 10 round digit circles under the chart
    for (const grid of document.querySelectorAll("div.grid-cols-10")) {
      if (!visible(grid)) continue;
      const cs = [...grid.querySelectorAll("div.rounded-full")].filter(d => /^[0-9]$/.test(txt(d)));
      if (cs.length === 10) return cs;
    }
    return null;
  }
  function litDigit() {
    const cs = circleRow(); if (!cs) return null;
    const lit = cs.filter(d => /\btext-brand-accent\b/.test(d.className));
    return lit.length === 1 ? +txt(lit[0]) : null;
  }
  // The big coloured trade buttons. (Only these have the gradient - the mode tabs
  // "Match/Diff", "Over/Under"... start with the same words, so text alone is not enough.)
  function tradeButtons() {
    return [...document.querySelectorAll("button")].filter(b => visible(b) && /\bbg-gradient-to-b\b/.test(b.className));
  }
  function tradeButton(name) {
    const re = new RegExp("^" + name + "\\b", "i");
    return tradeButtons().find(b => re.test(txt(b))) || null;
  }
  function payoutPct(b) { const m = b && /(\d+(?:\.\d+)?)\s*%/.exec(txt(b)); return m ? parseFloat(m[1]) : null; }
  function tradePanel() {   // the box holding Amount, Pick digit/barrier, duration and the trade buttons
    let p = tradeButtons()[0];
    while (p && !(p.querySelector("input") && /amount/i.test(txt(p)))) p = p.parentElement;
    return p || null;
  }
  function modeTab(title) { return [...document.querySelectorAll(`button[title="${title}"]`)].find(visible) || null; }
  function currentMode() {
    const t = [...document.querySelectorAll("button[title][aria-pressed='true']")].find(b => visible(b) && MODE_NAME[b.title]);
    return t ? t.title : null;
  }
  function pickButtons() {
    const p = tradePanel(); if (!p) return null;
    const bs = [...p.querySelectorAll("button")].filter(b => visible(b) && /^[0-9]$/.test(txt(b)));
    return bs.length === 10 ? bs : null;
  }
  const isPicked = b => !!b && /\bbg-brand\b/.test(b.className) && /\btext-white\b/.test(b.className);
  function currentPick() { const bs = pickButtons(); if (!bs) return null; const i = bs.findIndex(isPicked); return i < 0 ? null : i; }
  function durationButtons() {
    const p = tradePanel(); if (!p) return [];
    return [...p.querySelectorAll("button")].filter(b => visible(b) && /^\d+t$/.test(txt(b)));
  }
  function currentDuration() { const b = durationButtons().find(x => x.getAttribute("aria-pressed") === "true"); return b ? txt(b) : null; }
  function amountInput() {
    const p = tradePanel();
    return (p && [...p.querySelectorAll("input")].find(visible)) || null;
  }
  function stake() {   // the Amount box of the trade panel
    const i = amountInput(); if (!i) return null;
    const v = parseFloat(String(i.value).replace(/[^\d.]/g, ""));
    return isNaN(v) ? null : v;
  }
  function money(s) { const m = /\$\s?([\d,]+(?:\.\d+)?)/.exec(s || ""); return m ? parseFloat(m[1].replace(/,/g, "")) : null; }
  function balance() {
    for (const d of document.querySelectorAll("div")) {
      const t = txt(d);
      if (t.startsWith("Balance:") && t.length < 40) return money(t);
    }
    return null;
  }
  // The game's DEMO badge (next to the balance, or "DEMO WALLET" on the Auto Trader page). Any small element counts,
  // because the site changes its markup; the bot's own panel (which shows "DEMO" itself) never counts.
  function demoBadge() {
    const mine = document.getElementById("mdb");
    for (const el of document.querySelectorAll("span,div,small,p,b,strong,em,i,label,button,a,sup,mark")) {
      if (mine && mine.contains(el)) continue;
      const t = txt(el); if (!t || t.length > 16) continue;
      if (/^(demo|demo wallet|demo account|practice)$/i.test(t) && visible(el)) return el;
    }
    return null;
  }
  let lastDemoSeen = 0;
  function isDemo() { if (demoBadge()) { lastDemoSeen = Date.now(); return true; } return false; }
  const noDemoMsg = () => `I can't see the game's DEMO badge, so this counts as a REAL account. Open the Manual Trader page ` +
    `(the DEMO badge sits next to your balance at the top), or tick Allow REAL if it really is real money.`;
  function openTrades() {   // "Open (2)" tab of the predictions list
    for (const el of document.querySelectorAll("button, div, span, a")) {
      const m = /^Open\s*\((\d+)\)$/.exec(txt(el));
      if (m && el.children.length <= 2) return +m[1];
    }
    return null;
  }
  // The site takes the stake from the balance when you click and pays it back (plus profit)
  // when the contract settles. So the balance is only the TRUE result when no trade is open.
  function settled() {
    if (Date.now() - lastClick < 1500) return false;          // site may not have updated yet
    const open = openTrades();
    return open == null ? Date.now() - lastClick > 6000 : open === 0;
  }

  // ------------------------------------------------------------------ setting the game up
  function setStakeValue(v) {
    const p = tradePanel();
    const preset = p && [...p.querySelectorAll("button")].find(b => visible(b) && txt(b) === `$${v}`);
    if (preset) { preset.click(); return; }
    const i = amountInput(); if (!i) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;   // React-friendly
    setter.call(i, String(v));
    i.dispatchEvent(new Event("input", { bubbles: true }));
    i.dispatchEvent(new Event("change", { bubbles: true }));
    i.dispatchEvent(new Event("blur", { bubbles: true }));
  }
  // Is the game exactly as the settings say? Returns "" if yes, otherwise what is wrong.
  function gameProblem() {
    const title = MODE[S.button];
    if (currentMode() !== title) return `mode is not ${MODE_NAME[title]}`;
    if (NEEDS_PICK[S.button] && currentPick() !== +S.pick) return `${S.button === "over" || S.button === "under" ? "barrier" : "Pick digit"} is not ${S.pick}`;
    if (MODE[S.button] === "Rise/Fall" && currentDuration() !== S.duration) return `duration is not ${S.duration}`;
    if (stake() !== +S.stakeSet) return `Amount is not $${S.stakeSet}`;
    return "";
  }
  // Order matters: switching the mode resets Amount ($10) and Pick (0) in the game.
  async function setupGame() {
    const title = MODE[S.button];
    const tab = modeTab(title);
    if (!tab) throw "can't find the game mode tabs - open the Manual Trader page";
    if (tab.getAttribute("aria-pressed") !== "true") {
      tab.click();
      if (!await waitFor(() => currentMode() === title, 3000)) throw `couldn't switch to ${MODE_NAME[title]}`;
      await sleep(500);
    }
    if (NEEDS_PICK[S.button] && currentPick() !== +S.pick) {
      const bs = pickButtons(); if (!bs) throw "can't find the Pick digit / barrier buttons";
      bs[+S.pick].click();
      if (!await waitFor(() => currentPick() === +S.pick, 2000)) throw `couldn't pick ${S.pick}`;
    }
    if (title === "Rise/Fall" && currentDuration() !== S.duration) {
      const b = durationButtons().find(x => txt(x) === S.duration); if (!b) throw `can't find duration ${S.duration}`;
      b.click();
      if (!await waitFor(() => currentDuration() === S.duration, 2000)) throw `couldn't set duration ${S.duration}`;
    }
    if (stake() !== +S.stakeSet) {
      setStakeValue(+S.stakeSet);
      if (!await waitFor(() => stake() === +S.stakeSet, 2000)) throw `couldn't set the Amount to $${S.stakeSet}`;
    }
    await sleep(300);
    const b = tradeButton(S.button);
    if (!b) throw `can't see the ${S.button.toUpperCase()} button`;
    if (b.disabled) throw `${S.button.toUpperCase()} is "Unavailable" with barrier ${S.pick} - pick another barrier`;
  }

  // Honest odds for the chosen button (digits are uniform 0-9 if the game is fair).
  function winChance() {
    const p = +S.pick;
    return { differ: 0.9, match: 0.1, over: (9 - p) / 10, under: p / 10, even: 0.5, odd: 0.5 }[S.button];
  }
  function oddsText() {
    const b = tradeButton(S.button), pay = payoutPct(b);
    if (pay == null) return "";
    const be = 100 / (1 + pay / 100), wc = winChance();
    if (wc == null) return `pays +${pay}% · needs ${be.toFixed(1)}% wins to break even`;
    const ev = (wc * (1 + pay / 100) - 1) * 100;
    return `win chance ${(wc * 100).toFixed(0)}% · pays +${pay}% · break-even ${be.toFixed(1)}% → ` +
           `<span class="${ev >= 0 ? "ok" : "warn"}">${ev >= 0 ? "+" : ""}${ev.toFixed(1)}% per trade</span>`;
  }

  // ------------------------------------------------------------------ panel (UI)
  const css = `
  #mdb{position:fixed;z-index:2147483646;left:8px;bottom:8px;width:310px;max-width:calc(100vw - 16px);
   font:13px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;background:#fff;
   border:1px solid #cbd5e1;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.25);overflow:hidden}
  #mdb *{box-sizing:border-box} #mdb .hd{display:flex;align-items:center;gap:8px;padding:8px 10px;
   background:#0b7c8c;color:#fff;cursor:move;touch-action:none;user-select:none}
  #mdb .hd b{flex:1} #mdb .hd button{background:rgba(255,255,255,.2);color:#fff;border:0;border-radius:6px;
   padding:3px 8px;font-size:13px}
  #mdb .bd{padding:8px 10px;max-height:75vh;overflow:auto}
  #mdb .g{display:grid;grid-template-columns:1fr 1fr;gap:6px 8px}
  #mdb .sec{grid-column:1/3;font-size:11px;font-weight:700;color:#0b7c8c;text-transform:uppercase;letter-spacing:.04em;margin-top:2px}
  #mdb label{display:flex;flex-direction:column;font-size:11px;color:#475569}
  #mdb input,#mdb select{font-size:15px;padding:5px 6px;border:1px solid #cbd5e1;border-radius:6px;width:100%;color:#0f172a;background:#fff}
  #mdb .ck{flex-direction:row;align-items:center;gap:6px;font-size:12px;color:#0f172a}
  #mdb .ck input{width:18px;height:18px}
  #mdb .odds{grid-column:1/3;font-size:11px;color:#334155;background:#f8fafc;border-radius:6px;padding:4px 6px}
  #mdb .st{margin:8px 0;padding:6px 8px;background:#f1f5f9;border-radius:8px;font-size:12px}
  #mdb .st .row{display:flex;justify-content:space-between;gap:6px}
  #mdb .dg{font:600 15px ui-monospace,monospace;letter-spacing:2px;margin-top:3px;word-break:break-all}
  #mdb .go{display:flex;gap:6px} #mdb .go button{flex:1;padding:10px;border:0;border-radius:8px;font-size:15px;font-weight:600;color:#fff}
  #mdb .start{background:#16a34a} #mdb .stop{background:#dc2626} #mdb .start:disabled{background:#94a3b8}
  #mdb .log{margin-top:6px;font:11px ui-monospace,monospace;max-height:110px;overflow:auto;background:#0f172a;color:#e2e8f0;border-radius:6px;padding:5px}
  #mdb .warn{color:#b91c1c;font-weight:600} #mdb .ok{color:#15803d;font-weight:600}
  #mdb .log .warn{color:#fca5a5} #mdb .log .ok{color:#86efac}
  #mdb.min .bd,#mdb.min .hp,#mdb.min .wl,#mdb.min #mdbHelp,#mdb.min #mdbHome,#mdb.min #mdbX{display:none!important}
  /* 📱 phone: a bottom sheet across the screen; tap the title bar to switch half / full / bar */
  #mdb.phone:not(.min){left:0!important;right:0!important;top:auto!important;bottom:0!important;width:100vw;max-width:100vw;border-radius:16px 16px 0 0;border-bottom:0;
   padding-bottom:env(safe-area-inset-bottom)}
  #mdb.phone:not(.min) .hd{padding:6px 10px 8px;cursor:pointer;flex-wrap:wrap;position:relative}
  #mdb.phone:not(.min) .hd::before{content:"";position:absolute;left:50%;top:3px;width:42px;height:4px;margin-left:-21px;border-radius:3px;background:rgba(255,255,255,.55)}
  #mdb.phone .hd button{min-width:38px;min-height:34px;font-size:16px}
  #mdb.phone .bd,#mdb.phone .hp{max-height:44vh} #mdb.phone.sfull .bd,#mdb.phone.sfull .hp{max-height:calc(86vh - 50px)}
  #mdb.phone.sbar:not(.min) .bd,#mdb.phone.sbar:not(.min) .hp,#mdb.phone.sbar:not(.min) .wl{display:none!important}
  #mdb.phone input,#mdb.phone select{font-size:16px;min-height:40px}
  #mdb.phone .tabs{position:sticky;top:-8px;z-index:3;background:#fff;padding-top:6px;margin-top:-6px}
  #mdb.phone .tabs button{font-size:14px;padding:10px 2px;min-height:44px}
  #mdb.phone .go{position:sticky;bottom:-8px;z-index:3;background:#fff;padding:8px 0 10px;margin-bottom:-8px}
  #mdb.phone .go button,#mdb.phone .once,#mdb.phone .clr{min-height:46px;font-size:16px}
  #mdb.phone .rbl select,#mdb.phone .rbl input{font-size:15px;min-height:36px} #mdb.phone .rbx button{min-width:34px;min-height:32px;font-size:14px}
  #mdb.phone .ck input{width:22px;height:22px}
  /* ⧉ pop-out window (Picture-in-Picture): fill it */
  #mdb.pip{position:static!important;width:100%!important;max-width:none;height:100vh;border-radius:0;border:0;box-shadow:none;display:flex;flex-direction:column}
  #mdb.pip .bd,#mdb.pip .hp{max-height:none;flex:1} #mdb.pip .hd{cursor:default}
  #mdb.min{width:auto;border-radius:999px} #mdb.min .hd{padding:7px 12px;border-radius:999px}
  #mdb.min .hd b{flex:none} #mdb .hd #mdbBadge{font-size:12px;font-weight:600;white-space:nowrap}
  #mdb .tabs{display:flex;gap:6px;margin-bottom:8px}
  #mdb .tabs button{flex:1;padding:8px 2px;border:1px solid #cbd5e1;background:#f1f5f9;border-radius:8px;font-size:14px;font-weight:600;color:#475569}
  #mdb .rbc{border:1px solid #cbd5e1;border-radius:9px;padding:6px;margin:5px 0;background:#f8fafc}
  #mdb .rbl{display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin:2px 0;font-size:12.5px}
  #mdb .rbl select,#mdb .rbl input{padding:3px 4px;font-size:12.5px;max-width:150px} #mdb .rbl input{width:58px}
  #mdb .rbx{margin-left:auto} #mdb .rbx button{padding:1px 6px;font-size:11px;border:1px solid #cbd5e1;background:#fff;border-radius:5px}
  #mdb .rbg{display:grid;grid-template-columns:1fr 1fr;gap:5px} #mdb .rbg input,#mdb .rbg select{width:100%}
  #mdb .rbrow{display:flex;gap:5px;margin:6px 0}
  #mdb .rbt div{border:1px solid #e2e8f0;border-radius:8px;padding:5px 7px;margin:4px 0;cursor:pointer;background:#fff}
  #mdb .rbt div:hover{border-color:#0b7c8c} #mdb .rbt b{display:block;font-size:12.5px} #mdb .rbt span{font-size:11.5px;color:#0b7c8c}
  #mdb .rbh{display:flex;justify-content:space-between;font-size:11.5px;color:#475569;margin:3px 0} #mdb .rblive{color:#15803d;font-weight:700} #mdb .rbstop{color:#64748b;font-weight:700}
  #mdb .rbd{display:grid;grid-template-columns:1fr 1fr;gap:4px} #mdb .rbd div{border:1px solid #e2e8f0;border-radius:7px;padding:4px 6px;background:#fff}
  #mdb .rbd span{display:block;font-size:10.5px;color:#64748b;text-transform:uppercase} #mdb .rbd b{font-size:15px} #mdb .rbrow button{flex:1}
  #mdb .tabs button.on{background:#0b7c8c;border-color:#0b7c8c;color:#fff}
  #mdb .once{grid-column:1/3;padding:9px;border:0;border-radius:8px;background:#2563eb;color:#fff;font-size:14px;font-weight:600}
  #mdb .once:disabled{background:#94a3b8}
  #mdb .tip{grid-column:1/3;font-size:11px;color:#64748b}
  #mdb .tabs button{padding:8px 4px;font-size:13px}
  #mdb .stx{grid-column:1/3;display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px}
  #mdb .stx div{background:#f1f5f9;border-radius:6px;padding:4px 6px;font-size:11px;color:#475569}
  #mdb .stx b{display:block;font-size:14px;color:#0f172a}
  #mdb .tbl{grid-column:1/3;max-height:190px;overflow:auto;border:1px solid #e2e8f0;border-radius:6px}
  #mdb .tbl table{width:100%;border-collapse:collapse;font-size:11px}
  #mdb .tbl td,#mdb .tbl th{padding:3px 5px;border-bottom:1px solid #f1f5f9;text-align:left;white-space:nowrap}
  #mdb .tbl th{position:sticky;top:0;background:#f8fafc;color:#475569}
  #mdb .clr{grid-column:1/3;padding:7px;border:1px solid #fca5a5;border-radius:8px;background:#fff;color:#b91c1c;font-size:13px}
  #mdb .hp{display:none;padding:8px 10px;max-height:75vh;overflow:auto;font-size:13px}
  #mdb.help .bd{display:none} #mdb.help .hp{display:block}
  #mdb .wl{display:none;padding:12px 12px 10px}
  #mdb.welcome .bd,#mdb.welcome .hp{display:none!important} #mdb.welcome .wl{display:block}
  #mdb .wl h3{margin:0 0 2px;font-size:16px} #mdb .wl .sub{font-size:12px;color:#64748b;margin-bottom:10px}
  #mdb .wl button.ch{display:flex;align-items:center;gap:10px;width:100%;text-align:left;margin:0 0 8px;padding:10px 12px;
   border:1px solid #cbd5e1;border-radius:12px;background:#fff;cursor:pointer;font:inherit;color:#0f172a}
  #mdb .wl button.ch:hover{border-color:#0b7c8c;background:#f0fdfa}
  #mdb .wl .ic{font-size:26px} #mdb .wl b{display:block;font-size:15px} #mdb .wl small{color:#64748b;font-size:11.5px}
  #mdb .wl .ck2{display:flex;align-items:center;gap:6px;font-size:12px;color:#475569;margin-top:4px}
  #mdbTrade{position:fixed;z-index:2147483647;inset:2vh 2vw;background:#0f172a;border-radius:14px;box-shadow:0 12px 50px rgba(0,0,0,.45);
   display:none;flex-direction:column;overflow:hidden;font:13px system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  #mdbTrade.on{display:flex}
  #mdbTrade .tb{display:flex;gap:6px;align-items:center;padding:8px 10px;background:#0b7c8c;color:#fff;flex-wrap:wrap}
  #mdbTrade .tb b{flex:1;font-size:14px}
  #mdbTrade .tb button{background:rgba(255,255,255,.18);color:#fff;border:0;border-radius:8px;padding:6px 10px;font:600 13px system-ui;cursor:pointer}
  #mdbTrade .tb button.on{background:#fff;color:#0b7c8c}
  #mdbTrade iframe{flex:1;border:0;width:100%;background:#0f172a}
  #mdb .hp details{border:1px solid #e2e8f0;border-radius:8px;margin:6px 0;background:#f8fafc}
  #mdb .hp summary{padding:7px 9px;font-weight:600;cursor:pointer;color:#0b7c8c}
  #mdb .hp details>div{padding:0 10px 8px}
  #mdb .hp ol,#mdb .hp ul{margin:4px 0;padding-left:18px} #mdb .hp li{margin:3px 0}
  #mdb .hp p{margin:4px 0} #mdb .hp code{background:#e2e8f0;border-radius:4px;padding:0 3px;font-size:12px}
  #mdb .hp .vbtn{display:block;width:100%;margin:2px 0 8px;padding:8px;border:0;border-radius:8px;background:#0f172a;color:#fff;font-size:13px;font-weight:600;text-align:left}
  #mdb .hp video{display:block;width:100%;border-radius:8px;margin:2px 0 8px;background:#000}
  #mdb .hp .all{display:block;text-align:center;margin:6px 0 2px;font-weight:600;color:#0b7c8c}
  #mdb .hp .back{width:100%;margin-top:8px;padding:10px;border:0;border-radius:8px;background:#0b7c8c;color:#fff;font-size:15px;font-weight:600}
  `;
  const HELP = `
   <p><b>What this bot does:</b> it watches the last digit of every price tick and, when your rule
   (“Trade when”) happens, it presses the trade button for you, with your stake, until a limit stops it.</p>
   <button class="vbtn" data-v="intro">▶ Watch: what this bot does (1:20)</button>
   <a class="all" href="https://isaacedwards-kawuma.github.io/digitbot/tutorials.html" target="_blank" rel="noopener">🎬 All tutorial videos on one page</a>
   <p style="font-size:12px;color:#475569">🏠 in the green bar opens the Welcome screen: MMG digits, 💱 Forex or ₿ Crypto.</p>
   <details><summary>Auto or Manual?</summary><div><button class="vbtn" data-v="automanual">▶ Watch the video (0:55)</button><ul>
    <li><b>⚡ Auto</b>: pick a strategy, press <b>Start auto</b>. The bot trades by itself with the strategy's settings.</li>
    <li><b>✋ Manual</b>: you choose the button, digit, stake and limits. <b>Trade once now</b> places one trade at once;
        <b>Start</b> lets the bot trade with your settings when “Trade when” happens.</li>
   </ul></div></details>
   <details><summary>🧪 Testing a strategy</summary><div><button class="vbtn" data-v="tester">▶ Watch the video (1:01)</button>
    <p>In ⚡ Auto, <b>Test this strategy</b> plays your current settings 1000 times on random digits (that is how the
    real ticks behave) with the same trigger, cooldown and limits, without money. It shows how often a run ends in
    profit, hits the stop-loss or the take-profit, and the average result. Lucky runs are common; the average is
    what you keep over time.</p></div></details>
   <details><summary>📊 Stats and the daily loss limit</summary><div><button class="vbtn" data-v="stats">▶ Watch the video (1:12)</button><ul>
    <li>The <b>📊 Stats</b> tab lists every trade the bot placed, with win / loss and profit, and shows
        today's and all-time win rate, P/L, the longest losing run and the return on the money staked.</li>
    <li><b>Download history (CSV)</b> saves it as a spreadsheet file.</li>
    <li><b>Check the digits</b>: the bot saves every tick it sees. “Check the saved ticks” tests them for patterns
        (digit frequencies, repeats, streaks, rise/fall) and tells you plainly whether any pattern exists.</li>
    <li><b>Daily loss limit</b>: when today's losses reach it, the bot stops and will not trade again until tomorrow
        (counted per device and per account type). Default $20; 0 turns it off.</li>
   </ul></div></details>
   <details><summary>Easiest: pick a strategy</summary><div><button class="vbtn" data-v="quickauto">▶ Watch the video (1:25)</button><ol>
    <li>Open the game (Manual Trader) on <b>DEMO</b>.</li>
    <li>Open the <b>⚡ Auto</b> tab and choose a <b>Strategy</b>. All settings are filled in for you
        (LIVE clicks on). Set <b>Stake per trade</b>: stop-loss and take-profit become 10 × stake.</li>
    <li>Press <b>Start</b>, check the summary and press OK. The bot sets up the game and trades by itself
        until a limit is reached. <b>Stop</b> stops at once.</li>
   </ol><p>Changing a setting afterwards switches to <b>Custom</b> (your own settings).</p></div></details>
   <details><summary>The strategies</summary><div><button class="vbtn" data-v="strategies">▶ Watch the video (1:11)</button><ul>
    <li><b>Differ – after its own digit</b>: when 7 shows, bet NOT 7. Wins ~9 in 10, small wins, one loss ≈ 10 wins.</li>
    <li><b>Differ – steady every tick</b>: bets NOT 0 on every tick, 4 s apart.</li>
    <li><b>Match – hot digit</b>: after 5 shows twice in a row, bet 5. Wins ~1 in 10, pays ~8x.</li>
    <li><b>Over 2 / Under 7</b>: win ~7 in 10 each, small wins, bigger losses.</li>
    <li><b>Over 4 – after 0 shows</b>: after a 0, bet the result is 5-9. Wins ~1 in 2.</li>
    <li><b>Even after 3 odd / Odd after 3 even</b>: waits for a streak, then bets the other side. Wins ~1 in 2.</li>
    <li><b>Even – steady every tick</b>: bets Even every 5 s.</li>
    <li><b>Rise / Fall – 5 ticks</b>: bets the price is higher / lower after 5 ticks, 6 s apart.</li>
   </ul><p><b>Honestly:</b> digits are random, so a streak or a “hot” digit does not change the next tick.
   The strategies only change how often you trade and how big the swings are. All of them lose about 1% per trade on average.</p></div></details>
   <details><summary>Quick start with your own settings (Manual tab)</summary><div><button class="vbtn" data-v="manual">▶ Watch the video (1:32)</button><ol>
    <li>In the game, open <b>Manual Trader</b> and make sure the account says <b>DEMO</b>.</li>
    <li><b>Button</b>: what to buy (e.g. Differ). Choose the <b>Pick digit</b> / Barrier / Duration if shown.</li>
    <li><b>Stake</b>: money per trade, e.g. <code>1</code>. Tick <b>Set up the game for me</b>.</li>
    <li><b>Trade when</b>: e.g. <code>digit 7</code>, <b>Times in a row</b> <code>1</code>. Set the limits (below).</li>
    <li>Press <b>Start</b> without “LIVE clicks” first: it only shows what it <i>would</i> do.
        Happy? Tick <b>LIVE clicks</b> and press Start again. <b>Stop</b> stops at once.</li>
   </ol></div></details>
   <details><summary>How the bot plays, step by step</summary><div><button class="vbtn" data-v="howitplays">▶ Watch the video (1:17)</button><ol>
    <li>Checks the account (refuses REAL unless “Allow REAL”), that there are no open trades and that it can read the page.</li>
    <li>If “Set up the game for me” is ticked, it selects the game mode, digit/barrier/duration and types the stake. If you change them in the game, it changes them back.</li>
    <li>Every tick it reads the new last digit (shown in the digits row).</li>
    <li>If the digit matches “Trade when” for “Times in a row” ticks, it does the safety checks: stake ≤ max stake, and <i>losing this trade would not go past the stop-loss</i>.</li>
    <li>Then it clicks the button (LIVE) or just writes “would click” (not LIVE), and waits the cooldown.</li>
    <li>A contract settles a few ticks later; balance and P/L update.</li>
    <li>It stops by itself at: max trades, max minutes, stop-loss, take-profit, a frozen chart or a changed page.</li>
   </ol></div></details>
   <details><summary>The buttons (what you win on)</summary><div><button class="vbtn" data-v="strategies">▶ Watch the video (1:11)</button><ul>
    <li><b>Differ</b>: wins if the final digit is <i>not</i> your pick (~9 in 10), but pays very little.</li>
    <li><b>Match</b>: wins only if the final digit <i>is</i> your pick (~1 in 10), pays a lot.</li>
    <li><b>Over / Under</b>: final digit above / below the Barrier.</li>
    <li><b>Even / Odd</b>: final digit even / odd (~1 in 2).</li>
    <li><b>Rise / Fall</b>: price higher / lower after the Duration (5t = 5 ticks).</li>
   </ul><p>The grey line under Stake shows the win chance, the payout and the expected result per trade.</p></div></details>
   <details><summary>Every setting explained (safety)</summary><div><button class="vbtn" data-v="safety">▶ Watch the video (1:22)</button><ul>
    <li><b>Trade when</b>: the digit that starts a trade: a digit 0-9, any even, any odd, or every tick.</li>
    <li><b>Times in a row</b>: how many ticks in a row must match first (1 = straight away).</li>
    <li><b>Max trades</b>: stop after this many trades.</li>
    <li><b>Max minutes</b>: stop after this much time.</li>
    <li><b>Stop-loss ($)</b>: stop when you are this much down. It also <b>skips any trade whose loss would go past it</b>, so it must be at least as big as the Stake.</li>
    <li><b>Take-profit ($)</b>: stop when you are this much up.</li>
    <li><b>Max stake ($)</b>: refuses to trade if the game stake is higher (catches a stake that jumped).</li>
    <li><b>Cooldown (s)</b>: seconds to wait after each trade.</li>
    <li><b>LIVE clicks</b>: off = practice (no clicks), on = really trades.</li>
    <li><b>Allow REAL</b>: needed to trade a real-money account. Leave it off.</li>
   </ul></div></details>
   <details><summary>Messages and problems</summary><div><button class="vbtn" data-v="problems">▶ Watch the video (1:09)</button><ul>
    <li><b>“skipped - … past the $X stop-loss”</b>: losing this trade would cost more than the stop-loss allows. Lower the <b>Stake</b> or raise the <b>Stop-loss</b>.</li>
    <li><b>“stake is above your max stake”</b>: raise Max stake or lower the stake in the game.</li>
    <li><b>“This is a REAL account”</b>: switch the game to DEMO (or tick Allow REAL).</li>
    <li><b>“Can't find the digit circles / price”</b>: open the Manual Trader page, then press Start.</li>
    <li><b>“Wait until your open trades have finished”</b>: wait for the Open (N) trades to settle.</li>
    <li>Panel gone? Tap the Digit Bot bookmark again.</li>
    <li><b>⧉ Float</b>: on a PC (Chrome/Edge) the whole bot moves into a small window that stays on top of other apps.
      On a phone a small live status window floats over other apps (its ⏸ stops the bot); open the game again for the settings.
      While floating the bot keeps trading in the background; if the site stops sending ticks there, it stops itself.</li>
    <li><b>📱 Phone</b>: the bot sits at the bottom of the screen. Tap its title bar to switch half / full / small bar.</li>
    <li><b>Floating bubble</b>: “–” shrinks the bot to a small bubble showing LIVE, trades and P/L.
        Drag it anywhere; tap it to open. The place is remembered.</li>
    <li>The screen stays on while the bot runs. If you switch to another app or tab, the bot <b>pauses</b>
        and <b>carries on</b> when you come back to the game (limits and the daily loss limit still apply).</li>
    <li><b>🔔 alerts</b>: a sound (and a buzz on Android) when the bot stops by itself: happy notes for a profit,
        low notes for a loss or a limit. iPhone: the ringer switch must be on for sound.</li>
   </ul></div></details>
   <details><summary>📱 On your phone: bubble and pausing</summary><div><button class="vbtn" data-v="phone">▶ Watch the video (0:53)</button>
    <p>“–” shrinks the bot to a bubble showing LIVE, trades and P/L; drag it anywhere, tap it to open.
    The screen stays on while the bot runs. If you switch to another app it pauses, and carries on when you come back.</p></div></details>
   <details><summary>Example setups</summary><div><button class="vbtn" data-v="manual">▶ Watch the video (1:32)</button><ul>
    <li><b>First test</b>: Differ, pick 7, stake 1, every tick, max trades 1, stop-loss 10, max stake 1, LIVE on.</li>
    <li><b>Wait for a digit</b>: Differ, pick 5, Trade when “digit 5”, 2 in a row, max trades 10, stop-loss 10.</li>
    <li><b>Even/Odd</b>: Even, stake 1, Trade when “any odd digit”, 3 in a row, stop-loss 5, take-profit 5.</li>
   </ul></div></details>
   <details><summary>Honest truth about winning</summary><div><button class="vbtn" data-v="tester">▶ Watch the video (1:01)</button>
    <p>Every tick is random: past digits do not change the next one, so no rule or bot can predict it.
    Every option on this site pays slightly less than its fair odds, about <b>-1% per trade</b> on average.
    Differ wins ~9 of 10, but one loss wipes out ~10 wins. Practise on DEMO, always use a stop-loss,
    and never trade money you need.</p></div></details>
   <button class="back" id="mdbBack">← Back to the bot</button>`;
  const style = document.createElement("style"); style.textContent = css;
  const box = document.createElement("div"); box.id = "mdb";
  const opt = (v, t) => `<option value="${v}">${t}</option>`;
  box.innerHTML = `
  <div class="hd"><b>🤖 Digit Bot</b><span id="mdbBadge"></span><button id="mdbHome" title="Welcome: MMG, Forex or Crypto">🏠</button><button id="mdbHelp" title="Help: how the bot works">?</button><button id="mdbFloat" title="Float: keep the bot on top of other apps">⧉</button><button id="mdbMin">–</button><button id="mdbX">✕</button></div>
  <div class="bd">
   <div class="tabs"><button id="tabAuto">⚡ Auto</button><button id="tabMan">✋ Manual</button><button id="tabBuild">🧩 Rounds</button><button id="tabStats">📊 Stats</button></div>
   <div class="g" id="pAuto">
    <div class="tip">Auto trading: pick a strategy, press Start. The bot trades by itself until a limit stops it.</div>
    <div class="sec">Strategy</div>
    <label style="grid-column:1/3">Pick a strategy (fills in all settings), then press Start
     <select id="f_strategy"><option value="custom">Custom – my own settings</option>${
      [...new Set(STRATEGIES.map(s => s.group))].map(g => `<optgroup label="${g}">` +
        STRATEGIES.filter(s => s.group === g).map(s => opt(s.id, s.name)).join("") + "</optgroup>").join("")}</select></label>
    <label>Stake per trade ($)<input id="f_autoStake" type="number" min="0.35" step="0.01" inputmode="decimal"></label>
    <div class="tip" style="grid-column:auto;align-self:end">A new stake resets stop-loss and take-profit to 10 × stake (you can change them).</div>
    <label style="grid-column:1/3">Stake plan<select id="f_plan">${Object.entries(PLANS).map(([k, v]) => opt(k, v)).join("")}</select></label>
    <label id="w_planMult">Multiply by<input id="f_planMult" type="number" min="1.1" max="3" step="0.1" inputmode="decimal"></label>
    <label id="w_planSteps">Max steps, then reset<input id="f_planSteps" type="number" min="1" max="8" step="1" inputmode="numeric"></label>
    <div class="tip" id="mdbPlanTip" style="grid-column:1/3"></div>
    <label>Stop-loss ($)<input id="f_aSL" type="number" min="0" step="0.01" inputmode="decimal"></label>
    <label>Take-profit ($)<input id="f_aTP" type="number" min="0" step="0.01" inputmode="decimal"></label>
    <div class="odds" id="mdbStratDesc"></div>
    <div class="odds" id="mdbOdds2"></div>
    <button class="once" id="mdbTest">🧪 Test this strategy (1000 practice runs, no money)</button>
    <div class="odds" id="mdbTestOut" style="display:none"></div>
   </div>
   <div class="g" id="pMan">
    <div class="tip">Manual trading: choose everything yourself. Press <b>Trade once now</b> for a single trade,
     or <b>Start</b> to let the bot trade with these settings.</div>
    <div class="sec">Trade</div>
    <label>Button<select id="f_button">${BUTTONS.map(b => opt(b, b[0].toUpperCase() + b.slice(1))).join("")}</select></label>
    <label id="w_pick"><span id="l_pick">Pick digit</span><select id="f_pick">${[...Array(10).keys()].map(i => opt(i, i)).join("")}</select></label>
    <label id="w_duration">Duration<select id="f_duration">${DURATIONS.map(d => opt(d, d)).join("")}</select></label>
    <label>Stake ($)<input id="f_stakeSet" type="number" min="0.35" step="0.01" inputmode="decimal"></label>
    <label class="ck" style="grid-column:1/3"><input id="f_autoSetup" type="checkbox">Set up the game for me (mode, pick, stake)</label>
    <div class="odds" id="mdbOdds"></div>
    <button class="once" id="mdbOnce">Trade once now</button>
    <div class="sec">When (for Start)</div>
    <label>Trade when<select id="f_trigger">${TRIGGERS.map(([v, t]) => opt(v, t)).join("")}</select></label>
    <label>Times in a row<input id="f_inRow" type="number" min="1" max="10" inputmode="numeric"></label>
    <div class="sec">Limits</div>
    <label>Max trades<input id="f_maxTrades" type="number" min="1" inputmode="numeric"></label>
    <label>Max minutes<input id="f_maxMinutes" type="number" min="1" inputmode="numeric"></label>
    <label>Stop-loss ($)<input id="f_stopLoss" type="number" min="0" step="0.01" inputmode="decimal"></label>
    <label>Take-profit ($)<input id="f_takeProfit" type="number" min="0" step="0.01" inputmode="decimal"></label>
    <label>Max stake ($)<input id="f_maxStake" type="number" min="0" step="0.01" inputmode="decimal"></label>
    <label>Cooldown (s)<input id="f_cooldown" type="number" min="0" step="0.5" inputmode="decimal"></label>
    <label class="ck"><input id="f_live" type="checkbox">LIVE clicks</label>
    <label class="ck"><input id="f_allowReal" type="checkbox">Allow REAL</label>
   </div>
   <div class="g" id="pStats">
    <div class="sec">Today</div>
    <div class="stx" id="stToday"></div>
    <label>Daily loss limit ($)<input id="f_dayLimit" type="number" min="0" step="0.01" inputmode="decimal"></label>
    <div class="tip" style="grid-column:auto;align-self:end">Stops all trading for the rest of the day when today's loss reaches this. 0 = off.</div>
    <div class="odds" id="stDay"></div>
    <div class="sec">All saved trades</div>
    <div class="stx" id="stAll"></div>
    <div class="tbl" id="stTable"></div>
    <button class="once" id="stCsv">Download history (CSV)</button>
    <button class="clr" id="stClear">Clear history</button>
    <div class="sec">Check the digits: is there a pattern?</div>
    <div class="tip">The bot saves every tick it sees on this device, also when it is not trading.
     Leave the game open (an hour is good), then check. More ticks = a surer answer.</div>
    <div class="stx" id="tkSum"></div>
    <button class="once" id="tkCheck">🔍 Check the saved ticks</button>
    <div class="odds" id="tkOut" style="display:none;grid-column:1/3"></div>
    <button class="clr" id="tkCsv" style="border-color:#cbd5e1;color:#0f172a">Download ticks (CSV)</button>
    <div class="tip">Only trades placed by the bot are listed (this device, the account type shown: DEMO or REAL).
     Totals are exact; if you also trade by hand while the bot runs, single results can be mixed up.</div>
   </div>
   <div class="st">
    <div class="row"><span id="mdbAcc">account: ?</span><span id="mdbBal">balance: ?</span></div>
    <div class="row"><span id="mdbSym">?</span><span id="mdbStake">stake: ?</span></div>
    <div class="row"><span id="mdbRun">stopped</span><span id="mdbPL"></span></div>
    <div class="dg" id="mdbDigits">waiting for ticks…</div>
   </div>
   <label class="ck" style="margin:0 0 6px"><input id="f_alerts" type="checkbox">🔔 Sound + vibrate when the bot stops</label>
   <div class="go"><button class="start" id="mdbStart">Start</button><button class="stop" id="mdbStop">Stop</button></div>
   <div class="log" id="mdbLog"></div>
  </div>
  <div class="hp" id="mdbHelpBox">${HELP}</div>
  <div class="wl">
   <h3>Welcome! What do you want to trade?</h3>
   <div class="sub">Everything starts on DEMO / practice money.</div>
   <button class="ch" id="wlMmg"><span class="ic">🎯</span><span><b>MMG digits</b><small>Trade Match/Differ, Over/Under, Even/Odd, Rise/Fall on this game</small></span></button>
   <button class="ch" id="wlFx"><span class="ic">💱</span><span><b>Forex</b><small>EUR/USD, GBP/USD, gold: charts, signals, backtests, practice trading</small></span></button>
   <button class="ch" id="wlCr"><span class="ic">₿</span><span><b>Crypto</b><small>Bitcoin, Ethereum and more: charts, signals, backtests, practice trading</small></span></button>
   <label class="ck2"><input type="checkbox" id="wlShow"> Show this screen every time the bot opens</label>
  </div>`;
  // Forex / Crypto open in a big window on top of the game (the web app, same as the DigitBot website)
  const TRADE_URL = "https://isaacedwards-kawuma.github.io/digitbot/trade.html?embed=1";
  const tw = document.createElement("div"); tw.id = "mdbTrade";
  tw.innerHTML = `<div class="tb"><b id="twTitle">Trading</b><button id="twHome">🏠 Welcome</button><button id="twFx">💱 Forex</button>
    <button id="twCr">₿ Crypto</button><button id="twMmg">🎯 MMG bot</button><button id="twX">✕ Close</button></div><iframe id="twFrame" title="DigitBot trading"></iframe>`;
  const $ = id => box.querySelector("#" + id);
  function mount() {
    if (!document.body) return;
    if (!document.getElementById("mdb") && !(typeof pipWin !== "undefined" && pipWin)) { document.head.appendChild(style); document.body.appendChild(box); }
    if (!document.getElementById("mdbTrade")) document.body.appendChild(tw);
  }
  mount();
  setInterval(mount, 2000);   // the site is a single-page app: re-attach if it re-renders

  const TEXT_FIELDS = { button: 1, trigger: 1, duration: 1, plan: 1 };
  const FIELDS = ["button", "pick", "duration", "stakeSet", "autoSetup", "trigger", "inRow", "cooldown", "maxTrades",
                  "maxMinutes", "stopLoss", "takeProfit", "maxStake", "live", "allowReal", "dayLimit", "alerts", "plan", "planMult", "planSteps"];
  for (const f of FIELDS) {
    const el = $("f_" + f);
    if (el.type === "checkbox") el.checked = !!S[f]; else el.value = S[f];
    el.addEventListener("change", () => {
      if (running && ["button", "pick", "duration", "stakeSet", "autoSetup", "plan", "planMult", "planSteps"].includes(f)) {
        log("Stop the bot before changing the trade settings.", "warn");
        if (el.type === "checkbox") el.checked = !!S[f]; else el.value = S[f];
        return;
      }
      S[f] = el.type === "checkbox" ? el.checked : TEXT_FIELDS[f] ? el.value : parseFloat(el.value);
      if (f === "allowReal" && el.checked && !confirm("Allow trading on a REAL money account?\n\nThe bot cannot predict digits. Only use money you can afford to lose.")) { el.checked = false; S[f] = false; }
      if (f === "plan" && S.plan !== "flat" && !confirm(`${PLANS[S.plan]}\n\nThis does NOT improve the odds: the average loss per trade stays the same. It turns many small results into ` +
          `rare big ones (Martingale: a run of losses multiplies the stake fast). The bot caps it at your max steps and max stake. Press 🧪 Test to see it. Use it?`)) { S.plan = "flat"; el.value = "flat"; }
      if (!["live", "allowReal", "dayLimit", "alerts", "plan", "planMult", "planSteps"].includes(f)) S.strategy = "custom";   // you changed a strategy's setting
      save(); refreshForm();
    });
  }
  function fillForm() {
    for (const f of FIELDS) { const el = $("f_" + f); if (el.type === "checkbox") el.checked = !!S[f]; else el.value = S[f]; }
    $("f_aSL").value = S.stopLoss; $("f_aTP").value = S.takeProfit;
  }
  $("f_strategy").addEventListener("change", () => {
    const el = $("f_strategy");
    if (running || busy) { log("Stop the bot before choosing another strategy.", "warn"); el.value = S.strategy; return; }
    const st = strategyById(el.value);
    S.strategy = el.value;
    if (st) {
      applyStrategy(st);
      log(`strategy: ${st.name} - settings filled in. Check the account is DEMO, then press Start.`, "ok");
    }
    save(); refreshForm();
  });
  const r2 = x => Math.round(x * 100) / 100;
  function applyStrategy(st) {
    const k = +S.autoStake > 0 ? +S.autoStake : 1;
    Object.assign(S, SAFE, st.set, { stakeSet: r2(k), maxStake: r2(k), stopLoss: r2(10 * k), takeProfit: r2(10 * k) });
    fillForm();
  }
  $("f_autoStake").value = S.autoStake;
  $("f_aSL").value = S.stopLoss; $("f_aTP").value = S.takeProfit;
  for (const [id, key] of [["f_aSL", "stopLoss"], ["f_aTP", "takeProfit"]]) {
    $(id).addEventListener("change", () => {
      const v = parseFloat($(id).value);
      if (!(v >= 0)) { $(id).value = S[key]; return; }
      S[key] = Math.round(v * 100) / 100; fillForm(); save(); refreshForm();
      log(`${key === "stopLoss" ? "stop-loss" : "take-profit"} set to $${S[key]}`, "ok");
    });
  }
  $("f_autoStake").addEventListener("change", () => {
    const el = $("f_autoStake"), v = parseFloat(el.value);
    if (running || busy) { log("Stop the bot before changing the stake.", "warn"); el.value = S.autoStake; return; }
    if (!(v >= 0.35)) { log("The smallest stake is $0.35.", "warn"); el.value = S.autoStake; return; }
    S.autoStake = r2(v); el.value = S.autoStake;
    const st = strategyById(S.strategy);
    if (st) { applyStrategy(st); log(`stake $${S.autoStake}: stop-loss $${S.stopLoss}, take-profit $${S.takeProfit}`, "ok"); }
    save(); refreshForm();
  });
  function planTip() {
    const base = +S.stakeSet || 1, ps = { step: 0 }, seq = [base]; let cur = base;
    for (let k = 0; k < +S.planSteps; k++) { cur = planNext(S.plan, base, cur, S.plan === "paroli" ? "win" : "loss", ps, +S.planMult, +S.planSteps); seq.push(r2(cur)); }
    const top = Math.max(...seq), total = seq.slice(0, -1).reduce((a, b) => a + b, 0) + seq[seq.length - 1];
    return S.plan === "flat" ? "Flat: the stake never changes. The safest choice." :
      `Stakes in a ${S.plan === "paroli" ? "winning" : "losing"} run: ${seq.map(v => "$" + v).join(" → ")}. Highest stake <b>$${top}</b>` +
      (S.plan === "paroli" ? "" : `; losing the whole run costs <b>$${r2(total)}</b>`) + `. Max stake is raised to $${r2(top)} while it runs. The average result per trade does not change.`;
  }
  function refreshForm() {
    const st = strategyById(S.strategy);
    $("mdbPlanTip").innerHTML = planTip();
    $("w_planMult").style.display = ["martingale", "paroli"].includes(S.plan) ? "" : "none"; $("w_planSteps").style.display = S.plan === "flat" ? "none" : "";
    $("f_strategy").value = st ? st.id : "custom";
    $("mdbStratDesc").textContent = st ? st.desc + ` Stake $${S.stakeSet}, stop-loss $${S.stopLoss}, take-profit $${S.takeProfit}, max ${S.maxTrades} trades.`
                                       : "Your own settings below. Pick a strategy to fill them in automatically.";
    const needsPick = !!NEEDS_PICK[S.button], rf = MODE[S.button] === "Rise/Fall";
    $("w_pick").style.display = needsPick ? "" : "none";
    $("l_pick").textContent = S.button === "over" || S.button === "under" ? "Barrier" : "Pick digit";
    $("w_duration").style.display = rf ? "" : "none";
  }
  refreshForm();
  function showTab() {
    if (!["auto", "manual", "stats", "build"].includes(S.tab)) S.tab = "auto";
    if (S.tab === "auto" || S.tab === "manual") S.mode = S.tab;          // Start uses the last of Auto / Manual
    if ($("pBuild")) { $("pBuild").style.display = S.tab === "build" ? "" : "none"; $("tabBuild").classList.toggle("on", S.tab === "build"); }
    $("pAuto").style.display = S.tab === "auto" ? "" : "none";
    $("pMan").style.display = S.tab === "manual" ? "" : "none";
    $("pStats").style.display = S.tab === "stats" ? "" : "none";
    $("tabAuto").classList.toggle("on", S.tab === "auto"); $("tabMan").classList.toggle("on", S.tab === "manual");
    $("tabStats").classList.toggle("on", S.tab === "stats");
    $("mdbStart").textContent = S.mode === "manual" ? "Start" : "Start auto";
    if (S.tab === "stats" && statsReady) renderStats();
  }
  $("tabAuto").onclick = () => { S.tab = "auto"; save(); showTab(); };
  $("tabMan").onclick = () => { S.tab = "manual"; save(); showTab(); };
  $("tabStats").onclick = () => { S.tab = "stats"; save(); showTab(); };
  $("tabBuild").onclick = () => { S.tab = "build"; save(); showTab(); };
  const UI_KEY = "mmgDigitBot.ui.v1";
  let UI = {}; try { UI = JSON.parse(localStorage.getItem(UI_KEY) || "{}"); } catch (e) {}
  const saveUI = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(UI)); } catch (e) {} };
  function setMin(m) { box.classList.toggle("min", m); UI.min = m; saveUI(); if (m) box.classList.remove("help"); placeBox(); }
  function placeBox() {   // keep the panel/bubble on screen (after rotate, resize, minimize)
    if (UI.left == null) return;
    const r = box.getBoundingClientRect();
    box.style.left = Math.max(0, Math.min(innerWidth - Math.min(r.width, innerWidth), UI.left)) + "px";
    box.style.top = Math.max(0, Math.min(innerHeight - Math.min(r.height, innerHeight), UI.top)) + "px";
    box.style.bottom = "auto";
  }
  $("mdbMin").onclick = () => setMin(!box.classList.contains("min"));
  if (UI.min) box.classList.add("min");
  // 📱 phone layout: on small or touch screens the panel becomes a bottom sheet (half / full / bar)
  const isPhone = () => UI.layout === "phone" || (UI.layout !== "desk" && (innerWidth <= 700 || matchMedia("(pointer: coarse)").matches && innerWidth <= 1000));
  function applyLayout() {
    box.classList.toggle("phone", isPhone() && !box.classList.contains("pip"));
    ["shalf", "sfull", "sbar"].forEach(c => box.classList.toggle(c, c === "s" + (UI.sheet || "half")));
    if (!box.classList.contains("phone")) placeBox();
  }
  function cycleSheet() { UI.sheet = { half: "full", full: "bar", bar: "half" }[UI.sheet || "half"]; saveUI(); applyLayout(); }
  addEventListener("resize", applyLayout); addEventListener("orientationchange", () => setTimeout(applyLayout, 300));
  applyLayout();
  // ---- welcome screen: MMG digits / Forex / Crypto
  const tq = id => tw.querySelector("#" + id);
  function showWelcome(on) {
    box.classList.toggle("welcome", on);
    if (on) { box.classList.remove("help"); box.classList.remove("min"); }
    placeBox();
  }
  function openTrade(kind) {
    const f = tq("twFrame"), want = TRADE_URL + "#" + kind;
    if (f.getAttribute("src") !== want) f.setAttribute("src", want);
    tq("twTitle").textContent = kind === "forex" ? "💱 Forex" : "₿ Crypto";
    tq("twFx").classList.toggle("on", kind === "forex"); tq("twCr").classList.toggle("on", kind === "crypto");
    tw.classList.add("on"); setMin(true); box.classList.remove("welcome");
    UI.last = kind; saveUI();
  }
  const closeTrade = () => tw.classList.remove("on");
  $("wlShow").checked = UI.welcome !== false;
  $("wlShow").onchange = () => { UI.welcome = $("wlShow").checked; saveUI(); };
  $("wlMmg").onclick = () => { closeTrade(); showWelcome(false); UI.last = "mmg"; saveUI(); };
  $("wlFx").onclick = () => openTrade("forex");
  $("wlCr").onclick = () => openTrade("crypto");
  $("mdbHome").onclick = () => { closeTrade(); showWelcome(!box.classList.contains("welcome")); };
  tq("twFx").onclick = () => openTrade("forex");
  tq("twCr").onclick = () => openTrade("crypto");
  tq("twHome").onclick = () => { closeTrade(); setMin(false); showWelcome(true); };
  tq("twMmg").onclick = () => { closeTrade(); setMin(false); showWelcome(false); };
  tq("twX").onclick = () => { closeTrade(); setMin(false); };
  if (UI.welcome !== false) { box.classList.remove("min"); box.classList.add("welcome"); }
  placeBox();
  addEventListener("resize", placeBox);
  $("mdbHelp").onclick = () => { box.classList.remove("min"); box.classList.remove("welcome"); box.classList.toggle("help"); $("mdbHelpBox").scrollTop = 0; };
  $("mdbBack").onclick = () => { box.classList.remove("help"); box.querySelectorAll(".hp video").forEach(v => v.pause()); };
  const VIDEOS = "https://isaacedwards-kawuma.github.io/digitbot/videos/";
  $("mdbHelpBox").addEventListener("click", e => {
    const b = e.target.closest(".vbtn"); if (!b) return;
    const v = document.createElement("video");
    v.src = VIDEOS + b.dataset.v + ".mp4"; v.poster = VIDEOS + b.dataset.v + ".jpg";
    v.controls = true; v.playsInline = true; v.setAttribute("playsinline", ""); v.preload = "auto";
    b.replaceWith(v); v.play().catch(() => {});
  });
  $("mdbX").onclick = () => { stop("panel closed"); box.style.display = "none"; };

  // drag the panel by its header (mouse + touch)
  (() => {
    const hd = box.querySelector(".hd"); let sx, sy, ox, oy, drag = false, moved = false;
    hd.addEventListener("pointerdown", e => { if (e.target.tagName === "BUTTON") return;
      if (box.classList.contains("phone") && !box.classList.contains("min")) { cycleSheet(); return; }   // phone sheet: tap = half / full / bar
      if (box.classList.contains("pip")) return;
      drag = true; moved = false; sx = e.clientX; sy = e.clientY;
      const r = box.getBoundingClientRect(); ox = r.left; oy = r.top; hd.setPointerCapture(e.pointerId); });
    hd.addEventListener("pointermove", e => { if (!drag) return;
      if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 6) moved = true; if (!moved) return;
      box.style.left = Math.max(0, Math.min(innerWidth - 60, ox + e.clientX - sx)) + "px";
      box.style.top = Math.max(0, Math.min(innerHeight - 40, oy + e.clientY - sy)) + "px"; box.style.bottom = "auto"; });
    hd.addEventListener("pointerup", () => {
      if (!drag) return; drag = false;
      if (moved) { const r = box.getBoundingClientRect(); UI.left = r.left; UI.top = r.top; saveUI(); }
      else if (box.classList.contains("min")) setMin(false);   // tap on the bubble = open
    });
    hd.addEventListener("pointercancel", () => { drag = false; });
  })();

  // ⧉ FLOAT: keep the bot on top of other apps
  //   PC Chrome/Edge: the whole panel moves into an always-on-top window (Document Picture-in-Picture); buttons work.
  //   Phones / other browsers: a small live status "video" floats over other apps (Picture-in-Picture); its ⏸ stops the bot.
  //   While floating the bot keeps trading when the game page is in the background - if the site stops sending ticks
  //   there, the bot notices (no new ticks for 15 s) and stops itself.
  var pipWin = null, pipVid = null;
  const pipActive = () => !!pipWin || !!(pipVid && document.pictureInPictureElement === pipVid);
  async function floatOn() {
    if (pipActive()) return floatOff();
    if (window.documentPictureInPicture && !isPhone()) {
      try {
        pipWin = await documentPictureInPicture.requestWindow({ width: 360, height: 640 });
        const st2 = pipWin.document.createElement("style"); st2.textContent = css + "body{margin:0}"; pipWin.document.head.appendChild(st2);
        pipWin.document.title = "Digit Bot";
        box.classList.add("pip"); box.classList.remove("min", "phone"); pipWin.document.body.appendChild(box);
        pipWin.addEventListener("pagehide", () => { box.classList.remove("pip"); pipWin = null; document.body.appendChild(box); applyLayout(); log("floating window closed - the bot is back on the page"); });
        log("⧉ floating: the bot stays on top of other apps. Close that window to bring it back.", "ok");
        return;
      } catch (e) { log("couldn't open the floating window (" + (e.message || e) + ") - trying the small status window", "warn"); }
    }
    try {
      const cv = document.createElement("canvas"); cv.width = 400; cv.height = 225;
      pipVid = document.createElement("video"); pipVid.muted = true; pipVid.playsInline = true; pipVid.srcObject = cv.captureStream(4);
      const draw = () => {
        const g = cv.getContext("2d"), on = running || RB.on, st = RB.on ? RB.st : null;
        g.fillStyle = on ? "#064e3b" : "#1e293b"; g.fillRect(0, 0, 400, 225);
        g.fillStyle = "#fff"; g.font = "bold 26px system-ui"; g.fillText("🤖 Digit Bot  " + (on ? "● LIVE" : "■ stopped"), 16, 40);
        g.font = "bold 64px ui-monospace,monospace"; g.fillText(digits.length ? String(digits[digits.length - 1]) : "–", 16, 120);
        g.font = "22px system-ui"; g.fillStyle = "#cbd5e1"; g.fillText(digits.slice(-12).join(" "), 90, 112);
        const pl = st ? st.pl : (startBal != null && balance() != null && running ? balance() - startBal : null);
        g.fillStyle = pl == null ? "#e2e8f0" : pl >= 0 ? "#86efac" : "#fca5a5"; g.font = "bold 28px system-ui";
        g.fillText(pl == null ? "" : `P/L ${pl >= 0 ? "+" : "-"}$${Math.abs(pl).toFixed(2)}`, 16, 170);
        g.fillStyle = "#e2e8f0"; g.font = "22px system-ui";
        g.fillText(`trades ${st ? st.n : trades}${st ? "  next $" + (+(st.next ?? st.stake)).toFixed(2) : ""}${isDemo() ? "  DEMO" : "  REAL"}`, 16, 208);
      };
      draw(); pipVid._t = setInterval(draw, 500);
      await pipVid.play(); await pipVid.requestPictureInPicture();
      if (navigator.mediaSession) {
        navigator.mediaSession.metadata = new MediaMetadata({ title: "Digit Bot", artist: "⏸ = stop the bot" });
        const stopAll = () => { if (RB.on) rbStop("stopped from the floating window"); if (running) stop("stopped from the floating window"); draw(); };
        try { navigator.mediaSession.setActionHandler("pause", () => { stopAll(); pipVid.play(); }); } catch (e) {}
        try { navigator.mediaSession.setActionHandler("play", () => pipVid.play()); } catch (e) {}
      }
      pipVid.addEventListener("leavepictureinpicture", () => { clearInterval(pipVid._t); pipVid = null; log("status window closed"); });
      log("⧉ status window floats over other apps (⏸ in it stops the bot). Start and settings stay in the panel.", "ok");
    } catch (e) {
      pipVid = null;
      log("This browser can't float windows over other apps (" + (e.message || e) + "). Chrome on Android or Chrome/Edge on a PC can.", "warn");
    }
  }
  function floatOff() {
    if (pipWin) { pipWin.close(); return; }
    if (pipVid && document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
  }
  $("mdbFloat").onclick = floatOn;

  const logLines = [];
  function log(msg, cls) {
    const t = new Date().toTimeString().slice(0, 8);
    logLines.push(`<div class="${cls || ""}">${t} ${msg}</div>`); if (logLines.length > 200) logLines.shift();
    const L = $("mdbLog"); L.innerHTML = logLines.join(""); L.scrollTop = L.scrollHeight;
  }

  // ------------------------------------------------------------------ engine
  let running = false, finishing = null, busy = false, t0 = 0, trades = 0, lastClick = 0, run = 0, startBal = null;
  let lastPrice = null, lastTickAt = Date.now(), pending = null;
  const digits = [];
  const describe = () => `${S.button.toUpperCase()}` + (NEEDS_PICK[S.button] ? ` ${S.pick}` : "") +
                         (MODE[S.button] === "Rise/Fall" ? ` ${S.duration}` : "");
  const triggerText = () => (TRIGGERS.find(t => t[0] === S.trigger) || [0, S.trigger])[1];
  function triggerHit(d) {
    if (S.trigger === "any") return true;
    if (S.trigger === "even") return d % 2 === 0;
    if (S.trigger === "odd") return d % 2 === 1;
    return d === +S.trigger;
  }

  async function start() {
    if (running || busy) return;
    if (S.mode !== "manual" && !strategyById(S.strategy)) { log("Pick a strategy first (or use the Manual tab).", "warn"); return; }
    const demo = isDemo(), bal = balance();
    { const why = dayBlock(0); if (why) { log(why, "warn"); return; } }
    if (!demo && !S.allowReal) { log(noDemoMsg(), "warn"); return; }
    if (!circleRow() || !priceText()) { log("Can't find the digit circles / price. Open the Manual Trader page.", "warn"); return; }
    if (bal == null) { log("Can't read your balance - not starting.", "warn"); return; }
    if (openTrades()) { log("Wait until your open trades have finished, then press Start.", "warn"); return; }
    if (S.autoSetup) {
      if (+S.stakeSet > +S.maxStake) { log(`Stake $${S.stakeSet} is above your max stake $${S.maxStake}.`, "warn"); return; }
      busy = true; $("mdbStart").disabled = true;
      log(`setting up the game: ${describe()}, $${S.stakeSet}…`);
      try { await setupGame(); log("game is set up ✓", "ok"); }
      catch (e) { log("setup failed: " + e, "warn"); busy = false; $("mdbStart").disabled = false; return; }
      busy = false; $("mdbStart").disabled = false;
    } else if (!tradeButton(S.button)) { log(`Can't see the ${S.button.toUpperCase()} button - pick that game mode first.`, "warn"); return; }
    const b = tradeButton(S.button);
    if (b && b.disabled) { log(`${S.button.toUpperCase()} is unavailable right now.`, "warn"); return; }
    if (S.live) {
      const st = stake(), odds = oddsText().replace(/<[^>]+>/g, "");
      const sn = strategyById(S.strategy);
      const msg = `${demo ? "DEMO" : "⚠ REAL MONEY"} account\n${sn ? "Strategy: " + sn.name + "\n" : ""}${MODE_NAME[MODE[S.button]]}: press ${describe()}\n` +
                  `when ${triggerText()} shows ${S.inRow}x in a row\nStake: $${st == null ? "?" : st}   Max trades: ${S.maxTrades}\n` +
                  `Stop-loss $${S.stopLoss}  Take-profit $${S.takeProfit}\n${odds}\n\nStart?`;
      if (!confirm(msg)) return;
    }
    if (S.plan !== "flat") {
      const ps = { step: 0 }; let cur = +S.stakeSet, top = cur;
      for (let k = 0; k < +S.planSteps; k++) { cur = planNext(S.plan, +S.stakeSet, cur, S.plan === "paroli" ? "win" : "loss", ps, +S.planMult, +S.planSteps); top = Math.max(top, cur); }
      plan = { base: +S.stakeSet, cur: +S.stakeSet, step: 0, seen: null, max: r2(top) };
      if (S.maxStake < plan.max) { S.maxStake = plan.max; fillForm(); }
      log(`stake plan: ${PLANS[S.plan].split(" – ")[0]}, base $${plan.base}, cap $${plan.max} (${S.planSteps} steps)`, "ok");
    }
    keepAwake(true); audioUnlock();
    running = true; finishing = null; t0 = Date.now(); trades = 0; run = 0; startBal = balance(); lastTickAt = Date.now();
    $("mdbStart").disabled = true;
    log(`START ${S.live ? "LIVE" : "WATCH-ONLY"}${strategyById(S.strategy) ? " [" + strategyById(S.strategy).name + "]" : ""}: ${describe()} on ${triggerText()} x${S.inRow}`, "ok");
  }
  let wake = null, plan = { base: 1, cur: 1, step: 0, seen: null, max: 1 };
  async function keepAwake(on) {
    try {
      if (on && !wake && navigator.wakeLock && document.visibilityState === "visible") {
        wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => { wake = null; });
      } else if (!on && wake) { await wake.release(); wake = null; }
    } catch (e) {}
  }
  let hiddenAt = null;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      if (running && hiddenAt) {
        lastTickAt = Date.now(); run = 0; keepAwake(true);
        log(`back after ${Math.round((Date.now() - hiddenAt) / 1000)} s - carrying on`, "ok");
      }
      hiddenAt = null;
    } else if ((running || RB.on) && pipActive()) { log("game page in the background - the bot carries on in the floating window (it stops itself if ticks stop)", "warn"); }
    else if (running) { hiddenAt = Date.now(); log("page hidden - paused. The bot carries on when you come back.", "warn"); }
  });
  let actx = null;
  function audioUnlock() {   // phones only allow sound that was started by a tap: call this from Start
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); } catch (e) {}
  }
  function alertUser(good) {
    if (!S.alerts) return;
    try { navigator.vibrate && navigator.vibrate(good ? [120, 80, 120] : [400, 150, 400]); } catch (e) {}
    if (!actx) return;
    try {
      (good ? [660, 880, 1100] : [440, 330, 220]).forEach((f, i) => {
        const o = actx.createOscillator(), g = actx.createGain(), s = actx.currentTime + i * 0.18;
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.3, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.16);
        o.connect(g); g.connect(actx.destination); o.start(s); o.stop(s + 0.17);
      });
    } catch (e) {}
  }
  function stop(why) {
    if (S.plan !== "flat" && plan.base) { S.stakeSet = plan.base; plan.cur = plan.base; save(); }
    if (!running) return;
    keepAwake(false);
    running = false; finishing = null; $("mdbStart").disabled = false;
    const bal = balance(), pl = bal != null && startBal != null ? bal - startBal : null;
    const note = settled() ? "" : " (trades still open - see the final result in the game)";
    log(`STOP: ${why}. Trades: ${trades}${pl != null ? `, P/L: ${pl >= 0 ? "+" : ""}$${pl.toFixed(2)}` : ""}${note}`, "warn");
    if (why !== "stopped by you" && why !== "panel closed") alertUser(pl != null && pl >= 0 && !/loss|limit/.test(why));
  }
  // Normal limits: place no more trades, let the open ones settle, then stop with the true P/L.
  function finish(why) { if (running && !finishing) { finishing = why; log(`${why} - waiting for open trades to finish…`); } }
  // Manual: place exactly one trade now with the Manual settings (button, pick, stake).
  async function tradeOnce() {
    if (running || busy) { log("The bot is running - press Stop first, then trade by hand.", "warn"); return; }
    const demo = isDemo();
    if (!demo && !S.allowReal) { log(noDemoMsg(), "warn"); return; }
    if (!circleRow() || !priceText()) { log("Can't find the game. Open the Manual Trader page.", "warn"); return; }
    busy = true; $("mdbOnce").disabled = true;
    try {
      if (S.autoSetup && gameProblem()) {
        if (+S.stakeSet > +S.maxStake) { log(`Stake $${S.stakeSet} is above your max stake $${S.maxStake}.`, "warn"); return; }
        log(`setting up the game: ${describe()}, $${S.stakeSet}…`);
        await setupGame(); log("game is set up ✓", "ok");
      }
      const b = tradeButton(S.button), st = stake();
      if (!b) { log(`Can't see the ${S.button.toUpperCase()} button - pick that game mode first.`, "warn"); return; }
      if (b.disabled) { log(`${S.button.toUpperCase()} is unavailable right now.`, "warn"); return; }
      if (st == null) { log("Can't read the stake (Amount) - not trading blind.", "warn"); return; }
      if (st > S.maxStake) { log(`Stake $${st} is above your max stake $${S.maxStake}.`, "warn"); return; }
      if (!demo && !confirm(`⚠ REAL MONEY\nPress ${describe()} for $${st}?`)) return;
      { const why = dayBlock(st); if (why) { log(why, "warn"); return; } }
      ledger(balance());
      b.click(); lastClick = Date.now();
      recordTrade(st, payoutPct(b), null, "manual");
      log(`MANUAL: CLICKED ${describe()} ($${st})`, "ok");
    } catch (e) { log("setup failed: " + e, "warn"); }
    finally { busy = false; $("mdbOnce").disabled = false; }
  }
  // ------------------------------------------------------------------ trade history & daily loss limit
  // The site doesn't report each result to us, so: the stake leaves the balance at the click, and when the
  // "Open (N)" count goes down the oldest open trade(s) settled; money that came back since = their payout.
  const HKEY = "mmgDigitBot.history.v1", HMAX = 3000;
  let H = []; try { H = JSON.parse(localStorage.getItem(HKEY) || "[]"); } catch (e) {}
  const saveH = () => { try { localStorage.setItem(HKEY, JSON.stringify(H.slice(-HMAX))); } catch (e) {} };
  H.forEach(x => { if (x.res === "open") { x.res = "?"; } });          // left open by a reload: unknown
  const waiting = [];
  let ledBal = null, ledOpen = null, credit = 0;
  const events = [];   // a drop of the "Open (N)" count: { k trades, c money back, at resolve time }
  const accNow = () => isDemo() ? "demo" : "real";
  const dayOf = ms => { const d = new Date(ms); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); };
  const money2 = v => (v < 0 ? "-$" : "+$") + Math.abs(v).toFixed(2);
  function recordTrade(st, pay, digit, strat) {
    const x = { t: Date.now(), acc: accNow(), strat, bet: describe(), digit, stake: st, pay, res: "open", profit: null };
    H.push(x); if (H.length > HMAX) H.splice(0, H.length - HMAX);
    waiting.push(x); saveH(); renderStats();
  }
  function settle(k, money) {
    const grp = waiting.splice(0, k); if (!grp.length) return;
    let c = Math.round(money * 100) / 100;
    if (grp.length === 1) { const x = grp[0]; x.res = c > 0 ? "win" : "loss"; x.profit = Math.round((c - x.stake) * 100) / 100; }
    else for (const x of grp) {           // several settled together: share the payout out, oldest first
      const back = x.pay != null ? x.stake * (1 + x.pay / 100) : null;
      if (back != null && c >= back * 0.97) { x.res = "win"; x.profit = Math.round((back - x.stake) * 100) / 100; c -= back; }
      else if (back == null && c > 0) { x.res = "?"; x.profit = Math.round((c - x.stake) * 100) / 100; c = 0; }
      else { x.res = "loss"; x.profit = -x.stake; }
    }
    saveH(); renderStats();
  }
  function ledger(bal) {
    const open = openTrades();
    let back = 0;
    if (bal != null) { if (ledBal != null && bal > ledBal) back = bal - ledBal; ledBal = bal; }
    const drop = open != null && ledOpen != null && open < ledOpen ? ledOpen - open : 0;
    if (open != null) ledOpen = open;
    const pend = events.reduce((s, e) => s + e.k, 0);
    if (drop && waiting.length > pend) {          // our trade(s) just closed: money seen now (or just before) is theirs
      events.push({ k: Math.min(drop, waiting.length - pend), c: credit + back, at: Date.now() + 1200 }); credit = 0;
    } else if (back) {
      const e = events[events.length - 1];
      if (e && Date.now() < e.at) e.c += back;   // the balance updated a moment after the count
      else credit += back;                       // ...or a moment before it
    }
    while (events.length && Date.now() >= events[0].at) { const e = events.shift(); settle(e.k, e.c); }
    // safety nets: nothing open any more, or no "Open (N)" tab on the page -> settle by time
    if (!events.length && waiting.length && Date.now() - lastClick > 4000 &&
        (open === 0 || (open == null && Date.now() - waiting[0].t > 20000))) { settle(open === 0 ? waiting.length : 1, credit); credit = 0; }
    if (!waiting.length && !events.length && open === 0) credit = 0;   // money from trades made by hand
  }
  function today(acc) { const d = dayOf(Date.now()); return H.filter(x => x.acc === acc && dayOf(x.t) === d); }
  function dayLossNow() { return -Math.round(100 * today(accNow()).reduce((s, x) => s + (x.profit || 0), 0)) / 100; }   // whole cents
  // "" = OK to trade; otherwise why not. Counts open stakes as lost (pessimistic).
  function dayBlock(st) {
    if (!(S.dayLimit > 0)) return "";
    const lost = dayLossNow(), open = waiting.reduce((s, x) => s + x.stake, 0);
    if (lost >= S.dayLimit) return `daily loss limit reached: today ${money2(-lost)} (limit $${S.dayLimit}). Trading is blocked until tomorrow (or raise the limit in 📊 Stats).`;
    if (lost + open + st > S.dayLimit) return `this $${st} trade could take today's loss past the $${S.dayLimit} daily limit`;
    return "";
  }
  function summary(list) {
    const done = list.filter(x => x.profit != null);
    const wins = done.filter(x => x.res === "win").length, losses = done.filter(x => x.res === "loss").length;
    let streak = 0, worst = 0; for (const x of done) { streak = x.res === "loss" ? streak + 1 : 0; worst = Math.max(worst, streak); }
    const pl = done.reduce((s, x) => s + x.profit, 0);
    return { n: list.length, wins, losses, rate: wins + losses ? Math.round(100 * wins / (wins + losses)) : null, pl, worst,
             staked: done.reduce((s, x) => s + x.stake, 0), best: Math.max(0, ...done.map(x => x.profit)),
             low: Math.min(0, ...done.map(x => x.profit)) };
  }
  const cell = (label, v, cls) => `<div>${label}<b class="${cls || ""}">${v}</b></div>`;
  function renderStats() {
    if (S.tab !== "stats") return;
    const acc = accNow(), mine = H.filter(x => x.acc === acc), td = summary(today(acc)), all = summary(mine);
    const plc = v => v >= 0 ? "ok" : "warn";
    $("stToday").innerHTML = cell("trades", td.n) + cell("win rate", td.rate == null ? "–" : td.rate + "%") +
      cell("P/L", money2(td.pl), plc(td.pl)) + cell("wins / losses", `${td.wins} / ${td.losses}`) +
      cell("worst loss run", td.worst) + cell("account", acc.toUpperCase(), acc === "demo" ? "ok" : "warn");
    const lost = -Math.round(td.pl * 100) / 100;
    $("stDay").innerHTML = !(S.dayLimit > 0) ? "Daily loss limit is off." :
      lost >= S.dayLimit ? `<span class="warn">Limit reached: trading blocked for today.</span>` :
      `Today you can still lose <b>$${Math.max(0, S.dayLimit - Math.max(0, lost)).toFixed(2)}</b> before the bot stops for the day.`;
    $("stAll").innerHTML = cell("trades", all.n) + cell("win rate", all.rate == null ? "–" : all.rate + "%") +
      cell("total P/L", money2(all.pl), plc(all.pl)) + cell("staked", "$" + all.staked.toFixed(2)) +
      cell("worst loss run", all.worst) + cell("return", all.staked ? (100 * all.pl / all.staked).toFixed(1) + "%" : "–");
    const rows = mine.slice(-40).reverse().map(x => {
      const r = x.res === "win" ? `<span class="ok">✔ ${money2(x.profit)}</span>` : x.res === "loss" ? `<span class="warn">✘ ${money2(x.profit)}</span>`
              : x.res === "open" ? "… open" : x.profit != null ? `? ${money2(x.profit)}` : "?";
      return `<tr><td>${new Date(x.t).toTimeString().slice(0, 8)}</td><td>${x.bet}</td><td>$${x.stake}</td><td>${r}</td></tr>`;
    }).join("");
    tkSummary();
    $("stTable").innerHTML = `<table><tr><th>time</th><th>bet</th><th>stake</th><th>result</th></tr>${rows ||
      '<tr><td colspan="4">No trades yet.</td></tr>'}</table>`;
  }
  $("stCsv").onclick = () => {
    const q = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const lines = ["time,account,strategy,bet,trigger digit,stake,payout %,result,profit"].concat(H.map(x =>
      [new Date(x.t).toLocaleString(), x.acc, x.strat, x.bet, x.digit, x.stake, x.pay, x.res, x.profit].map(q).join(",")));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = `digitbot-history-${dayOf(Date.now())}.csv`; document.body.appendChild(a); a.click(); a.remove();
    log(`history saved: ${H.length} trades`, "ok");
  };
  $("stClear").onclick = () => {
    if (!confirm(`Delete all ${H.length} saved trades on this device?\n(This also resets today's total for the daily loss limit.)`)) return;
    H = []; waiting.length = 0; events.length = 0; credit = 0; saveH(); renderStats(); log("history cleared", "warn");
  };
  $("f_dayLimit").addEventListener("change", () => renderStats());

  // ------------------------------------------------------------------ tick recorder + randomness check
  const TKEY = "mmgDigitBot.ticks.v1", TMAX = 30000;           // ~8 hours of 1-second ticks
  let TK = []; try { TK = JSON.parse(localStorage.getItem(TKEY) || "[]"); } catch (e) {}
  let tkDirty = 0;
  function recordTick(d) {
    const raw = (priceText() || "").replace(/\D/g, "");
    TK.push([Math.round(Date.now() / 100) / 10, d, raw ? +raw : null, symbolName()]);
    if (TK.length > TMAX) TK.splice(0, TK.length - TMAX);
    if (++tkDirty >= 15) { tkDirty = 0; try { localStorage.setItem(TKEY, JSON.stringify(TK)); } catch (e) { TK.splice(0, 5000); } }
    if (S.tab === "stats" && TK.length % 15 === 0) tkSummary();
  }
  function tkSummary() {
    const n = TK.length, hrs = n ? (TK[n - 1][0] - TK[0][0]) / 3600 : 0;
    $("tkSum").innerHTML = cell("ticks saved", n) + cell("over", hrs < 1 ? Math.round(hrs * 60) + " min" : hrs.toFixed(1) + " h") +
      cell("enough?", n >= 3000 ? '<span class="ok">yes</span>' : n >= 1000 ? "fair" : "too few");
  }
  // chi-square p-value (upper tail), via the regularized gamma function
  function lnGamma(z) {
    const g = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
               12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
    z -= 1; let x = 0.99999999999980993; for (let i = 0; i < 8; i++) x += g[i] / (z + i + 1);
    const tt = z + 7.5; return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(tt) - tt + Math.log(x);
  }
  function chiP(x, df) {
    const a = df / 2, y = x / 2; if (y <= 0) return 1;
    let sum = 1 / a, term = 1 / a;
    for (let n = 1; n < 500; n++) { term *= y / (a + n); sum += term; if (term < sum * 1e-12) break; }
    return Math.max(0, 1 - Math.exp(-y + a * Math.log(y) - lnGamma(a)) * sum);
  }
  // Pairs of ticks k apart, only inside unbroken runs (no gap > 3 s between neighbours, same market)
  function pairs(k) {
    const out = [];
    for (let i = 0; i + k < TK.length; i++) {
      let ok = true;
      for (let j = i; j < i + k; j++) if (TK[j + 1][0] - TK[j][0] > 3 || TK[j + 1][3] !== TK[j][3]) { ok = false; break; }
      if (ok) out.push(i);
    }
    return out;
  }
  function checkTicks() {
    const n = TK.length;
    if (n < 300) return `Only ${n} ticks saved. Leave the game open longer (at least 1000 ticks, ideally 3000+), then check again.`;
    const rows = [], z = (obs, exp, cnt) => cnt ? (obs - exp) / Math.sqrt(exp * (1 - exp) / cnt) : 0;
    const flag = zz => Math.abs(zz) >= 3 ? '<span class="warn">unusual</span>' : '<span class="ok">normal</span>';
    // 1. are all digits equally common?
    const f = Array(10).fill(0); TK.forEach(x => f[x[1]]++);
    const chi = f.reduce((s, c) => s + (c - n / 10) ** 2 / (n / 10), 0), pv = chiP(chi, 9);
    rows.push(`<b>1. How often each digit shows</b> (fair = 10% each):<br>` +
      f.map((c, i) => `${i}: ${(100 * c / n).toFixed(1)}%`).join(" · ") +
      `<br>Chance of an unevenness this big by pure luck: ${(100 * pv).toFixed(0)}% → ${pv < 0.001 ? '<span class="warn">unusual</span>' : '<span class="ok">normal</span>'}`);
    // 2. Differ/Match: does a digit come back k ticks later more or less than 10%?
    let worst = 0, txt = [];
    for (let k = 1; k <= 5; k++) {
      const P = pairs(k), same = P.filter(i => TK[i + k][1] === TK[i][1]).length, zz = z(same / P.length, 0.1, P.length);
      worst = Math.max(worst, Math.abs(zz)); txt.push(`${k} tick${k > 1 ? "s" : ""} later: ${(100 * same / P.length).toFixed(1)}%`);
    }
    rows.push(`<b>2. Same digit again</b> (Match/Differ; fair = 10%):<br>${txt.join(" · ")} → ${flag(worst)}`);
    // 3. Even/Odd after a streak of 3
    const P1 = pairs(1); let evA = 0, evN = 0, odA = 0, odN = 0;
    for (const i of P1) {
      if (i < 2 || TK[i][0] - TK[i - 2][0] > 6) continue;
      const a = TK[i - 2][1] % 2, b = TK[i - 1][1] % 2, c = TK[i][1] % 2, nx = TK[i + 1][1] % 2;
      if (a === 1 && b === 1 && c === 1) { odN++; if (nx === 0) odA++; }
      if (a === 0 && b === 0 && c === 0) { evN++; if (nx === 1) evA++; }
    }
    const z3 = Math.max(Math.abs(z(evN ? evA / evN : .5, .5, evN)), Math.abs(z(odN ? odA / odN : .5, .5, odN)));
    rows.push(`<b>3. After 3 odd in a row, next is even</b>: ${odN ? (100 * odA / odN).toFixed(1) : "–"}% (${odN} times) · ` +
      `<b>after 3 even, next is odd</b>: ${evN ? (100 * evA / evN).toFixed(1) : "–"}% (${evN} times). Fair = 50% → ${flag(z3)}`);
    // 4. Over/Under: is the next digit linked to this one?
    const xs = P1.map(i => TK[i][1]), ys = P1.map(i => TK[i + 1][1]), m = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / m, my = ys.reduce((a, b) => a + b, 0) / m;
    let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < m; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
    const r = sxy / Math.sqrt(sxx * syy), z4 = r * Math.sqrt(m);
    rows.push(`<b>4. Is the next digit linked to this one?</b> (Over/Under) link = ${r.toFixed(3)} (fair ≈ 0) → ${flag(z4)}`);
    // 5. Rise/Fall: up after 5 ticks, and do moves continue or reverse?
    const P5 = []; { let last = -9; for (const i of pairs(5)) if (i >= last + 5 && TK[i][2] != null && TK[i + 5][2] != null) { P5.push(i); last = i; } }   // separate windows
    const up = P5.filter(i => TK[i + 5][2] > TK[i][2]).length, z5 = z(up / P5.length, .5, P5.length);
    const P2 = pairs(2).filter(i => TK[i][2] != null && TK[i + 1][2] != null && TK[i + 2][2] != null);
    let cont = 0, cn = 0; for (const i of P2) { const a = TK[i + 1][2] - TK[i][2], b = TK[i + 2][2] - TK[i + 1][2]; if (a && b) { cn++; if ((a > 0) === (b > 0)) cont++; } }
    const z6 = z(cn ? cont / cn : .5, .5, cn);
    rows.push(`<b>5. Rise/Fall</b>: price higher after 5 ticks ${(100 * up / P5.length).toFixed(1)}% · ` +
      `a move continues next tick ${cn ? (100 * cont / cn).toFixed(1) : "–"}%. Fair = 50% → ${flag(Math.max(Math.abs(z5), Math.abs(z6)))}`);
    const bad = /unusual/.test(rows.join(""));
    return `<b>${n} ticks checked.</b><br>` + rows.join("<br><br>") + "<br><br>" + (bad
      ? `<b class="warn">Something looks unusual.</b> With many checks, one can look odd by luck. Save more ticks and check again; ` +
        `if it stays unusual, download the ticks and send them for a closer look.`
      : `<b class="ok">No pattern found.</b> The digits behave like random numbers: past digits do not change the next one, ` +
        `so no setting or strategy can raise the win chance. What you can control: the stake, the limits, and how long you play.`);
  }
  $("tkCheck").onclick = () => { const o = $("tkOut"); o.style.display = ""; o.innerHTML = checkTicks(); log("checked " + TK.length + " saved ticks"); };
  $("tkCsv").onclick = () => {
    const lines = ["time,market,last digit,price digits"].concat(TK.map(x => [new Date(x[0] * 1000).toISOString(), `"${x[3]}"`, x[1], x[2] == null ? "" : x[2]].join(",")));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = `digitbot-ticks-${dayOf(Date.now())}.csv`; document.body.appendChild(a); a.click(); a.remove();
    log(`ticks saved: ${TK.length}`, "ok");
  };
  var statsReady = true; showTab();

  // Plays the current settings many times on random digits (the real ticks behave like random digits),
  // with the same trigger, cooldown, max trades / minutes, stop-loss and take-profit. No money involved.
  function simulate(runs) {
    const wc = winChance() ?? 0.5;
    const b = tradeButton(S.button);
    let pay = MODE[S.button] === currentMode() ? payoutPct(b) : null;
    const est = pay == null;
    if (est) pay = Math.max(1, (0.95 / wc - 1) * 100);
    const st = +S.stakeSet > 0 ? +S.stakeSet : 1;
    const cd = Math.max(1, Math.ceil(+S.cooldown || 0)), ticks = Math.max(1, (+S.maxMinutes || 1) * 60);
    let up = 0, sl = 0, tp = 0, sum = 0, nTr = 0, worst = 0, best = 0, staked = 0, bigStake = 0;
    for (let s = 0; s < runs; s++) {
      let pl = 0, tr = 0, row = 0, last = -1e9, cur = st, big = st; const ps = { step: 0 };
      for (let k = 0; k < ticks && tr < S.maxTrades; k++) {
        row = triggerHit(Math.floor(Math.random() * 10)) ? row + 1 : 0;
        if (row < S.inRow) continue;
        row = 0;
        if (k - last < cd) continue;
        if (S.stopLoss > 0 && cur - pl > S.stopLoss) break;           // the bot won't risk passing the stop-loss
        last = k; tr++; const won = Math.random() < wc; pl += won ? cur * pay / 100 : -cur; staked += cur; big = Math.max(big, cur);
        cur = S.plan === "flat" ? st : planNext(S.plan, st, cur, won ? "win" : "loss", ps, +S.planMult, +S.planSteps);
        if (S.stopLoss > 0 && -pl >= S.stopLoss) { sl++; break; }
        if (S.takeProfit > 0 && pl >= S.takeProfit) { tp++; break; }
      }
      sum += pl; nTr += tr; if (pl > 0) up++; worst = Math.min(worst, pl); best = Math.max(best, pl); bigStake = Math.max(bigStake, big);
    }
    return { runs, pay, est, wc, up, sl, tp, avg: sum / runs, avgTr: nTr / runs, worst, best, ev: (wc * (1 + pay / 100) - 1) * 100, perStaked: staked ? sum / staked * 100 : 0, bigStake };
  }
  $("mdbTest").onclick = () => {
    const r = simulate(1000), pc = n => Math.round(100 * n / r.runs) + "%", m = v => (v < 0 ? "-$" : "+$") + Math.abs(v).toFixed(2);
    const out = $("mdbTestOut"); out.style.display = "";
    out.innerHTML = `<b>1000 practice runs</b> of ${describe()} (${triggerText()} x${S.inRow}, $${S.stakeSet} stake), ` +
      `win chance ${(r.wc * 100).toFixed(0)}%, payout +${r.pay.toFixed(1)}%${r.est ? " (estimated - open this game mode for the real one)" : ""}:<br>` +
      `Ended in profit: <b>${pc(r.up)}</b> · hit take-profit: <b>${pc(r.tp)}</b> · hit stop-loss: <b>${pc(r.sl)}</b><br>` +
      `Average per run: <b class="${r.avg >= 0 ? "ok" : "warn"}">${m(r.avg)}</b> over ${r.avgTr.toFixed(1)} trades · best ${m(r.best)} · worst ${m(r.worst)}<br>` +
      `Each trade: <b class="${r.ev >= 0 ? "ok" : "warn"}">${r.ev >= 0 ? "+" : ""}${r.ev.toFixed(1)}%</b> of the stake on average. ` +
      (S.plan !== "flat" ? `<br>Stake plan <b>${PLANS[S.plan].split(" – ")[0]}</b>: biggest stake used <b>$${r.bigStake.toFixed(2)}</b>; result per $ staked <b class="${r.perStaked >= 0 ? "ok" : "warn"}">${r.perStaked >= 0 ? "+" : ""}${r.perStaked.toFixed(1)}%</b> (flat stakes give about the same - the plan only reshapes wins and losses).<br>` : "") +
      `Profitable runs happen by luck; over many runs the average is what you keep.`;
    log(`test: ${pc(r.up)} of practice runs ended in profit, average ${m(r.avg)} per run`);
  };


  // ================================================================== 🧩 ROUND BUILDER (our take on MMG's Auto Trader)
  // A strategy = settings + rule cards. Each round (after the last trade has settled) the first card whose IF is true
  // changes the stake and buys a contract (or skips). Same safety as everything else: demo first, stop-loss,
  // take-profit, max trades, top-stake cap, daily loss limit.
  const BKEY = "mmgDigitBot.builder.v1";
  const CONDS = { always: "always (otherwise)", first: "first round", won: "last trade won", lost: "last trade lost",
                  lossRow: "losses in a row ≥", winRow: "wins in a row ≥", dEven: "last digit is even", dOdd: "last digit is odd",
                  dEq: "last digit =", dGt: "last digit >", dLt: "last digit <", pctHi: "digit # share of last 60 ≥ %", pctLo: "digit # share of last 60 ≤ %",
                  plUp: "session profit ≥ $", plDown: "session loss ≥ $",
                  hotHi: "hottest digit of last 60 is 5–9", hotLo: "hottest digit of last 60 is 0–4" };
  const NEED_N = { lossRow: 1, winRow: 1, dEq: 1, dGt: 1, dLt: 1, pctHi: 2, pctLo: 2, plUp: 1, plDown: 1 };
  const SACT = { keep: "keep stake", reset: "reset stake to start", mult: "multiply stake by", add: "add $", sub: "take away $", set: "set stake to $",
                  fibUp: "Fibonacci: one step up", fibBack: "Fibonacci: two steps back" };
  const BUYS = { even: "Even", odd: "Odd", over: "Over", under: "Under", differ: "Differs", match: "Matches", rise: "Rise", fall: "Fall", skip: "skip this round" };
  const TDESC = {
    "Martingale (Even)": "Double the stake after every loss, reset after a win. Wins most sessions, but a losing run costs a lot - high risk.",
    "Paroli (Even)": "Reverse Martingale: double after a win (up to 3 in a row), reset after a loss. Small losses, rare bigger wins.",
    "D'Alembert (Over 3)": "+$1 after a loss, −$1 after a win. Gentler than Martingale.",
    "Fibonacci (Even)": "Stake follows 1,1,2,3,5,8… one step up after a loss, two steps back after a win.",
    "Differs sniper (0)": "Flat stake on Differs 0: about 90% win chance for a small payout each round. Steady, lower risk per trade.",
    "Digit trend (Over/Under)": "Reads the hottest digit of the last 60: Over 4 when it's high, Under 5 when it's low. Flat stake. (Hot digits don't predict - see the tests.)",
    "Odd after an even (flat)": "Only trades after an even digit, buys Odd. Flat stake.",
    "Cool-down after 3 losses": "Even with a flat stake, but sits out one round after 3 losses in a row.",
  };
  const TEMPLATES = {
    "Fibonacci (Even)": { start: 1, tp: 20, sl: 50, maxTrades: 50, cap: 21, rules: [{ c: "lost", s: "fibUp", b: "even" }, { c: "won", s: "fibBack", b: "even" }, { c: "always", s: "reset", b: "even" }] },
    "Digit trend (Over/Under)": { start: 1, tp: 20, sl: 50, maxTrades: 50, cap: 1, rules: [{ c: "hotHi", s: "reset", b: "over", pick: 4 }, { c: "always", s: "reset", b: "under", pick: 5 }] },
    "Martingale (Even)": { start: 1, tp: 20, sl: 50, maxTrades: 50, cap: 16, rules: [{ c: "lost", s: "mult", v: 2, b: "even" }, { c: "always", s: "reset", b: "even" }] },
    "Paroli (Even)": { start: 1, tp: 20, sl: 50, maxTrades: 50, cap: 8, rules: [{ c: "winRow", n: 3, s: "reset", b: "even" }, { c: "won", s: "mult", v: 2, b: "even" }, { c: "always", s: "reset", b: "even" }] },
    "D'Alembert (Over 3)": { start: 1, tp: 20, sl: 50, maxTrades: 50, cap: 10, rules: [{ c: "lost", s: "add", v: 1, b: "over", pick: 3 }, { c: "won", s: "sub", v: 1, b: "over", pick: 3 }, { c: "always", s: "keep", b: "over", pick: 3 }] },
    "Differs sniper (0)": { start: 1, tp: 5, sl: 20, maxTrades: 50, cap: 1, rules: [{ c: "always", s: "reset", b: "differ", pick: 0 }] },
    "Odd after an even (flat)": { start: 1, tp: 10, sl: 20, maxTrades: 40, cap: 1, rules: [{ c: "dEven", s: "reset", b: "odd" }, { c: "always", s: "keep", b: "skip" }] },
    "Cool-down after 3 losses": { start: 1, tp: 10, sl: 20, maxTrades: 40, cap: 1, rules: [{ c: "lossRow", n: 3, s: "reset", b: "skip" }, { c: "always", s: "reset", b: "even" }] },
  };
  let BS = { cur: JSON.parse(JSON.stringify(TEMPLATES["Martingale (Even)"])), name: "Martingale (Even)", saved: {} };
  try { Object.assign(BS, JSON.parse(localStorage.getItem(BKEY) || "{}")); } catch (e) {}
  // Ready-made lower-risk strategies: 6 cards each, small capped stakes, cool-downs, tight limits. They appear under
  // "Saved strategies" once (if you delete one it stays deleted). Lower risk = smaller swings, NOT a winning edge.
  const PRESETS = {
    "🛡️ Steady Differs": { start: 1, cap: 1, tp: 3, sl: 10, maxTrades: 40, wallet: "demo", rules: [
      { c: "lossRow", n: 2, s: "reset", b: "skip" },                 // 2 losses in a row: sit out one round
      { c: "lost", s: "reset", b: "differ", pick: 5 },               // after a loss: Differs 5
      { c: "dEq", n: 3, s: "keep", b: "differ", pick: 4 },           // last digit 3: Differs 4
      { c: "dEven", s: "keep", b: "differ", pick: 1 },               // last digit even: Differs 1
      { c: "dOdd", s: "keep", b: "differ", pick: 0 },                // last digit odd: Differs 0
      { c: "always", s: "reset", b: "differ", pick: 0 } ] },
    "⚖️ Calm Even/Odd switch": { start: 1, cap: 1, tp: 6, sl: 10, maxTrades: 40, wallet: "demo", rules: [
      { c: "lossRow", n: 3, s: "reset", b: "skip" },                 // 3 losses in a row: sit out one round
      { c: "winRow", n: 3, s: "reset", b: "skip" },                  // 3 wins in a row: sit out one round
      { c: "plUp", n: 4, s: "set", v: 0.5, b: "even" },              // $4 up: smaller $0.50 stakes to protect it
      { c: "dEven", s: "reset", b: "odd" },                          // last digit even: buy Odd
      { c: "dOdd", s: "reset", b: "even" },                          // last digit odd: buy Even
      { c: "always", s: "reset", b: "even" } ] },
    "🌱 Gentle mix (Even + Differs)": { start: 1, cap: 2.5, tp: 8, sl: 12, maxTrades: 40, wallet: "demo", rules: [
      { c: "lossRow", n: 3, s: "reset", b: "differ", pick: 0 },      // 3 losses: back to $1 on low-risk Differs 0
      { c: "plUp", n: 5, s: "reset", b: "differ", pick: 0 },         // $5 up: calm down on Differs 0
      { c: "first", s: "reset", b: "even" },                         // first round: $1 Even
      { c: "lost", s: "add", v: 0.5, b: "even" },                    // after a loss: +$0.50 (max $2.50)
      { c: "won", s: "sub", v: 0.5, b: "even" },                     // after a win: −$0.50 (min $1)
      { c: "always", s: "keep", b: "even" } ] },
    "🧊 Differs rotation ($0.50 flat)": { start: 0.5, cap: 0.5, tp: 2, sl: 5, maxTrades: 30, wallet: "demo", rules: [
      { c: "lossRow", n: 2, s: "reset", b: "skip" },                 // 2 losses in a row: sit out one round
      { c: "lost", s: "reset", b: "differ", pick: 9 },               // after a loss: Differs 9
      { c: "dGt", n: 6, s: "reset", b: "differ", pick: 2 },          // last digit 7-9: Differs 2
      { c: "dLt", n: 3, s: "reset", b: "differ", pick: 8 },          // last digit 0-2: Differs 8
      { c: "dEven", s: "reset", b: "differ", pick: 7 },              // last digit 4 or 6: Differs 7
      { c: "always", s: "reset", b: "differ", pick: 3 } ] },         // otherwise: Differs 3
    "🪜 Mini-Martingale (safe remake)": { start: 0.5, cap: 2, tp: 3, sl: 8, maxTrades: 40, wallet: "demo", rules: [
      { c: "lossRow", n: 3, s: "reset", b: "skip" },                 // 3 losses: stop doubling, sit out, back to $0.50
      { c: "plDown", n: 5, s: "set", v: 0.35, b: "differ", pick: 0 },// $5 down: smallest stake on Differs 0
      { c: "plUp", n: 2, s: "set", v: 0.35, b: "even" },             // $2 up: protect it with $0.35 stakes
      { c: "lost", s: "mult", v: 2, b: "even" },                     // after a loss: double (never above $2)
      { c: "won", s: "reset", b: "even" },                           // after a win: back to $0.50
      { c: "always", s: "reset", b: "even" } ] },
    "🐢 Fibonacci lite (safe remake)": { start: 0.5, cap: 2.5, tp: 4, sl: 10, maxTrades: 40, wallet: "demo", rules: [
      { c: "lossRow", n: 4, s: "reset", b: "skip" },                 // 4 losses: sit out, back to the start
      { c: "plDown", n: 6, s: "reset", b: "differ", pick: 0 },       // $6 down: $0.50 Differs 0 only
      { c: "plUp", n: 3, s: "reset", b: "differ", pick: 0 },         // $3 up: calm down on Differs 0
      { c: "lost", s: "fibUp", b: "even" },                          // after a loss: one Fibonacci step up (max $2.50)
      { c: "won", s: "fibBack", b: "even" },                         // after a win: two steps back
      { c: "always", s: "reset", b: "even" } ] },
    "🧘 Patient Even/Odd ($0.50)": { start: 0.5, cap: 0.5, tp: 3, sl: 6, maxTrades: 30, wallet: "demo", rules: [
      { c: "lossRow", n: 2, s: "reset", b: "skip" },                 // 2 losses in a row: sit out one round
      { c: "winRow", n: 4, s: "reset", b: "skip" },                  // 4 wins in a row: sit out (don't push luck)
      { c: "plDown", n: 4, s: "set", v: 0.35, b: "differ", pick: 0 },// $4 down: smallest stake on Differs 0
      { c: "dEven", s: "reset", b: "odd" },                          // last digit even: Odd
      { c: "dOdd", s: "reset", b: "even" },                          // last digit odd: Even
      { c: "always", s: "reset", b: "even" } ] },
  };
  BS.presetsAdded = BS.presetsAdded || [];
  for (const [k, v] of Object.entries(PRESETS)) if (!BS.presetsAdded.includes(k)) { if (!BS.saved[k]) BS.saved[k] = JSON.parse(JSON.stringify(v)); BS.presetsAdded.push(k); }
  try { localStorage.setItem(BKEY, JSON.stringify(BS)); } catch (e) {}
  const saveB = () => { try { localStorage.setItem(BKEY, JSON.stringify(BS)); } catch (e) {} };
  const RB = { on: false };
  const optS = (o, v) => Object.entries(o).map(([k, t]) => `<option value="${k}" ${String(k) === String(v) ? "selected" : ""}>${t}</option>`).join("");

  const pB = document.createElement("div"); pB.className = "g"; pB.id = "pBuild"; pB.style.display = "none";
  $("pStats").parentNode.insertBefore(pB, $("pStats"));
  function rbCard(r, i, n) {
    const needN = NEED_N[r.c], needPick = ["over", "under", "differ", "match"].includes(r.b), needV = ["mult", "add", "sub", "set"].includes(r.s);
    return `<div class="rbc" data-i="${i}">
      <div class="rbl"><b>${i === n - 1 && r.c === "always" ? "OTHERWISE" : "IF"}</b><select data-f="c">${optS(CONDS, r.c)}</select>
        ${needN === 2 ? `<select data-f="d">${[...Array(10).keys()].map(k => `<option ${+r.d === k ? "selected" : ""}>${k}</option>`).join("")}</select>` : ""}
        ${needN ? `<input data-f="n" type="number" step="any" value="${r.n ?? (r.c === "pctHi" ? 15 : r.c === "pctLo" ? 5 : 2)}">` : ""}</div>
      <div class="rbl">→ <select data-f="s">${optS(SACT, r.s)}</select>${needV ? `<input data-f="v" type="number" step="any" min="0" value="${r.v ?? (r.s === "mult" ? 2 : 1)}">` : ""}</div>
      <div class="rbl">→ <b>buy</b> <select data-f="b">${optS(BUYS, r.b)}</select>${needPick ? `<select data-f="pick">${[...Array(10).keys()].map(k => `<option ${+(r.pick ?? 5) === k ? "selected" : ""}>${k}</option>`).join("")}</select>` : ""}
        <span class="rbx"><button data-a="up" title="move up">▲</button><button data-a="rm" title="remove">✕</button></span></div></div>`;
  }
  function rbRender() {
    const c = BS.cur;
    pB.innerHTML = `<div style="grid-column:1/3">
      <div class="tip">Build your own auto strategy: settings, then rule cards. Each round the <b>first card whose IF is true</b> sets the stake and buys.</div>
      <div class="rbg"><label>Name<input id="rb_name" value="${(BS.name || "").replace(/"/g, "&quot;")}"></label>
        <label>Template<select id="rb_tpl"><option value="">load…</option>${Object.keys(TEMPLATES).map(k => `<option>${k}</option>`).join("")}${Object.keys(BS.saved).map(k => `<option value="saved:${k}">💾 ${k}</option>`).join("")}</select></label>
        <label>Start stake $<input id="rb_start" type="number" min="0.35" step="0.01" value="${c.start}"></label>
        <label>Never stake above $<input id="rb_cap" type="number" min="0.35" step="0.01" value="${c.cap}"></label>
        <label>Take-profit $<input id="rb_tp" type="number" min="0" step="0.01" value="${c.tp}"></label>
        <label>Stop-loss $<input id="rb_sl" type="number" min="0" step="0.01" value="${c.sl}"></label>
        <label>Max trades<input id="rb_max" type="number" min="1" step="1" value="${c.maxTrades}"></label>
        <label>Wallet<select id="rb_wallet"><option value="demo">demo only</option><option value="real" ${c.wallet === "real" ? "selected" : ""}>real allowed</option></select></label></div>
      <div class="sec">Each round</div><div id="rbCards">${c.rules.map((r, i) => rbCard(r, i, c.rules.length)).join("")}</div>
      <button class="clr" id="rbAdd">+ add a rule card</button>
      <div class="rbrow"><button class="start" id="rbRun">▶ Run</button><button class="stop" id="rbStopB">■ Stop</button></div>
      <div class="odds" id="rbStat">${RB.on ? "" : "Stopped."}</div>
      <button class="once" id="rbTest">🧪 Test it: 1000 practice sessions (no money)</button><div class="odds" id="rbTestOut" style="display:none"></div>
      <div class="rbrow"><button class="clr" id="rbSave">💾 Save</button><button class="clr" id="rbExport">Export</button><button class="clr" id="rbImport">Import</button><button class="clr" id="rbDel">Delete saved</button></div>
      <div class="sec">Templates</div><div class="rbt">${Object.keys(TEMPLATES).map(k => `<div data-tpl="${k}"><b>${k}</b><span>${TDESC[k] || ""}</span></div>`).join("")}</div>
      <div class="sec">Saved strategies</div><div class="rbt">${Object.keys(BS.saved).map(k => `<div data-tpl="saved:${k}"><b>💾 ${k}</b><span>${BS.saved[k].rules.length} cards · start $${BS.saved[k].start} · TP $${BS.saved[k].tp} · SL $${BS.saved[k].sl}</span></div>`).join("") || `<div class="mut" style="cursor:default">No saved strategies yet.</div>`}</div>
      <div class="tip">Honest note: stake rules change how wins and losses are spread, never the odds. Martingale-type rules win most sessions and lose more overall. Test first, demo first.</div></div>`;
    if (RB.on) rbStatus();
  }
  function rbRead() {
    const c = BS.cur, num = id => parseFloat($(id).value);
    c.start = Math.max(0.35, num("rb_start") || 1); c.cap = Math.max(c.start, num("rb_cap") || c.start); c.tp = Math.max(0, num("rb_tp") || 0);
    c.sl = Math.max(0, num("rb_sl") || 0); c.maxTrades = Math.max(1, Math.round(num("rb_max") || 1)); c.wallet = $("rb_wallet").value; BS.name = $("rb_name").value.trim() || "My rounds";
    c.rules = [...pB.querySelectorAll(".rbc")].map(card => { const g = f => { const e = card.querySelector(`[data-f="${f}"]`); return e ? e.value : undefined; };
      const r = { c: g("c"), s: g("s"), b: g("b") }; if (g("n") != null) r.n = +g("n"); if (g("d") != null) r.d = +g("d"); if (g("v") != null) r.v = +g("v"); if (g("pick") != null) r.pick = +g("pick"); return r; });
    saveB();
  }
  pB.addEventListener("change", e => {
    if (e.target.id === "rb_wallet") {
      if (RB.on) { log("Stop the rounds first.", "warn"); e.target.value = BS.cur.wallet || "demo"; return; }
      if (e.target.value === "real") {
        const t = prompt("REAL MONEY: the rounds will trade on your real MMG wallet.\nThe bot cannot predict digits; every template loses a little on average.\n\nType I UNDERSTAND to allow it:");
        if ((t || "").trim().toUpperCase() !== "I UNDERSTAND") { e.target.value = "demo"; log("Wallet stays on demo only.", "warn"); }
        else log("Wallet: real allowed for Rounds (it still asks before each Run).", "warn");
      } else log("Wallet: demo only - Rounds trade only when MMG shows DEMO.", "ok");
      rbRead(); rbStatus(); return;
    }
    if (e.target.id === "rb_tpl") { const v = e.target.value; if (!v) return; if (RB.on) { log("Stop the rounds first.", "warn"); return; }
      BS.cur = JSON.parse(JSON.stringify(v.startsWith("saved:") ? BS.saved[v.slice(6)] : TEMPLATES[v])); BS.name = v.replace(/^saved:/, ""); saveB(); rbRender(); log(`rounds: loaded ${BS.name}`, "ok"); return; }
    rbRead(); if (e.target.dataset.f) rbRender();                 // a select changed what the card needs
  });
  pB.addEventListener("click", e => {
    const tp = e.target.closest("[data-tpl]");
    if (tp) { if (RB.on) return log("Stop the rounds first.", "warn"); const v = tp.dataset.tpl;
      BS.cur = JSON.parse(JSON.stringify(v.startsWith("saved:") ? BS.saved[v.slice(6)] : TEMPLATES[v])); BS.name = v.replace(/^saved:/, ""); saveB(); rbRender();
      log(`rounds: loaded ${BS.name}`, "ok"); pB.scrollIntoView({ block: "start" }); return; }
    const a = e.target.dataset.a, card = e.target.closest(".rbc"), id = e.target.id;
    if (card && (a === "rm" || a === "up")) { if (RB.on) return log("Stop the rounds first.", "warn"); rbRead(); const i = +card.dataset.i, R = BS.cur.rules;
      if (a === "rm" && R.length > 1) R.splice(i, 1); if (a === "up" && i > 0) [R[i - 1], R[i]] = [R[i], R[i - 1]]; saveB(); rbRender(); return; }
    if (id === "rbAdd") { rbRead(); BS.cur.rules.splice(Math.max(0, BS.cur.rules.length - 1), 0, { c: "lost", s: "keep", b: "even" }); saveB(); rbRender(); }
    if (id === "rbRun") { rbRead(); rbStart(); }
    if (id === "rbStopB") rbStop("stopped by you");
    if (id === "rbTest") { rbRead(); rbTestShow(); }
    if (id === "rbSave") { rbRead(); BS.saved[BS.name] = JSON.parse(JSON.stringify(BS.cur)); saveB(); rbRender(); log(`rounds: saved "${BS.name}"`, "ok"); }
    if (id === "rbDel") { const nm = ($("rb_name").value || "").trim();          // delete exactly what you see
      if (!BS.saved[nm]) return log(`"${nm}" is not a saved strategy.`, "warn");
      if (confirm(`Delete saved "${nm}"?`)) { delete BS.saved[nm]; BS.name = nm; saveB(); rbRender(); log(`rounds: deleted "${nm}"`, "ok"); } }
    if (id === "rbExport") { rbRead(); const j = JSON.stringify({ name: BS.name, ...BS.cur }); try { navigator.clipboard.writeText(j); } catch (x) {} prompt("Copied. Your strategy as text (share or back it up):", j); }
    if (id === "rbImport") { const t = prompt("Paste a strategy you exported:"); if (!t) return; try { const o = JSON.parse(t); if (!o.rules || !o.rules.length) throw 0;
      BS.name = o.name || "Imported"; delete o.name; BS.cur = o; saveB(); rbRender(); log(`rounds: imported ${BS.name}`, "ok"); } catch (x) { log("That text is not a strategy export.", "warn"); } }
  });
  // ---- the rules
  function rbCond(r, st, last60, d) {
    switch (r.c) {
      case "always": return true; case "first": return st.n === 0;
      case "won": return st.last === "win"; case "lost": return st.last === "loss";
      case "lossRow": return st.lossRow >= (r.n || 1); case "winRow": return st.winRow >= (r.n || 1);
      case "dEven": return d != null && d % 2 === 0; case "dOdd": return d != null && d % 2 === 1;
      case "dEq": return d === +r.n; case "dGt": return d > +r.n; case "dLt": return d < +r.n;
      case "pctHi": case "pctLo": { if (last60.length < 30) return false; const pc = 100 * last60.filter(x => x === +r.d).length / last60.length; return r.c === "pctHi" ? pc >= +r.n : pc <= +r.n; }
      case "plUp": return st.pl >= +r.n; case "plDown": return -st.pl >= +r.n;
      case "hotHi": case "hotLo": { if (last60.length < 30) return r.c === "hotLo"; const cn = Array(10).fill(0); last60.forEach(x => cn[x]++);
        let hot = 0; for (let k = 1; k < 10; k++) if (cn[k] >= cn[hot]) hot = k; return r.c === "hotHi" ? hot >= 5 : hot < 5; }
    }
    return false;
  }
  function rbDecide(c, st, last60, d) {          // -> { rule, stake, buy, pick } ; stake already capped
    const r = c.rules.find(x => rbCond(x, st, last60, d)); if (!r) return null;
    let k = st.stake, fib = st.fib || 0;
    if (r.s === "fibUp") fib = Math.min(FIB.length - 1, fib + 1); else if (r.s === "fibBack") fib = Math.max(0, fib - 2); else if (r.s === "reset") fib = 0;
    k = r.s === "reset" ? c.start : r.s === "mult" ? k * (+r.v || 1) : r.s === "add" ? k + (+r.v || 0) : r.s === "sub" ? k - (+r.v || 0) : r.s === "set" ? +r.v
      : r.s === "fibUp" || r.s === "fibBack" ? c.start * FIB[fib] : k;
    k = Math.round(Math.max(r.s === "set" ? 0.35 : c.start, k) * 100) / 100;
    let note = "";
    if (k > c.cap) { k = c.start; fib = 0; note = `above the $${c.cap} cap - back to $${c.start}`; }
    if (c.sl > 0 && k > c.sl + st.pl) { k = Math.round((c.sl + st.pl) * 100) / 100; note = `cut to $${k} so the stop-loss can't be passed`; }
    return { r, stake: k, buy: r.b, pick: r.pick ?? 5, note, fib };
  }
  const estPay = (b, pick) => { const p = { even: 0.5, odd: 0.5, rise: 0.5, fall: 0.5, differ: 0.9, match: 0.1, over: (9 - pick) / 10, under: pick / 10 }[b];
    return { p, pay: b === "even" || b === "odd" ? 0.98 : b === "differ" ? 0.10 : Math.max(0.01, 0.95 / p - 1) }; };
  const winsOn = (b, pick, d, up) => ({ even: d % 2 === 0, odd: d % 2 === 1, over: d > pick, under: d < pick, differ: d !== pick, match: d === pick, rise: up, fall: !up }[b]);
  // ---- 1000 practice sessions on your recorded ticks (or random digits)
  function rbTestShow() {
    const c = BS.cur, rec = TK.map(x => x[1]).filter(x => x != null), useRec = rec.length >= 3000;
    let ses = 0, up = 0, tpH = 0, slH = 0, sum = 0, staked = 0, worst = 0, best = 0, big = 0, nTr = 0;
    for (let s2 = 0; s2 < 1000; s2++) {
      const st = { stake: c.start, last: null, lossRow: 0, winRow: 0, pl: 0, n: 0 }, hist = [];
      let off = useRec ? Math.floor(Math.random() * (rec.length - 400)) : 0, guard = 0;
      const next = () => useRec ? rec[off++ % rec.length] : Math.floor(Math.random() * 10);
      for (let k = 0; k < 60; k++) hist.push(next());
      while (st.n < c.maxTrades && guard++ < 5000) {
        if (c.tp > 0 && st.pl >= c.tp) { tpH++; break; } if (c.sl > 0 && -st.pl >= c.sl) { slH++; break; }
        const d0 = hist[hist.length - 1], dec = rbDecide(c, st, hist.slice(-60), d0);
        const d = next(); hist.push(d); if (hist.length > 80) hist.shift();
        if (!dec || dec.buy === "skip" || !(dec.stake >= 0.35)) { if (!dec || dec.stake < 0.35) break;
          if (dec.r.c === "lossRow" || dec.r.c === "winRow") { st.lossRow = 0; st.winRow = 0; } continue; }
        st.stake = dec.stake; st.fib = dec.fib; const { pay } = estPay(dec.buy, dec.pick), won = winsOn(dec.buy, dec.pick, d, Math.random() < 0.5);
        st.pl += won ? st.stake * pay : -st.stake; staked += st.stake; big = Math.max(big, st.stake); st.n++; nTr++;
        st.last = won ? "win" : "loss"; st.lossRow = won ? 0 : st.lossRow + 1; st.winRow = won ? st.winRow + 1 : 0;
      }
      ses++; sum += st.pl; if (st.pl > 0) up++; worst = Math.min(worst, st.pl); best = Math.max(best, st.pl);
    }
    const m = v => (v < 0 ? "-$" : "+$") + Math.abs(v).toFixed(2), per = staked ? 100 * sum / staked : 0;
    const out = $("rbTestOut"); out.style.display = "";
    out.innerHTML = `<b>1000 practice sessions</b> of "${BS.name}" on ${useRec ? `your ${rec.length} recorded ticks` : "random digits (record ticks in 📊 Stats to use real ones)"}:<br>
      In profit: <b>${Math.round(up / 10)}%</b> · hit take-profit ${Math.round(tpH / 10)}% · hit stop-loss ${Math.round(slH / 10)}%<br>
      Average per session: <b class="${sum >= 0 ? "ok" : "warn"}">${m(sum / ses)}</b> over ${(nTr / ses).toFixed(1)} trades · best ${m(best)} · worst ${m(worst)}<br>
      Result per $ staked: <b class="${per >= 0 ? "ok" : "warn"}">${per >= 0 ? "+" : ""}${per.toFixed(2)}%</b> · biggest stake $${big.toFixed(2)}<br>
      Payouts estimated (Even/Odd 98%, Differs 10%, others from the odds). Winning sessions are luck; the average is what you keep.`;
    log(`rounds test: ${Math.round(up / 10)}% of sessions in profit, average ${m(sum / ses)}`);
  }
  // ---- running it on the game
  let rbSaved = null;
  function rbStart() {
    if (RB.on) return; if (running || busy) return log("Stop the main bot first (one bot at a time).", "warn");
    const c = BS.cur, demo = isDemo();
    if (!demo && c.wallet !== "real") return log("Your MMG wallet is not on DEMO (I can't see the DEMO badge). Switch the wallet at the top of MMG to DEMO and open the Manual Trader page - or choose Wallet: real allowed.", "warn");
    if (!circleRow() || !priceText()) return log("Can't find the game. Open the Manual Trader page.", "warn");
    if (openTrades()) return log("Wait until your open trades have finished.", "warn");
    { const why = dayBlock(0); if (why) return log(why, "warn"); }
    if (!demo && !confirm(`⚠ REAL MONEY\nRun "${BS.name}"?\nStart $${c.start}, cap $${c.cap}, stop-loss $${c.sl}, take-profit $${c.tp}, max ${c.maxTrades} trades.`)) return;
    rbSaved = { button: S.button, pick: S.pick, stakeSet: S.stakeSet, maxStake: S.maxStake };
    Object.assign(RB, { on: true, t0: Date.now(), st: { stake: c.start, last: null, lossRow: 0, winRow: 0, pl: 0, n: 0, fib: 0 }, seen: null });
    S.maxStake = Math.max(S.maxStake, c.cap); keepAwake(true); audioUnlock();
    log(`🧩 ROUNDS ON: "${BS.name}" - start $${c.start}, cap $${c.cap}, TP $${c.tp}, SL $${c.sl}, max ${c.maxTrades}${demo ? " (DEMO)" : " (REAL)"}`, "ok"); rbStatus();
  }
  function rbStop(why) {
    if (!RB.on) return; RB.on = false; RB.why = why;
    if (rbSaved) { Object.assign(S, rbSaved); save(); fillForm(); refreshForm(); }
    const st = RB.st; log(`🧩 ROUNDS OFF: ${why} - ${st.n} trades, session ${st.pl >= 0 ? "+" : "-"}$${Math.abs(st.pl).toFixed(2)}`, st.pl >= 0 ? "ok" : "warn");
    alertUser(st.pl >= 0); rbStatus(); if (!running) keepAwake(false);
  }
  function rbStatus() { const st = RB.st || {}; const el = $("rbStat"); if (!el) return;
    if (RB.st) {
      const bl = balance(), box = (l, v, c) => `<div><span>${l}</span><b class="${c || ""}">${v}</b></div>`;
      el.innerHTML = `<div class="rbh"><span class="${RB.on ? "rblive" : "rbstop"}">● ${RB.on ? "LIVE" : "STOPPED"}</span><span>${isDemo() ? "DEMO WALLET" : "REAL WALLET"}</span></div>
        <div class="rbd">${box("Total P&L", (st.pl >= 0 ? "+$" : "-$") + Math.abs(st.pl).toFixed(2), st.pl >= 0 ? "ok" : "warn")}${box("Trades", st.n + "/" + BS.cur.maxTrades)}
        ${box("Next stake", "$" + (+(st.next ?? st.stake)).toFixed(2))}${box("Balance", bl != null ? "$" + bl.toFixed(2) : "–")}</div>
        <div class="rbh"><span>Last: <b class="${st.last === "win" ? "ok" : st.last === "loss" ? "warn" : ""}">${st.last === "win" ? "WON" : st.last === "loss" ? "LOST" : "–"}</b></span><span>${RB.on ? BS.name : (RB.why || "")}</span></div>`;
      return;
    }
    el.innerHTML = RB.on ? `<b class="ok">RUNNING</b> ${BS.name} · trades ${st.n}/${BS.cur.maxTrades} · session <b class="${st.pl >= 0 ? "ok" : "warn"}">${st.pl >= 0 ? "+" : ""}$${(st.pl || 0).toFixed(2)}</b> · next stake $${(st.stake || 0).toFixed(2)} · last ${st.last || "–"}`
      : RB.st ? `Stopped. Last session: ${RB.st.n} trades, ${RB.st.pl >= 0 ? "+" : ""}$${RB.st.pl.toFixed(2)}.` : "Stopped."; }
  function rbTick(d) {
    if (busy || (document.hidden && !pipActive())) return;
    const c = BS.cur, st = RB.st;
    if (waiting.length) return;                                   // each round waits for the last result
    const mine = H.filter(x => x.t >= RB.t0 && String(x.strat).startsWith("🧩") && (x.res === "win" || x.res === "loss"));
    const last = mine[mine.length - 1];
    if (last && last.t !== RB.seen) { RB.seen = last.t; st.last = last.res; st.pl = Math.round(mine.reduce((a, x) => a + (x.profit || 0), 0) * 100) / 100;
      st.lossRow = last.res === "loss" ? st.lossRow + 1 : 0; st.winRow = last.res === "win" ? st.winRow + 1 : 0;
      const bl = balance(), pf = last.profit || 0;
      log(`🧩 #${mine.length} ${last.bet} $${(+last.stake).toFixed(2)} → ${last.res === "win" ? "WON" : "LOST"} ${pf >= 0 ? "+" : "-"}$${Math.abs(pf).toFixed(2)}` +
          `${bl != null ? " · bal $" + bl.toFixed(2) : ""} · session ${st.pl >= 0 ? "+" : "-"}$${Math.abs(st.pl).toFixed(2)}`, last.res === "win" ? "ok" : "warn");
      const nx = rbDecide(c, st, TK.slice(-60).map(x => x[1]), d); st.next = nx && nx.buy !== "skip" ? nx.stake : null;
      rbStatus(); }
    if (c.tp > 0 && st.pl >= c.tp) return rbStop(`take-profit reached (+$${st.pl.toFixed(2)})`);
    if (c.sl > 0 && -st.pl >= c.sl) return rbStop(`stop-loss reached ($${st.pl.toFixed(2)})`);
    if (st.n >= c.maxTrades) return rbStop(`max ${c.maxTrades} trades done`);
    if (!isDemo() && c.wallet !== "real") return rbStop("the MMG wallet is not DEMO any more (Wallet is set to demo only)");
    const last60 = TK.slice(-61, -1).map(x => x[1]), dec = rbDecide(c, st, last60, d);
    if (!dec) return rbStop("no rule card matched - add an 'always' card at the end");
    if (dec.stake < 0.35) return rbStop("no room left before the stop-loss");
    if (dec.buy === "skip") {
      if (dec.r.c === "lossRow" || dec.r.c === "winRow") { log(`🧩 sitting out one round (${CONDS[dec.r.c]} ${dec.r.n})`); st.lossRow = 0; st.winRow = 0; }
      return;
    }
    if (dec.note) log(`🧩 stake ${dec.note}`, "warn");
    { const why = dayBlock(dec.stake); if (why) return rbStop(why); }
    Object.assign(S, { button: dec.buy, pick: dec.pick, stakeSet: dec.stake }); st.stake = dec.stake; st.fib = dec.fib;
    busy = true;
    (async () => {
      try {
        if (gameProblem()) await setupGame();
        const b = tradeButton(S.button); if (!b || b.disabled) { log(`🧩 ${S.button.toUpperCase()} unavailable - skipped`, "warn"); return; }
        const sk = stake(); if (sk !== dec.stake) { log(`🧩 Amount shows $${sk}, expected $${dec.stake} - skipped`, "warn"); return; }
        ledger(balance()); b.click(); lastClick = Date.now(); st.n++;
        recordTrade(sk, payoutPct(b), d, "🧩 " + BS.name);
        log(`🧩 #${st.n} ${describe()} $${sk} (${CONDS[dec.r.c].replace(/ [≥≤=<>#].*$/, "")}${dec.r.n != null && NEED_N[dec.r.c] ? " " + dec.r.n : ""})`, "ok"); rbStatus();
      } catch (e) { rbStop("couldn't set up the game: " + e); }
      finally { busy = false; }
    })();
  }
  rbRender(); showTab();

  $("mdbOnce").onclick = tradeOnce;
  $("mdbStart").onclick = start;
  $("mdbStop").onclick = () => { if (RB.on) rbStop("stopped by you"); stop("stopped by you"); };

  function onTick(d) {
    recordTick(d);
    digits.push(d); if (digits.length > 24) digits.shift();
    $("mdbDigits").textContent = digits.join(" ");
    if (RB.on) rbTick(d);
    if (!running || finishing || (document.hidden && !pipActive())) return;
    run = triggerHit(d) ? run + 1 : 0;
    if (run < S.inRow) return;
    run = 0;
    if (busy) { log(`digit ${d}: trigger, but still fixing the game settings - skipped`); return; }
    if (Date.now() - lastClick < S.cooldown * 1000) { log(`digit ${d}: trigger, cooling down`); return; }
    if (S.autoSetup) {
      const why = gameProblem();
      if (why) {   // someone/something changed the game: put it back, skip this trigger
        log(`digit ${d}: skipped - ${why}. Fixing it…`, "warn");
        busy = true;
        setupGame().then(() => log("game settings restored ✓", "ok"))
                   .catch(e => stop("can't restore the game settings: " + e))
                   .finally(() => { busy = false; });
        return;
      }
    }
    if (S.live && S.plan !== "flat") {                    // stake plan: needs the last result first
      if (waiting.length) { log(`digit ${d}: trigger - waiting for the last result (stake plan)`); return; }
      const last = H.filter(x => x.t >= t0 && (x.res === "win" || x.res === "loss")).pop();
      if (last && last.t !== plan.seen) {
        plan.seen = last.t;
        let next = r2(planNext(S.plan, plan.base, plan.cur, last.res, plan, +S.planMult, +S.planSteps));
        if (next > plan.max) { log(`stake plan: next stake $${next} is above the cap $${plan.max} - back to $${plan.base}`, "warn"); next = plan.base; plan.step = 0; }
        if (next !== plan.cur) log(`stake plan: last trade ${last.res === "win" ? "WON" : "LOST"} → next stake $${next}`);
        plan.cur = next;
      }
      if (+S.stakeSet !== plan.cur) {
        S.stakeSet = plan.cur; busy = true;
        setupGame().then(() => log(`stake set to $${plan.cur} ✓`, "ok")).catch(e => stop("can't set the stake: " + e)).finally(() => { busy = false; });
        return;
      }
    }
    const b = tradeButton(S.button);
    if (!b) { log(`digit ${d}: trigger, but no ${S.button.toUpperCase()} button - skipped`, "warn"); return; }
    if (b.disabled) { log(`digit ${d}: ${S.button.toUpperCase()} is unavailable - skipped`, "warn"); return; }
    if (S.live) {
      const st = stake(), bal = balance();
      if (st == null) { stop("can't read the stake (Amount) - not trading blind"); return; }
      if (st > S.maxStake) { stop(`stake $${st} is above your max stake $${S.maxStake}`); return; }
      if (!isDemo() && !S.allowReal) { stop("account is not DEMO"); return; }
      // Pessimistic check (open stakes already taken out): never go past the stop-loss.
      if (S.stopLoss > 0 && bal != null && startBal - (bal - st) > S.stopLoss) {
        log(`digit ${d}: skipped - losing this $${st} stake could take you past the $${S.stopLoss} stop-loss ` +
            `(lower the Stake or raise the Stop-loss - see ? help)`); return;
      }
      { const why = dayBlock(st);
        if (why) { if (dayLossNow() >= S.dayLimit || !waiting.length) stop(why); else log(`digit ${d}: skipped - ${why}`); return; } }
      ledger(balance());
      b.click();
      lastClick = Date.now(); trades++;
      recordTrade(st, payoutPct(b), d, S.mode === "manual" ? "custom" : (strategyById(S.strategy) || {}).name || "custom");
      log(`digit ${d}: CLICKED ${describe()} ($${st}) [${trades}/${S.maxTrades}]`, "ok");
    } else {
      lastClick = Date.now(); trades++;
      log(`digit ${d}: would click ${describe()} (watch-only) [${trades}/${S.maxTrades}]`);
    }
  }

  let lastOdds = "";
  function loop() {
    const demo = isDemo(), bal = balance(), done = settled();
    ledger(bal);
    $("mdbAcc").innerHTML = demo ? '<span class="ok">DEMO</span>' : '<span class="warn">REAL</span>';
    { const plb = running && bal != null && startBal != null ? bal - startBal : null;
      $("mdbBadge").textContent = running
        ? `${finishing ? "● finishing" : S.live ? "● LIVE" : "● watching"} ${trades}/${S.maxTrades}` +
          (plb != null ? ` ${plb >= 0 ? "+" : "-"}$${Math.abs(plb).toFixed(2)}` : "")
        : (box.classList.contains("min") ? "stopped" : ""); }
    $("mdbBal").textContent = "balance: " + (bal == null ? "?" : "$" + bal.toFixed(2));
    const mode = currentMode();
    $("mdbSym").textContent = symbolName() + (mode ? " · " + MODE_NAME[mode] : "");
    const st = stake(); $("mdbStake").textContent = "stake: " + (st == null ? "?" : "$" + st);
    const odds = MODE[S.button] === mode ? oddsText() : `odds show when the game is on ${MODE_NAME[MODE[S.button]]}`;
    if (odds !== lastOdds) { $("mdbOdds").innerHTML = $("mdbOdds2").innerHTML = odds; lastOdds = odds; }
    const pl = running && bal != null && startBal != null ? bal - startBal : null;
    if (pl != null && done) $("mdbPL").innerHTML = `<span class="${pl >= 0 ? "ok" : "warn"}">P/L ${pl >= 0 ? "+" : ""}$${pl.toFixed(2)}</span>`;
    else if (running) $("mdbPL").textContent = `P/L … (${openTrades() ?? "?"} open)`;
    else $("mdbPL").textContent = "";
    $("mdbRun").textContent = running ? `${trades}/${S.maxTrades} trades, ${Math.floor((Date.now() - t0) / 60000)} min` : "stopped";

    // ticks: a new price = a new tick. Read the digit a moment later so the circles have redrawn.
    const p = priceText();
    if (p && p !== lastPrice) {
      lastPrice = p; lastTickAt = Date.now();
      clearTimeout(pending);
      pending = setTimeout(() => {
        const fromPrice = +((priceText() || p).replace(/\D/g, "").slice(-1));
        const lit = litDigit();
        if (lit != null && lit !== fromPrice) log(`note: circle shows ${lit}, price ends in ${fromPrice} - using the circle`);
        onTick(lit != null ? lit : fromPrice);
      }, 150);
    }

    if (!running) return;
    if (!demo && !S.allowReal) { stop("account switched to REAL"); return; }
    if (document.hidden && !pipActive()) { lastTickAt = Date.now(); return; }   // paused while you are in another app/tab (unless floating)
    if (Date.now() - lastTickAt > 15000) { stop("no new ticks for 15 s (chart frozen? refresh the page)"); return; }
    if (finishing) { if (done) stop(finishing); return; }
    if (trades >= S.maxTrades) finish("reached max trades");
    else if (Date.now() - t0 > S.maxMinutes * 60000) finish("reached time limit");
    else if (done && pl != null && S.stopLoss > 0 && -pl >= S.stopLoss) stop("stop-loss hit");
    else if (done && S.dayLimit > 0 && dayLossNow() >= S.dayLimit) stop(`daily loss limit $${S.dayLimit} reached`);
    else if (done && pl != null && S.takeProfit > 0 && pl >= S.takeProfit) stop("take-profit hit");
  }
  setInterval(loop, 100);
  window.__mmgDigitBot = {
    show: () => { box.style.display = ""; box.classList.remove("min"); }, start, stop,
    // change settings from outside (used by tests / the desktop app); same effect as the panel
    configure(o) {
      if (running) return "running";
      Object.assign(S, o); S.trigger = String(S.trigger); save();
      for (const f of FIELDS) { const el = $("f_" + f); if (el.type === "checkbox") el.checked = !!S[f]; else el.value = S[f]; }
      refreshForm(); return "ok";
    },
    async setup() { try { await setupGame(); return gameProblem() || "ok"; } catch (e) { return "error: " + e; } },
    state: () => ({ mode: currentMode(), pick: currentPick(), duration: currentDuration(), stake: stake(), problem: gameProblem(), odds: oddsText().replace(/<[^>]+>/g, "") }),
  };
  log("ready. Choose the button and your limits, then press Start.");
})();
