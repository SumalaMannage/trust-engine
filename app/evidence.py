"""Layer 3: Evidence Correlation Engine.
Runs the rule layers over an ordered thread, tracks state (kill-chain stage, escalation),
adds correlation findings, scores, and emits one structured EvidenceSet."""
from __future__ import annotations
from collections import Counter
from . import rules
from .context import check_message_context
from .schemas import (BusinessProfile, Channel, CheckRequest, Evidence, EvidenceSet, FileInput,
                      ImageInput, MessageInput, Severity, Stage, UrlInput)

STAGE_ORDER = [Stage.none, Stage.lure, Stage.fake_page, Stage.payload, Stage.pressure]
MAX_HITS_PER_RULE = 2          # stops one repeated signal from flooding the score
INFO_LAYER = {"CTX": "context", "COR": "correlation", "AI_": "ai"}

AI_CAP = 30                      # most points the AI analyst can ever add
# Money and login tactics are strong evidence. Pressure, emotion and similar tactics also appear in honest messages
# (an angry customer, a rushed buyer), so they are weak evidence and capped so they can never trigger a warning alone.
STRONG_TACTICS = {"payment_redirection", "advance_fee", "credential_harvesting", "impersonation"}
ANALYST_STRONG = {"low": 8, "medium": 15, "high": 25}
ANALYST_WEAK = {"low": 3, "medium": 6, "high": 10}
WEAK_CAP = 12
ANALYST_STAGE = {"pressure_urgency": Stage.pressure, "payment_redirection": Stage.pressure, "advance_fee": Stage.pressure,
                 "credential_harvesting": Stage.pressure}
NO_RULE_CAP = {"AI_ANALYST_FINDING"}   # these are capped by AI_CAP instead

