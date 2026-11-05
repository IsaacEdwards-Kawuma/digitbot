// ==UserScript==
// @name         MMG Digit Bot
// @namespace    digitbot.local
// @version      2.1.0
// @description  Trades every mode on mmgpredictions.com (Match/Differ, Over/Under, Even/Odd, Rise/Fall). Sets the game up for you, follows your trigger, stop-loss and limits. Works on PC, Android and iPhone/iPad browsers.
// @match        https://mmgpredictions.com/*
// @match        https://www.mmgpredictions.com/*
// @run-at       document-idle
// @grant        none
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
  function isDemo() {
    return [...document.querySelectorAll("span")].some(s => visible(s) && /^demo$/i.test(txt(s)));
  }
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
  #mdb.min .bd,#mdb.min .hp{display:none!important} #mdb.min{width:auto}
  #mdb .hp{display:none;padding:8px 10px;max-height:75vh;overflow:auto;font-size:13px}
  #mdb.help .bd{display:none} #mdb.help .hp{display:block}
  #mdb .hp details{border:1px solid #e2e8f0;border-radius:8px;margin:6px 0;background:#f8fafc}
  #mdb .hp summary{padding:7px 9px;font-weight:600;cursor:pointer;color:#0b7c8c}
  #mdb .hp details>div{padding:0 10px 8px}
  #mdb .hp ol,#mdb .hp ul{margin:4px 0;padding-left:18px} #mdb .hp li{margin:3px 0}
  #mdb .hp p{margin:4px 0} #mdb .hp code{background:#e2e8f0;border-radius:4px;padding:0 3px;font-size:12px}
  #mdb .hp .back{width:100%;margin-top:8px;padding:10px;border:0;border-radius:8px;background:#0b7c8c;color:#fff;font-size:15px;font-weight:600}
  `;
  const HELP = `
   <p><b>What this bot does:</b> it watches the last digit of every price tick and, when your rule
   (“Trade when”) happens, it presses the trade button for you, with your stake, until a limit stops it.</p>
   <details open><summary>Quick start (5 steps)</summary><div><ol>
    <li>In the game, open <b>Manual Trader</b> and make sure the account says <b>DEMO</b>.</li>
    <li><b>Button</b>: what to buy (e.g. Differ). Choose the <b>Pick digit</b> / Barrier / Duration if shown.</li>
    <li><b>Stake</b>: money per trade, e.g. <code>1</code>. Tick <b>Set up the game for me</b>.</li>
    <li><b>Trade when</b>: e.g. <code>digit 7</code>, <b>Times in a row</b> <code>1</code>. Set the limits (below).</li>
    <li>Press <b>Start</b> without “LIVE clicks” first: it only shows what it <i>would</i> do.
        Happy? Tick <b>LIVE clicks</b> and press Start again. <b>Stop</b> stops at once.</li>
   </ol></div></details>
   <details><summary>How the bot plays, step by step</summary><div><ol>
    <li>Checks the account (refuses REAL unless “Allow REAL”), that there are no open trades and that it can read the page.</li>
    <li>If “Set up the game for me” is ticked, it selects the game mode, digit/barrier/duration and types the stake. If you change them in the game, it changes them back.</li>
    <li>Every tick it reads the new last digit (shown in the digits row).</li>
    <li>If the digit matches “Trade when” for “Times in a row” ticks, it does the safety checks: stake ≤ max stake, and <i>losing this trade would not go past the stop-loss</i>.</li>
    <li>Then it clicks the button (LIVE) or just writes “would click” (not LIVE), and waits the cooldown.</li>
    <li>A contract settles a few ticks later; balance and P/L update.</li>
    <li>It stops by itself at: max trades, max minutes, stop-loss, take-profit, a frozen chart or a changed page.</li>
   </ol></div></details>
   <details><summary>The buttons (what you win on)</summary><div><ul>
    <li><b>Differ</b>: wins if the final digit is <i>not</i> your pick (~9 in 10), but pays very little.</li>
    <li><b>Match</b>: wins only if the final digit <i>is</i> your pick (~1 in 10), pays a lot.</li>
    <li><b>Over / Under</b>: final digit above / below the Barrier.</li>
    <li><b>Even / Odd</b>: final digit even / odd (~1 in 2).</li>
    <li><b>Rise / Fall</b>: price higher / lower after the Duration (5t = 5 ticks).</li>
   </ul><p>The grey line under Stake shows the win chance, the payout and the expected result per trade.</p></div></details>
   <details><summary>Every setting explained</summary><div><ul>
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
   <details><summary>Messages and problems</summary><div><ul>
    <li><b>“skipped - … past the $X stop-loss”</b>: losing this trade would cost more than the stop-loss allows. Lower the <b>Stake</b> or raise the <b>Stop-loss</b>.</li>
    <li><b>“stake is above your max stake”</b>: raise Max stake or lower the stake in the game.</li>
    <li><b>“This is a REAL account”</b>: switch the game to DEMO (or tick Allow REAL).</li>
    <li><b>“Can't find the digit circles / price”</b>: open the Manual Trader page, then press Start.</li>
    <li><b>“Wait until your open trades have finished”</b>: wait for the Open (N) trades to settle.</li>
    <li>Panel gone? Tap the Digit Bot bookmark again. Drag it by the green bar; “–” makes it small.</li>
   </ul></div></details>
   <details><summary>Example setups</summary><div><ul>
    <li><b>First test</b>: Differ, pick 7, stake 1, every tick, max trades 1, stop-loss 10, max stake 1, LIVE on.</li>
    <li><b>Wait for a digit</b>: Differ, pick 5, Trade when “digit 5”, 2 in a row, max trades 10, stop-loss 10.</li>
    <li><b>Even/Odd</b>: Even, stake 1, Trade when “any odd digit”, 3 in a row, stop-loss 5, take-profit 5.</li>
   </ul></div></details>
   <details><summary>Honest truth about winning</summary><div>
    <p>Every tick is random: past digits do not change the next one, so no rule or bot can predict it.
    Every option on this site pays slightly less than its fair odds, about <b>-1% per trade</b> on average.
    Differ wins ~9 of 10, but one loss wipes out ~10 wins. Practise on DEMO, always use a stop-loss,
    and never trade money you need.</p></div></details>
   <button class="back" id="mdbBack">← Back to the bot</button>`;
  const style = document.createElement("style"); style.textContent = css;
  const box = document.createElement("div"); box.id = "mdb";
  const opt = (v, t) => `<option value="${v}">${t}</option>`;
  box.innerHTML = `
  <div class="hd"><b>🤖 Digit Bot</b><span id="mdbBadge"></span><button id="mdbHelp" title="Help: how the bot works">?</button><button id="mdbMin">–</button><button id="mdbX">✕</button></div>
  <div class="bd">
   <div class="g">
    <div class="sec">Trade</div>
    <label>Button<select id="f_button">${BUTTONS.map(b => opt(b, b[0].toUpperCase() + b.slice(1))).join("")}</select></label>
    <label id="w_pick"><span id="l_pick">Pick digit</span><select id="f_pick">${[...Array(10).keys()].map(i => opt(i, i)).join("")}</select></label>
    <label id="w_duration">Duration<select id="f_duration">${DURATIONS.map(d => opt(d, d)).join("")}</select></label>
    <label>Stake ($)<input id="f_stakeSet" type="number" min="0.35" step="0.01" inputmode="decimal"></label>
    <label class="ck" style="grid-column:1/3"><input id="f_autoSetup" type="checkbox">Set up the game for me (mode, pick, stake)</label>
    <div class="odds" id="mdbOdds"></div>
    <div class="sec">When</div>
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
   <div class="st">
    <div class="row"><span id="mdbAcc">account: ?</span><span id="mdbBal">balance: ?</span></div>
    <div class="row"><span id="mdbSym">?</span><span id="mdbStake">stake: ?</span></div>
    <div class="row"><span id="mdbRun">stopped</span><span id="mdbPL"></span></div>
    <div class="dg" id="mdbDigits">waiting for ticks…</div>
   </div>
   <div class="go"><button class="start" id="mdbStart">Start</button><button class="stop" id="mdbStop">Stop</button></div>
   <div class="log" id="mdbLog"></div>
  </div>
  <div class="hp" id="mdbHelpBox">${HELP}</div>`;
  const $ = id => box.querySelector("#" + id);
  function mount() {
    if (!document.body) return;
    if (!document.getElementById("mdb")) { document.head.appendChild(style); document.body.appendChild(box); }
  }
  mount();
  setInterval(mount, 2000);   // the site is a single-page app: re-attach if it re-renders

  const TEXT_FIELDS = { button: 1, trigger: 1, duration: 1 };
  const FIELDS = ["button", "pick", "duration", "stakeSet", "autoSetup", "trigger", "inRow", "cooldown", "maxTrades",
                  "maxMinutes", "stopLoss", "takeProfit", "maxStake", "live", "allowReal"];
  for (const f of FIELDS) {
    const el = $("f_" + f);
    if (el.type === "checkbox") el.checked = !!S[f]; else el.value = S[f];
    el.addEventListener("change", () => {
      if (running && ["button", "pick", "duration", "stakeSet", "autoSetup"].includes(f)) {
        log("Stop the bot before changing the trade settings.", "warn");
        if (el.type === "checkbox") el.checked = !!S[f]; else el.value = S[f];
        return;
      }
      S[f] = el.type === "checkbox" ? el.checked : TEXT_FIELDS[f] ? el.value : parseFloat(el.value);
      if (f === "allowReal" && el.checked && !confirm("Allow trading on a REAL money account?\n\nThe bot cannot predict digits. Only use money you can afford to lose.")) { el.checked = false; S[f] = false; }
      save(); refreshForm();
    });
  }
  function refreshForm() {
    const needsPick = !!NEEDS_PICK[S.button], rf = MODE[S.button] === "Rise/Fall";
    $("w_pick").style.display = needsPick ? "" : "none";
    $("l_pick").textContent = S.button === "over" || S.button === "under" ? "Barrier" : "Pick digit";
    $("w_duration").style.display = rf ? "" : "none";
  }
  refreshForm();
  $("mdbMin").onclick = () => box.classList.toggle("min");
  $("mdbHelp").onclick = () => { box.classList.remove("min"); box.classList.toggle("help"); $("mdbHelpBox").scrollTop = 0; };
  $("mdbBack").onclick = () => box.classList.remove("help");
  $("mdbX").onclick = () => { stop("panel closed"); box.style.display = "none"; };

  // drag the panel by its header (mouse + touch)
  (() => {
    const hd = box.querySelector(".hd"); let sx, sy, ox, oy, drag = false;
    hd.addEventListener("pointerdown", e => { if (e.target.tagName === "BUTTON") return; drag = true; sx = e.clientX; sy = e.clientY;
      const r = box.getBoundingClientRect(); ox = r.left; oy = r.top; hd.setPointerCapture(e.pointerId); });
    hd.addEventListener("pointermove", e => { if (!drag) return;
      box.style.left = Math.max(0, Math.min(innerWidth - 60, ox + e.clientX - sx)) + "px";
      box.style.top = Math.max(0, Math.min(innerHeight - 40, oy + e.clientY - sy)) + "px"; box.style.bottom = "auto"; });
    hd.addEventListener("pointerup", () => { drag = false; });
  })();

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
    const demo = isDemo(), bal = balance();
    if (!demo && !S.allowReal) { log("This is a REAL account. Tick 'Allow REAL' first (or switch to DEMO).", "warn"); return; }
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
      const msg = `${demo ? "DEMO" : "⚠ REAL MONEY"} account\n${MODE_NAME[MODE[S.button]]}: press ${describe()}\n` +
                  `when ${triggerText()} shows ${S.inRow}x in a row\nStake: $${st == null ? "?" : st}   Max trades: ${S.maxTrades}\n` +
                  `Stop-loss $${S.stopLoss}  Take-profit $${S.takeProfit}\n${odds}\n\nStart?`;
      if (!confirm(msg)) return;
    }
    running = true; finishing = null; t0 = Date.now(); trades = 0; run = 0; startBal = balance(); lastTickAt = Date.now();
    $("mdbStart").disabled = true;
    log(`START ${S.live ? "LIVE" : "WATCH-ONLY"}: ${describe()} on ${triggerText()} x${S.inRow}`, "ok");
  }
  function stop(why) {
    if (!running) return;
    running = false; finishing = null; $("mdbStart").disabled = false;
    const bal = balance(), pl = bal != null && startBal != null ? bal - startBal : null;
    const note = settled() ? "" : " (trades still open - see the final result in the game)";
    log(`STOP: ${why}. Trades: ${trades}${pl != null ? `, P/L: ${pl >= 0 ? "+" : ""}$${pl.toFixed(2)}` : ""}${note}`, "warn");
  }
  // Normal limits: place no more trades, let the open ones settle, then stop with the true P/L.
  function finish(why) { if (running && !finishing) { finishing = why; log(`${why} - waiting for open trades to finish…`); } }
  $("mdbStart").onclick = start;
  $("mdbStop").onclick = () => stop("stopped by you");

  function onTick(d) {
    digits.push(d); if (digits.length > 24) digits.shift();
    $("mdbDigits").textContent = digits.join(" ");
    if (!running || finishing) return;
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
      b.click();
      lastClick = Date.now(); trades++;
      log(`digit ${d}: CLICKED ${describe()} ($${st}) [${trades}/${S.maxTrades}]`, "ok");
    } else {
      lastClick = Date.now(); trades++;
      log(`digit ${d}: would click ${describe()} (watch-only) [${trades}/${S.maxTrades}]`);
    }
  }

  let lastOdds = "";
  function loop() {
    const demo = isDemo(), bal = balance(), done = settled();
    $("mdbAcc").innerHTML = demo ? '<span class="ok">DEMO</span>' : '<span class="warn">REAL</span>';
    $("mdbBadge").textContent = running ? (finishing ? "● finishing" : S.live ? "● LIVE" : "● watching") : "";
    $("mdbBal").textContent = "balance: " + (bal == null ? "?" : "$" + bal.toFixed(2));
    const mode = currentMode();
    $("mdbSym").textContent = symbolName() + (mode ? " · " + MODE_NAME[mode] : "");
    const st = stake(); $("mdbStake").textContent = "stake: " + (st == null ? "?" : "$" + st);
    const odds = MODE[S.button] === mode ? oddsText() : `odds show when the game is on ${MODE_NAME[MODE[S.button]]}`;
    if (odds !== lastOdds) { $("mdbOdds").innerHTML = odds; lastOdds = odds; }
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
    if (Date.now() - lastTickAt > 15000) { stop("no new ticks for 15 s (chart frozen? refresh the page)"); return; }
    if (finishing) { if (done) stop(finishing); return; }
    if (trades >= S.maxTrades) finish("reached max trades");
    else if (Date.now() - t0 > S.maxMinutes * 60000) finish("reached time limit");
    else if (done && pl != null && S.stopLoss > 0 && -pl >= S.stopLoss) stop("stop-loss hit");
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
