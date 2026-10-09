cd"""Usage: curl ... | python3 tools/show.py    Prints a short, readable summary of a check result."""
import json, sys
d = json.load(sys.stdin)
if "detail" in d: print("ERROR:", json.dumps(d["detail"])[:300]); sys.exit(1)
print(f"{d['state']}  score {d['score']}  stage {d['kill_chain_stage']}  escalation {d['escalation_detected']}  explained by {d['explanation_source']}")
print(d["headline"]); print(d["explanation"])
print("\nWHAT TO DO:"); [print(" -", a) for a in d["actions"]]
print("\nEVIDENCE:")
for e in d["evidence"]: print(f" {e['id']:>3} [{e['layer']:13}] {e['rule_id']:24} +{e['weight']:<3} {' '.join(str(e.get('observed') or e['title']).split())[:90]}")
for r in d.get("image_reads", []):
    print(f"\nIMAGE {r['index']}: read as {r['image_type']}, legible={r['legible']}, amount={r['amount']}, date={r['date']}, ref={r['reference_id']}")
    print("  requests:", r["requests_made"], "| urgency:", r["urgency_cues"]); print("  text:", " ".join(r["text_excerpt"].split())[:200])