def analyze(req: CheckRequest, prof: BusinessProfile, images: dict | None = None, findings: list | None = None) -> EvidenceSet:
    """images: {thread_index: ImageFacts | None}. None means the image could not be read."""
    brands = rules.BUILTIN_BRANDS + prof.trusted_brands
    ev: list[Evidence] = []
    positives: list[str] = []
    matched: str | None = None
    declined_at: list[int] = []        # indexes of owner replies that refused something
    seen_urls: set[str] = set()
    escalated = False

    def add(rule_id: str, detail: str, observed, expected, idx: int | None, weight: int | None = None, stage=None, title: str | None = None):
        sev, w0, stage0, title0 = rules.RULES[rule_id]
        weight = w0 if weight is None else weight
        stage = stage or stage0
        title = title or title0
        layer = INFO_LAYER.get(rule_id[:3], "deterministic")
        ev.append(Evidence(id=f"E{len(ev)+1}", layer=layer, rule_id=rule_id, severity=sev, title=title,
                           detail=detail, observed=None if observed is None else str(observed)[:200],
                           expected=None if expected is None else str(expected)[:200],
                           weight=weight, stage=stage, thread_index=idx))

    for i, item in enumerate(req.thread):
        inbound = item.direction == "inbound"
        hits: list[rules.Hit] = []
        new_content = False   # did this inbound item bring urgency / a new link / a new file?

        if isinstance(item, MessageInput):
            if not inbound:
                if rules.REFUSAL.search(item.text): declined_at.append(i)
                continue
            hits += rules.check_message_text(item.text, bool(item.attachment_names))
            new_content = bool(rules.URGENCY.search(item.text) and rules.PAYMENT.search(item.text))
            for u in rules.extract_urls(item.text):
                if u not in seen_urls:
                    seen_urls.add(u); new_content = True; hits += rules.check_url(u, brands)
            for fn in item.attachment_names:
                new_content = True; hits += rules.check_file(fn)
            sup, ctx_hits, pos = check_message_context(item, prof)
            hits += ctx_hits; positives += pos
            matched = matched or (sup.name if sup else None)
        elif isinstance(item, UrlInput) and inbound:
            if item.url not in seen_urls:
                seen_urls.add(item.url); new_content = True; hits += rules.check_url(item.url, brands)
        elif isinstance(item, ImageInput) and inbound:
            new_content = True
            facts = (images or {}).get(i)
            if facts is None:
                hits.append(("IMAGE_UNREADABLE", "The image could not be read, so it was not checked. Treat it as unverified.", None, None))
            else:
                hits += rules.check_image_facts(facts, item.expected_amount, brands)
                pseudo = MessageInput(text=(facts.visible_text or "")[:5000], channel=Channel.other)
                sup, ctx_hits, pos = check_message_context(pseudo, prof)
                hits += ctx_hits; positives += pos
                matched = matched or (sup.name if sup else None)
        elif isinstance(item, FileInput) and inbound:
            new_content = True; hits += rules.check_file(item.filename, item.mime_type, item.claimed_purpose)

        for rid, detail, obs, exp in hits:
            add(rid, detail, obs, exp, i)

        # ---- escalation: owner declined earlier, and this inbound item pushes harder ----
        if inbound and new_content and any(d < i for d in declined_at) and not escalated:
            escalated = True
            add("COR_ESCALATION", "After you said no or offered a safer option, the sender added urgency, a new link or a new file.",
                f"message {i+1}", None, i)

    # ---- AI analyst findings: capped, quote-verified upstream, can only add evidence ----
    remaining, weak_used = AI_CAP, 0
    base = lambda f: (ANALYST_STRONG if f.tactic in STRONG_TACTICS else ANALYST_WEAK)[f.confidence]
    for f in sorted(findings or [], key=lambda x: -base(x)):
        w = min(base(f), remaining)
        if f.tactic not in STRONG_TACTICS:
            w = min(w, WEAK_CAP - weak_used); weak_used += max(w, 0)
        if w <= 0: continue
        remaining -= w
        add("AI_ANALYST_FINDING", f.reason, f.quote, None, f.source_index, weight=w,
            stage=ANALYST_STAGE.get(f.tactic, Stage.lure), title="AI analyst: " + f.tactic.replace("_", " "))

    # ---- cross-signal correlation ----
    ids = Counter(e.rule_id for e in ev)
    if (ids["BANK_CHANGE_CUE"] or ids["CTX_NEW_ACCOUNT"]) and (
            ids["CTX_DOMAIN_MISMATCH"] or ids["CTX_PHONE_MISMATCH"] or ids["CTX_UNUSUAL_CHANNEL"]
            or ids["URGENCY_PAYMENT"] or ids["CTX_AMOUNT_ANOMALY"]):
        add("COR_PAYMENT_REDIRECT", "A change of payment destination combined with other anomalies is the signature of supplier-impersonation fraud.", None, None, None)
    stages = {e.stage for e in ev if e.stage != Stage.none and e.layer != "correlation"}
    if len(stages) >= 3:
        add("COR_CAMPAIGN", f"This conversation touches {len(stages)} stages of an attack, not one isolated problem.", ", ".join(sorted(s.value for s in stages)), None, None)

    # ---- score: cap repeats, clamp 0-100 ----
    per_rule: Counter = Counter(); score = 0
    for e in ev:
        per_rule[e.rule_id] += 1
        if per_rule[e.rule_id] <= MAX_HITS_PER_RULE or e.rule_id in NO_RULE_CAP: score += e.weight
    score = min(score, 100)

    reached = max((e.stage for e in ev), key=STAGE_ORDER.index, default=Stage.none)
    return EvidenceSet(business_id=req.business_id, evidence=ev, positives=list(dict.fromkeys(positives)),
                       score=score, kill_chain_stage=reached, escalation_detected=escalated,
                       injection_attempt_detected=bool(ids["INJECTION"]), supplier_matched=matched)

def decide_state(es: EvidenceSet):
    """Deterministic and final. The LLM can never lower or change this."""
    from .schemas import TrustState
    stop_trigger = any(e.severity == Severity.critical for e in es.evidence) or es.score >= 60
    has_non_ai = any(e.layer != "ai" and e.weight > 0 for e in es.evidence)
    if stop_trigger:
        # AI-only evidence can lift a verdict to VERIFY but never to STOP: STOP needs a rule or business-context hit too.
        return TrustState.STOP if has_non_ai else TrustState.VERIFY
    if es.score >= 25 or any(e.severity == Severity.high for e in es.evidence): return TrustState.VERIFY
    return TrustState.SAFE
