"""Layer 2: Business Context. Compares what arrived against what THIS business normally does.
Runs locally on the un-redacted text; raw account numbers never go to the LLM."""
from __future__ import annotations
import json, re
from email.utils import parseaddr
from pathlib import Path
from .schemas import BusinessProfile, MessageInput, Supplier
from . import rules

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

def load_profiles() -> dict[str, BusinessProfile]:
    out = {}
    for f in DATA_DIR.glob("profile_*.json"):
        p = BusinessProfile.model_validate(json.loads(f.read_text()))
        out[p.business_id] = p
    return out

def _digits(s: str) -> str: return re.sub(r"\D", "", s)

def parse_sender(sender: str | None):
    """'ABC Flour <x@gmail.com>' -> ('abc flour', 'x@gmail.com', 'gmail.com'). Phones return empty domain."""
    name, addr = parseaddr(sender or "")
    addr = addr.strip().lower()
    dom = addr.split("@")[-1] if "@" in addr else ""
    return name.strip().lower(), addr, dom

def match_supplier(msg: MessageInput, prof: BusinessProfile) -> Supplier | None:
    dname, _, dom = parse_sender(msg.sender)
    text = f"{msg.claimed_entity or ''} {dname} {msg.text}".lower()
    for s in prof.suppliers:
        names = [s.name.lower(), *[a.lower() for a in s.aliases]]
        if any(n in text for n in names) or (dom and rules.host_allowed(dom, s.known_domains)):
            return s
    return None

def claims_existing_relationship(text: str) -> bool:
    return bool(re.search(r"(your (regular|usual|existing) (supplier|vendor)|we('| a)re your supplier|as usual|our previous (orders?|invoices?))", text, re.I))

def check_message_context(msg: MessageInput, prof: BusinessProfile):
    """returns (supplier, hits, positives); hits use the same tuple shape as rules.Hit."""
    hits, positives = [], []
    sup = match_supplier(msg, prof)
    dname0, addr0, dom0 = parse_sender(msg.sender)
    if dom0 and dname0:
        for b in rules.BUILTIN_BRANDS + prof.trusted_brands:
            if b.name.lower() in dname0 and not rules.host_allowed(dom0, b.domains):
                hits.append(("CTX_DISPLAY_NAME_SPOOF", f"The name says '{b.name}' but the address belongs to {dom0}.", addr0, ", ".join(b.domains)))
                break
    if sup is None:
        if claims_existing_relationship(msg.text):
            hits.append(("CTX_UNKNOWN_SUPPLIER", "No supplier in your records matches this sender or name.", msg.claimed_entity or msg.sender, None))
        return None, hits, positives

    # sender identity
    dname, addr, dom = parse_sender(msg.sender)
    if dom:
        if rules.host_allowed(dom, sup.known_domains):
            positives.append(f"Sender domain {dom} matches {sup.name}'s known domain")
        else:
            names = [sup.name.lower(), *[a.lower() for a in sup.aliases]]
            if dname and any(n in dname for n in names):
                extra = " This is a free email service." if dom in rules.FREEMAIL else ""
                hits.append(("CTX_DISPLAY_NAME_SPOOF", f"The name says '{sup.name}' but the address belongs to {dom}.{extra}", addr, ", ".join(sup.known_domains)))
            else:
                hits.append(("CTX_DOMAIN_MISMATCH", f"Email is not from a domain you have used with {sup.name}.", dom, ", ".join(sup.known_domains)))
    elif msg.sender and sup.known_phones:
        if _digits(msg.sender)[-9:] in {_digits(p)[-9:] for p in sup.known_phones}:
            positives.append(f"Sender phone matches {sup.name}'s saved number")
        else:
            hits.append(("CTX_PHONE_MISMATCH", f"This number is not the one saved for {sup.name}.", msg.sender, ", ".join(sup.known_phones)))

    # channel
    if sup.usual_channels:
        if msg.channel in sup.usual_channels: positives.append(f"{sup.name} normally contacts you via {msg.channel.value}")
        else: hits.append(("CTX_UNUSUAL_CHANNEL", f"{sup.name} normally uses {', '.join(c.value for c in sup.usual_channels)}.", msg.channel.value, ", ".join(c.value for c in sup.usual_channels)))

    # bank accounts
    known = [a.number for a in sup.accounts]
    for cand in dict.fromkeys(rules.extract_accounts(msg.text)):
        is_known = any(cand == k or (len(cand) <= 6 and k.endswith(cand)) for k in known)
        if is_known:
            n = next(a.payments_made for a in sup.accounts if a.number.endswith(cand[-4:]))
            positives.append(f"Account ending {cand[-4:]} matches {n} previous payments")
        else:
            prev = sup.accounts[0]
            hits.append(("CTX_NEW_ACCOUNT",
                         f"Your last {prev.payments_made} payments to {sup.name} went to the account ending {prev.number[-4:]}.",
                         f"ending {cand[-4:]}", f"ending {prev.number[-4:]}"))

    # amounts
    amts = rules.extract_amounts(msg.text)
    if amts and sup.typical_amount_max:
        top = max(amts)
        if top > sup.typical_amount_max * 1.25 or top < sup.typical_amount_min * 0.5:
            hits.append(("CTX_AMOUNT_ANOMALY", f"Typical range with {sup.name}: {sup.typical_amount_min:,.0f}-{sup.typical_amount_max:,.0f} {prof.currency}.",
                         f"{top:,.0f} {prof.currency}", f"{sup.typical_amount_min:,.0f}-{sup.typical_amount_max:,.0f}"))
        else:
            positives.append(f"Amount {top:,.0f} is within the normal range for {sup.name}")
        if top >= prof.owner_approval_threshold:
            hits.append(("CTX_ABOVE_THRESHOLD", "This payment is above the limit you set for owner approval.", f"{top:,.0f}", f"{prof.owner_approval_threshold:,.0f}"))
    return sup, hits, positives
