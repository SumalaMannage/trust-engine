"""Run: python3 eval/run_live.py URL [--workers 4] [--limit 20]
Sends every TEXT sample to the deployed service (real Gemini analyst), several at a time, printing progress as it goes.
Ctrl+C is safe: it stops and summarises whatever finished. Image and mock-facts samples are skipped. Use synthetic data only."""
import csv, json, re, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

def arg(name, default):
    return int(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else default
url = sys.argv[1].rstrip("/") + "/v1/check"
workers, limit = arg("--workers", 4), arg("--limit", 10_000)

def group_of(file, sid):
    if "theirs" not in file: return "mine"
    n = re.search(r"(\d+)$", sid)
    return "theirs-holdout" if n and int(n.group(1)) % 2 == 1 else "theirs-dev"

samples = []
for f in sorted(Path(__file__).parent.glob("samples*.json")):
    for x in json.loads(f.read_text()): x["_group"] = group_of(f.name, x["id"]); samples.append(x)
samples = [s for s in samples if not (s.get("needs_extraction") or s.get("mock_facts") or any(i.get("kind") == "image" for i in s["thread"]))][:limit]

def post(body):
    req = urllib.request.Request(url, body, {"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=90))

def one(s):
    body = json.dumps({"business_id": "demo_bakery", "thread": s["thread"]}).encode()
    t0 = time.time()
    for attempt in (1, 2):                                   # one retry for rate limits / hiccups
        try:
            r = post(body); got, ai = r["state"], sum(1 for e in r["evidence"] if e["layer"] == "ai"); break
        except Exception as e:
            got, ai = f"ERR {type(e).__name__}", 0
            if attempt == 1: time.sleep(3)
    return [s["id"], s["_group"], s["label"], "/".join(s["expect"]), got, ai, round(time.time() - t0, 1), "PASS" if got in s["expect"] else "FAIL"]

rows, done = [], 0
print(f"Running {len(samples)} samples, {workers} at a time...", flush=True)
ex = ThreadPoolExecutor(max_workers=workers)
futs = [ex.submit(one, s) for s in samples]
try:
    for fu in as_completed(futs):
        r = fu.result(); rows.append(r); done += 1
        shown = r[4] if r[1] != "theirs-holdout" else "(holdout)"
        print(f"[{done}/{len(samples)}] {r[0]:6} {shown:12} {r[6]}s", flush=True)
except KeyboardInterrupt:
    print("\nStopped early. Summarising what finished.", flush=True)
    for fu in futs: fu.cancel()
ex.shutdown(wait=False, cancel_futures=True)
rows.sort(key=lambda r: r[0])
print("\nLIVE SUMMARY (rules + business context + Gemini analyst)")
for g in ("mine", "theirs-dev", "theirs-holdout"):
    t = [r for r in rows if r[1] == g]
    sc = [r for r in t if r[2] == "scam"]; lg = [r for r in t if r[2] == "legit"]
    if t: print(f"  {g:15} scams caught {sum(r[4] in ('VERIFY','STOP') for r in sc)}/{len(sc)}   legit wrongly flagged {sum(r[4] in ('VERIFY','STOP') for r in lg)}/{len(lg)}")
errs = [r for r in rows if str(r[4]).startswith("ERR")]
if errs: print(f"  {len(errs)} requests failed (counted as not flagged): {sorted(set(r[4] for r in errs))}")
lat = sorted(r[6] for r in rows if not str(r[4]).startswith("ERR"))
if lat: print(f"latency (each request) median {lat[len(lat)//2]}s, p95 {lat[max(0, int(len(lat)*0.95)-1)]}s")
with open(Path(__file__).parent / "results_live.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(["id","group","label","expected","got","ai_findings","seconds","result"]); w.writerows(rows)
print("Dev failures:", [r[0] for r in rows if r[7] == "FAIL" and r[1] != "theirs-holdout"])
