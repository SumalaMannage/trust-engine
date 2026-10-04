"""Run: python demo.py  -> prints the Trust Decision for the cake-shop attack thread."""
import json
from app.main import PROFILES
from app.evidence import analyze, decide_state
from app.reasoner import explain
from app.schemas import CheckRequest

thread = [
 {"kind": "message", "text": "Hi, I want a custom wedding cake. Join to discuss: https://zoom-meeting-join.com/j/8812.vbs", "channel": "linkedin"},
 {"kind": "message", "text": "I can't download that. Can we use WhatsApp or Teams instead?", "direction": "outbound"},
 {"kind": "message", "text": "No, you must use my link. Pay the advance fee within 2 hours or the order is cancelled. Update Reader to view the PDF.",
  "attachment_names": ["Cake_Design.pdf.vbs"], "channel": "linkedin"},
]
req = CheckRequest(business_id="demo_bakery", thread=thread)
es = analyze(req, PROFILES["demo_bakery"])
d = explain(es, decide_state(es), req)
print(d.state.value, "| score", d.score, "| stage", d.kill_chain_stage.value, "| escalation", d.escalation_detected, "|", d.explanation_source)
print(d.headline); print(d.explanation)
for a in d.actions: print(" -", a)
print("\nEVIDENCE:")
for e in d.evidence: print(f" {e.id:>3} [{e.severity.value:8}] {e.rule_id:20} +{e.weight:<3} {e.title}")
