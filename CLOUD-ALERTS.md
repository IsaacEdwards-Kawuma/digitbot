# ☁️ DigitBot cloud alerts (free, runs on GitHub)

Every 15 minutes GitHub runs `scripts/cloud_alerts.js` for you - even when your phone and PC are off - and sends to your Telegram:

- **📡 trade ideas**: same strategies and the same PASS backtest rule as the 📡 Finder, with entry, stop-loss, take-profit and reward:risk;
- **📰 news warnings**: high-impact news coming up for those markets.

It only *sends messages*. It never trades.

## Switch it on (about 2 minutes)

1. **Make a Telegram bot** (skip if you did it for the Digit Bot): in Telegram open **@BotFather** → `/newbot` → copy the token.
2. **Get your chat id**: send your new bot "hi", then in DigitBot open **🛡️ Guard → Telegram**, paste the token and press **Find my chat id**.
3. On GitHub open this repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:
   - Name `TG_TOKEN`, value: your bot token
   - Name `TG_CHAT`, value: your chat id
4. Done. To test right away: **Actions** tab → **Cloud alerts** → **Run workflow**.

## Choose the markets

Edit `cloud-alerts.json`:

| setting | meaning |
|---|---|
| `crypto_top` | how many of the most-traded coins to scan (0 = none) |
| `crypto` | extra coins, e.g. `["PEPEUSDT"]` |
| `forex` | forex / metals, e.g. `["EURUSDT", "XAUUSDT"]` |
| `timeframes` | `"15m"`, `"30m"`, `"1h"`, `"4h"`, `"1d"` |
| `only_pass` | `true` = only strategies whose backtest PASSes on that market |
| `with_trend` | `true` = only trades in the direction of the trend |
| `sl_atr`, `rr` | stop-loss distance (× ATR) and reward : risk |
| `news_minutes`, `news_impact` | how close news must be to warn, and which impact |

Ideas are not advice: backtests can fail on new prices. Practise first and keep the risk small.
