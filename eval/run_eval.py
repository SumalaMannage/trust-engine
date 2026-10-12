"""Run: python3 eval/run_eval.py [--failures]     (offline: fixed rules + business context, NO Gemini analyst)
Groups: 'mine' (developer-written), 'theirs-dev' and 'theirs-holdout' (teammate's blind set, split by odd/even id number).
Only dev failures can be shown; the holdout is reported as totals so you cannot tune the rules to it."""
import csv, json, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app import analyst
from app.main import PROFILES
from app.evidence import analyze, decide_state
from app.schemas import AnalystFinding, CheckRequest, ImageFacts

def group_of(file: str, sid: str) -> str:
    if "theirs" not in file: return "mine"
    n = re.search(r"(\d+)$", sid)
    return "theirs-holdout" if n and int(n.group(1)) % 2 == 1 else "theirs-dev"

samples = []
for f in sorted(Path(__file__).parent.glob("samples*.json")):
    for s in json.loads(f.read_text()): s["_group"] = group_of(f.name, s["id"]); samples.append(s)
rows = []
for s in samples:
    imgs = {int(k): (ImageFacts(**v) if v else None) for k, v in s.get("mock_facts", {}).items()}
    req = CheckRequest(business_id="demo_bakery", thread=s["thread"])
    rep = analyst.AnalystReport(findings=[AnalystFinding(**f) for f in s.get("mock_findings", [])]) if s.get("mock_findings") else None
    es = analyze(req, PROFILES["demo_bakery"], imgs, analyst.validate(rep, analyst.build_sources(req, imgs)))
    st = decide_state(es).value
    ok = st in s["expect"]
    if "expect_stage" in s: ok = ok and es.kill_chain_stage.value == s["expect_stage"]
    if "expect_escalation" in s: ok = ok and es.escalation_detected == s["expect_escalation"]
    rows.append(dict(s=s, id=s["id"], group=s["_group"], label=s["label"], expected="/".join(s["expect"]), got=st, score=es.score,
                     result="SKIP" if s.get("needs_extraction") else ("PASS" if ok else "FAIL")))
print(f"{'id':6}{'group':16}{'label':7}{'expected':14}{'got':8}{'score':6}result")
for r in rows:
    if r["group"] == "theirs-holdout": continue            # holdout rows are never listed one by one
    print(f"{r['id']:6}{r['group']:16}{r['label']:7}{r['expected']:14}{r['got']:8}{r['score']:<6}{r['result']}")
print("\nSUMMARY (rules only, no Gemini analyst)")
for g in ("mine", "theirs-dev", "theirs-holdout"):
    t = [r for r in rows if r["group"] == g and r["result"] != "SKIP"]
    sc = [r for r in t if r["label"] == "scam"]; lg = [r for r in t if r["label"] == "legit"]
    if not t: continue
    print(f"  {g:15} scams caught {sum(r['got'] != 'SAFE' for r in sc)}/{len(sc)}   legit wrongly flagged {sum(r['got'] != 'SAFE' for r in lg)}/{len(lg)}")
print("Not yet testable (need image reading):", sum(1 for r in rows if r["result"] == "SKIP"))
if "--failures" in sys.argv:
    print("\nDEV FAILURES (holdout is hidden on purpose):")
    for r in rows:
        if r["result"] == "FAIL" and r["group"] != "theirs-holdout":
            txt = " | ".join(m.get("text", "") for m in r["s"]["thread"] if m.get("kind") == "message" and m.get("direction") != "outbound")
            print(f" {r['id']} [{r['s'].get('category','')}] expected {r['expected']} got {r['got']} score {r['score']}\n    {' '.join(txt.split())[:220]}")
with open(Path(__file__).parent / "results.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(["id", "group", "label", "expected", "got", "score", "result"])
    w.writerows([[r["id"], r["group"], r["label"], r["expected"], r["got"], r["score"], r["result"]] for r in rows])
