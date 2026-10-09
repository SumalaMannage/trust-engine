"""Run: python3 tools/csv_to_samples.py samples_template.csv   -> writes eval/samples_theirs.json
Turns the spreadsheet into test samples. Rows whose id starts with EX, or with an empty text, are ignored."""
import csv, json, sys, pathlib
rows = list(csv.DictReader(open(sys.argv[1], newline="", encoding="utf-8-sig")))
groups: dict[str, list] = {}
for r in rows:
    i = (r.get("id") or "").strip()
    if not i or i.upper().startswith("EX") or not (r.get("text") or "").strip(): continue
    groups.setdefault(i, []).append(r)
out, problems = [], []
for i, g in groups.items():
    g.sort(key=lambda r: int(r.get("turn") or 1))
    label = g[0]["label"].strip().lower()
    if label not in ("scam", "legit"): problems.append(f"{i}: label must be scam or legit"); continue
    thread = []
    for r in g:
        m = {"kind": "message", "text": r["text"].strip(), "channel": (r.get("channel") or "other").strip().lower()}
        if (r.get("who") or "they").strip().lower() == "me": m["direction"] = "outbound"
        elif (r.get("sender") or "").strip(): m["sender"] = r["sender"].strip()
        thread.append(m)
    out.append({"id": "H" + i if not i.upper().startswith("H") else i, "category": (g[0].get("category") or "").strip(), "label": label,
                "expect": ["VERIFY", "STOP"] if label == "scam" else ["SAFE"], "note": "written by teammate (blind set)", "thread": thread})
dest = pathlib.Path(__file__).resolve().parent.parent / "eval" / "samples_theirs.json"
dest.write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
print(f"wrote {len(out)} samples to {dest}")
for p in problems: print("PROBLEM:", p)
