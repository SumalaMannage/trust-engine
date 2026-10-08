"""Run: python3 eval/run_live.py URL   -> sends every TEXT sample to the deployed service (real Gemini analyst).
Compare with the offline run (rules only) to measure what Gemini adds. Image and mock-facts samples are skipped.
Prints a small table and writes eval/results_live.csv. Use synthetic samples only."""
import csv, json, sys, time, urllib.request
from pathlib import Path
url = sys.argv[1].rstrip("/") + "/v1/check"
samples = []
for f in sorted(Path(__file__).parent.glob("samples*.json")): samples += json.loads(f.read_text())
rows = []
for s in samples:
    if s.get("needs_extraction") or s.get("mock_facts") or any(i.get("kind") == "image" for i in s["thread"]): continue
    body = json.dumps({"business_id": "demo_bakery", "thread": s["thread"]}).encode()
    t0 = time.time()
    try:
        r = json.load(urllib.request.urlopen(urllib.request.Request(url, body, {"Content-Type": "application/json"}), timeout=60))
        got, ai = r["state"], sum(1 for e in r["evidence"] if e["layer"] == "ai")
    except Exception as e:
        got, ai = f"ERR {type(e).__name__}", 0
    rows.append([s["id"], s["category"], s["label"], "/".join(s["expect"]), got, ai, round(time.time() - t0, 1), "PASS" if got in s["expect"] else "FAIL"])
print(f"{'id':5}{'category':22}{'label':7}{'expected':14}{'got':8}{'ai':4}{'sec':6}result")
for r in rows: print(f"{r[0]:5}{r[1]:22}{r[2]:7}{r[3]:14}{r[4]:8}{r[5]:<4}{r[6]:<6}{r[7]}")
scam = [r for r in rows if r[2] == "scam"]; legit = [r for r in rows if r[2] == "legit"]
print(f"\nLIVE  scams caught: {sum(r[4] in ('VERIFY','STOP') for r in scam)}/{len(scam)}   legit flagged: {sum(r[4] in ('VERIFY','STOP') for r in legit)}/{len(legit)}")
lat = sorted(r[6] for r in rows if not str(r[4]).startswith("ERR"))
if lat: print(f"latency median {lat[len(lat)//2]}s, p95 {lat[int(len(lat)*0.95)-1]}s")
with open(Path(__file__).parent / "results_live.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(["id","category","label","expected","got","ai_findings","seconds","result"]); w.writerows(rows)
