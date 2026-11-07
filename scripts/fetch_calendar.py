"""Copies the week's economic calendar (ForexFactory export) to calendar.json on this site.
The source doesn't allow browsers to read it directly, so the DigitBot pages read this copy instead.
Run by .github/workflows/calendar.yml every few hours."""
import json, urllib.request, datetime, sys

URLS = ["https://nfs.faireconomy.media/ff_calendar_thisweek.json", "https://nfs.faireconomy.media/ff_calendar_nextweek.json"]
events = []
for u in URLS:
    try:
        req = urllib.request.Request(u, headers={"User-Agent": "DigitBot-calendar/1.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            events += json.load(r)
    except Exception as e:
        print("skip", u, e)
if not events:
    print("no calendar data - keeping the old file"); sys.exit(0)
now = datetime.datetime.now(datetime.timezone.utc)
keep, seen = [], set()
for e in events:
    try:
        t = datetime.datetime.fromisoformat(e["date"])
    except Exception:
        continue
    if not (now - datetime.timedelta(days=1) <= t <= now + datetime.timedelta(days=14)):
        continue
    k = (e.get("title"), e.get("country"), e.get("date"))
    if k in seen:
        continue
    seen.add(k)
    keep.append({x: e.get(x, "") for x in ("title", "country", "date", "impact", "forecast", "previous")})
keep.sort(key=lambda e: e["date"])
new = json.dumps(keep, ensure_ascii=False, indent=0)
try:
    old = open("calendar.json", encoding="utf-8").read()
except FileNotFoundError:
    old = ""
if new != old:
    open("calendar.json", "w", encoding="utf-8").write(new)
    print(f"calendar.json updated: {len(keep)} events")
else:
    print("no change")
