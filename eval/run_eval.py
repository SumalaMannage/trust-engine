"""Run: python eval/run_eval.py   (no cloud needed). Uses the deterministic engine only."""
import json, sys, csv
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.main import PROFILES
from app.evidence import analyze, decide_state
from app import analyst
from app.schemas import AnalystFinding, CheckRequest, ImageFacts

samples = []
for f in sorted(Path(__file__).parent.glob("samples*.json")):
    samples += json.loads(f.read_text())
rows, fails = [], []
for s in samples:
    # mock_facts = what Gemini WOULD read from each image (tests the rules, not Gemini's reading)
    imgs = {int(k): (ImageFacts(**v) if v else None) for k, v in s.get("mock_facts", {}).items()}
    req = CheckRequest(business_id="demo_bakery", thread=s["thread"])
    # mock_findings = what the Gemini ANALYST would report (tests the plumbing, not Gemini). Quotes are verified like in production.
    rep = analyst.AnalystReport(findings=[AnalystFinding(**f) for f in s.get("mock_findings", [])]) if s.get("mock_findings") else None
    finds = analyst.validate(rep, analyst.build_sources(req, imgs))
    es = analyze(req, PROFILES["demo_bakery"], imgs, finds)
    st = decide_state(es).value
    ok = st in s["expect"]
    if "expect_stage" in s: ok = ok and es.kill_chain_stage.value == s["expect_stage"]
    if "expect_escalation" in s: ok = ok and es.escalation_detected == s["expect_escalation"]
    skipped = s.get("needs_extraction", False)
    rows.append([s["id"], s["category"], s["label"], "/".join(s["expect"]), st, es.score, "SKIP" if skipped else ("PASS" if ok else "FAIL")])
    if not ok and not skipped: fails.append(s["id"])
print(f"{'id':5}{'category':14}{'label':7}{'expected':14}{'got':8}{'score':6}result")
for r in rows: print(f"{r[0]:5}{r[1]:14}{r[2]:7}{r[3]:14}{r[4]:8}{r[5]:<6}{r[6]}")
tested = [(s, r) for s, r in zip(samples, rows) if not s.get("needs_extraction")]
scams = [r for s, r in tested if s["label"] == "scam"]; legit = [r for s, r in tested if s["label"] == "legit"]
caught = sum(r[4] != "SAFE" for r in scams); flagged = sum(r[4] != "SAFE" for r in legit)
print(f"\nScams caught: {caught}/{len(scams)}   Legit wrongly flagged: {flagged}/{len(legit)}")
print(f"Not yet testable (need image reading): {sum(s.get('needs_extraction', False) for s in samples)}")
print("Failures:", fails or "none")
with open(Path(__file__).parent / "results.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(["id","category","label","expected","got","score","result"]); w.writerows(rows)
