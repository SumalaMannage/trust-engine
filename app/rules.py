"""Layer 1: deterministic security rules. No LLM, no network, fully unit-testable.
All weights/severities live in RULES so they are easy to explain and tune."""
from __future__ import annotations
import re
from urllib.parse import urlparse
from .schemas import Severity as S, Stage as G, TrustedBrand

# rule_id: (severity, weight, stage, title)
RULES: dict[str, tuple[S, int, G, str]] = {
    "URL_LOOKALIKE":        (S.high,     35, G.fake_page, "Link imitates a trusted brand"),
    "MEETING_LOOKALIKE":    (S.high,     40, G.fake_page, "Looks like a meeting link but the domain is wrong"),
    "URL_SHORTENER":        (S.medium,   15, G.lure,      "Shortened link hides the real destination"),
    "URL_IP_HOST":          (S.high,     30, G.fake_page, "Link uses a raw IP address"),
    "URL_NO_HTTPS":         (S.low,      10, G.lure,      "Link is not encrypted (http)"),
    "URL_PUNYCODE":         (S.high,     25, G.fake_page, "Link uses look-alike characters (punycode)"),
    "URL_PAYLOAD":          (S.critical, 40, G.payload,   "Link downloads a file that can run code"),
    "FILE_RISKY_EXT":       (S.critical, 45, G.payload,   "File type can run code on your computer"),
    "FILE_DOUBLE_EXT":      (S.critical, 45, G.payload,   "Disguised file name (double extension)"),
    "FILE_BIDI_SPOOF":      (S.critical, 45, G.payload,   "File name uses hidden text-reversal characters"),
    "FILE_ARCHIVE":         (S.medium,   15, G.payload,   "Archive can hide dangerous files"),
    "FILE_PURPOSE_MISMATCH":(S.high,     25, G.payload,   "File type does not match its claimed purpose"),
    "FAKE_INSTALLER":       (S.high,     30, G.fake_page, "Demands an install just to view a document or join a call"),
    "URGENCY_PAYMENT":      (S.medium,   20, G.pressure,  "Pressure to act fast and pay or log in"),
    "CREDENTIAL_REQUEST":   (S.high,     25, G.pressure,  "Asks for a password, OTP or PIN"),
    "CHANNEL_SWITCH":       (S.low,      10, G.lure,      "Pushes the conversation to a different app"),
    "OVERPAYMENT":          (S.high,     30, G.pressure,  "Classic overpayment / refund-the-difference pattern"),
    "BANK_CHANGE_CUE":      (S.medium,   15, G.pressure,  "Asks you to use new bank details"),
    "INJECTION":            (S.high,     30, G.lure,      "Message tries to manipulate AI checkers"),
    "CTX_NEW_ACCOUNT":      (S.high,     35, G.pressure,  "Bank account never used with this supplier"),
    "CTX_DOMAIN_MISMATCH":  (S.high,     30, G.lure,      "Sender domain differs from the supplier's known domain"),
    "CTX_PHONE_MISMATCH":   (S.medium,   15, G.lure,      "Sender phone differs from the supplier's known number"),
    "CTX_AMOUNT_ANOMALY":   (S.medium,   20, G.pressure,  "Amount is outside this supplier's normal range"),
    "CTX_ABOVE_THRESHOLD":  (S.low,      10, G.pressure,  "Amount needs owner approval"),
    "CTX_UNUSUAL_CHANNEL":  (S.low,      10, G.lure,      "Supplier does not normally use this channel"),
    "CTX_UNKNOWN_SUPPLIER": (S.medium,   15, G.lure,      "Claims to be an existing supplier, but not in your records"),
    "COR_PAYMENT_REDIRECT": (S.critical, 30, G.pressure,  "Payment redirection pattern"),
    "COR_ESCALATION":       (S.high,     25, G.pressure,  "Pressure increased after you declined"),
    "COR_CAMPAIGN":         (S.high,     20, G.pressure,  "Several attack stages in one conversation"),
}

RISKY_EXT = {"vbs","vbe","js","jse","wsf","wsh","exe","scr","bat","cmd","com","lnk","iso","img",
             "msi","ps1","hta","jar","dll","docm","xlsm","pif"}
ARCHIVE_EXT = {"zip","rar","7z","gz","tar"}
DOC_EXT = {"pdf","doc","docx","xls","xlsx","jpg","jpeg","png","txt","ppt","pptx","csv"}
EXEC_MIME = {"application/x-msdownload","application/x-dosexec","application/x-msdos-program",
             "application/vbscript","text/vbscript","application/x-sh","application/hta"}
SHORTENERS = {"bit.ly","tinyurl.com","t.co","goo.gl","is.gd","cutt.ly","rb.gy","shorturl.at","ow.ly","tiny.cc"}
MULTI_TLD = {"co.uk","com.au","com.lk","org.lk","gov.lk","co.in","com.sg","co.nz"}

# Built-in brands attackers love. Business-specific brands (banks, couriers) come from the profile.
BUILTIN_BRANDS = [
    TrustedBrand(name="Zoom", keyword="zoom", domains=["zoom.us", "zoom.com"], category="meeting"),
    TrustedBrand(name="Microsoft Teams", keyword="msteams", domains=["teams.microsoft.com", "microsoft.com", "teams.live.com"], category="meeting"),
    TrustedBrand(name="Google Meet", keyword="googlemeet", domains=["meet.google.com", "google.com"], category="meeting"),
    TrustedBrand(name="Adobe", keyword="adobe", domains=["adobe.com", "acrobat.com"], category="software"),
    TrustedBrand(name="PayPal", keyword="paypal", domains=["paypal.com"], category="bank"),
    TrustedBrand(name="DHL", keyword="dhl", domains=["dhl.com"], category="courier"),
]

URGENCY = re.compile(r"\b(urgent(ly)?|immediately|asap|right now|today only|within \d+ ?(hours?|minutes?|hrs?|mins?)|last warning|final notice|before the bank closes|as soon as possible)\b", re.I)
PAYMENT = re.compile(r"\b(pay|payment|transfer|deposit|send (the )?money|bank account|remit|advance|fee|settle)\b", re.I)
CREDENTIAL = re.compile(r"\b(otp|one[- ]time (code|password)|password|pin number|verify your account|login details|credentials)\b", re.I)
INSTALLER = re.compile(r"(update (adobe|reader|acrobat|your viewer)|install (to|the|a|our) [\w ]{0,25}(join|view|open|meeting|viewer|plugin)|download (to|the) (view|open|join)|plugin required|viewer (is )?(outdated|required)|update required to (view|open))", re.I)
BANK_CHANGE = re.compile(r"((changed|new|updated|change of) (our )?(bank|account)|bank (details|account)( has| have)? (changed|updated)|use (this|the) new account)", re.I)
CHANNEL = re.compile(r"((continue|chat|talk|message|text|reach) (me )?(on|via|through) (whatsapp|telegram|signal)|add me on (whatsapp|telegram|signal))", re.I)
OVERPAY = re.compile(r"((sent|paid|transferred) (you )?(too much|extra|more than)|send (back|the difference)|refund (me )?the (difference|balance|extra))", re.I)
INJECTION = re.compile(r"(ignore (all |any )?(the )?(previous|prior|above) (instructions|rules)|mark (this|it) as (safe|legit|genuine)|disregard (the |all )?(rules|instructions)|you are now|reveal (your|the) (system )?prompt|(^|\n)\s*(ai|assistant|system)\s*:)", re.I)
REFUSAL = re.compile(r"(can'?t|cannot|won'?t|don'?t|do not) (install|download|open|click|pay)|prefer (whatsapp|teams|email|a call|zoom)|not comfortable|no thanks|let'?s use (whatsapp|teams|email|zoom)|i('| a)m not going to", re.I)

URL_RE = re.compile(r"https?://[^\s<>\"')]+|(?:www\.)[^\s<>\"')]+", re.I)
AMOUNT_RE = re.compile(r"(?:LKR|Rs\.?|USD|\$)\s?([\d,]+(?:\.\d+)?)", re.I)
PHONE_RE = re.compile(r"(?:\+94|0)7\d[\s-]?\d{3}[\s-]?\d{4}")
DIGITS_RE = re.compile(r"\b\d[\d -]{7,22}\d\b")
BIDI = re.compile("[\u202a-\u202e\u2066-\u2069]")

def extract_urls(text: str) -> list[str]:
    return [u.rstrip(".,;") for u in URL_RE.findall(text)]

def extract_amounts(text: str) -> list[float]:
    out = []
    for m in AMOUNT_RE.findall(text):
        try: out.append(float(m.replace(",", "")))
        except ValueError: pass
    return out

def extract_accounts(text: str) -> list[str]:
    """Account-like numbers (9-18 digits, not phones). Used LOCALLY for matching; never sent to the LLM."""
    scrubbed = PHONE_RE.sub(" ", text)
    cands = [re.sub(r"\D", "", m) for m in DIGITS_RE.findall(scrubbed)]
    ending = re.findall(r"(?:account|a/c|acc)[^\d\n]{0,25}ending (?:in )?(\d{4,6})", text, re.I)
    return [c for c in cands if 9 <= len(c) <= 18] + ending

def redact(text: str) -> str:
    """Privacy: strip phones, long digit runs and email local-parts before anything leaves the service."""
    t = PHONE_RE.sub("[PHONE]", text)
    t = DIGITS_RE.sub(lambda m: "[NUMBER]" if len(re.sub(r"\D", "", m.group())) >= 9 else m.group(), t)
    return re.sub(r"[\w.+-]+@", "[EMAIL]@", t)

def registrable(host: str) -> str:
    parts = host.lower().strip(".").split(".")
    if len(parts) >= 3 and ".".join(parts[-2:]) in MULTI_TLD: return ".".join(parts[-3:])
    return ".".join(parts[-2:]) if len(parts) >= 2 else host

def host_allowed(host: str, domains: list[str]) -> bool:
    h = host.lower()
    return any(h == d or h.endswith("." + d) for d in domains)

def lev(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j-1] + 1, prev[j-1] + (ca != cb)))
        prev = cur
    return prev[-1]

def _norm(h: str) -> str:
    return h.lower().replace("0", "o").replace("1", "l").replace("rn", "m").replace("vv", "w").replace("-", "")

Hit = tuple[str, str, str | None, str | None]  # rule_id, detail, observed, expected

def check_url(url: str, brands: list[TrustedBrand]) -> list[Hit]:
    hits: list[Hit] = []
    p = urlparse(url if "://" in url else "http://" + url)
    host = (p.hostname or "").lower()
    if not host: return hits
    if p.scheme == "http": hits.append(("URL_NO_HTTPS", "The link starts with http:// instead of https://.", url, None))
    if re.fullmatch(r"\d{1,3}(\.\d{1,3}){3}", host):
        hits.append(("URL_IP_HOST", "Real services use names, not numbers, in links.", host, None))
    if host.startswith("xn--") or ".xn--" in host:
        hits.append(("URL_PUNYCODE", "Domain uses special characters that can mimic a real name.", host, None))
    if registrable(host) in SHORTENERS:
        hits.append(("URL_SHORTENER", "You cannot see where this link really goes.", host, None))
    all_domains = [d for b in brands for d in b.domains]
    if not host_allowed(host, all_domains):
        flagged = False
        for b in brands:
            if b.keyword in _norm(host):
                rid = "MEETING_LOOKALIKE" if b.category == "meeting" else "URL_LOOKALIKE"
                hits.append((rid, f"The domain contains '{b.name}' but is not an official {b.name} domain.", host, " / ".join(b.domains)))
                flagged = True; break
        if not flagged:
            label = registrable(host).split(".")[0]
            for b in brands:
                for d in b.domains:
                    dl = registrable(d).split(".")[0]
                    if label != dl and len(dl) >= 5 and lev(_norm(label), _norm(dl)) <= 1:
                        hits.append(("URL_LOOKALIKE", f"The domain is one character away from {b.name}'s real domain.", host, d))
                        flagged = True; break
                if flagged: break
    ext = p.path.rsplit(".", 1)[-1].lower() if "." in p.path.rsplit("/", 1)[-1] else ""
    if ext in RISKY_EXT:
        hits.append(("URL_PAYLOAD", f"The link serves a .{ext} file, which runs code when opened.", p.path, None))
    return hits

def check_file(name: str, mime: str | None = None, purpose: str | None = None) -> list[Hit]:
    hits: list[Hit] = []
    if BIDI.search(name):
        hits.append(("FILE_BIDI_SPOOF", "Hidden characters make the file name display differently from its real type.", name, None))
    clean = BIDI.sub("", name).strip().lower()
    parts = clean.split(".")
    ext = parts[-1] if len(parts) > 1 else ""
    if len(parts) >= 3 and parts[-2] in DOC_EXT and ext in RISKY_EXT | ARCHIVE_EXT:
        hits.append(("FILE_DOUBLE_EXT", f"Looks like a .{parts[-2]} but the real type is .{ext}.", name, f".{parts[-2]}"))
    elif ext in RISKY_EXT:
        hits.append(("FILE_RISKY_EXT", f".{ext} files can run programs on your computer. Do not open.", name, None))
    elif ext in ARCHIVE_EXT:
        hits.append(("FILE_ARCHIVE", "Archives are often used to hide scripts and executables.", name, None))
    if purpose and (ext in RISKY_EXT or (mime or "").lower() in EXEC_MIME) and re.search(r"(document|invoice|pdf|brief|requirements|meeting|photo|image|receipt|slip|order)", purpose, re.I):
        hits.append(("FILE_PURPOSE_MISMATCH", f"Described as '{purpose}' but the file is executable content.", name, purpose))
    return hits

def check_message_text(text: str) -> list[Hit]:
    hits: list[Hit] = []
    urgency = URGENCY.search(text)
    money = PAYMENT.search(text)
    cred = CREDENTIAL.search(text)
    if urgency and (money or cred):
        hits.append(("URGENCY_PAYMENT", "Urgency combined with a payment or login request.", f"{urgency.group(0)} + {(money or cred).group(0)}", None))
    if cred: hits.append(("CREDENTIAL_REQUEST", "Legitimate businesses do not ask for passwords or OTPs in chat.", cred.group(0), None))
    m = INSTALLER.search(text)
    if m: hits.append(("FAKE_INSTALLER", "Real meeting and document links do not require installing software first.", m.group(0), None))
    m = CHANNEL.search(text)
    if m: hits.append(("CHANNEL_SWITCH", "Moving to another app removes any protection your email or platform gives you.", m.group(0), None))
    m = OVERPAY.search(text)
    if m: hits.append(("OVERPAYMENT", "Scammers 'overpay' with a fake payment, then ask for the difference back.", m.group(0), None))
    m = BANK_CHANGE.search(text)
    if m: hits.append(("BANK_CHANGE_CUE", "Bank-detail changes are the most common way invoice fraud works.", m.group(0), None))
    m = INJECTION.search(text)
    if m: hits.append(("INJECTION", "Text aimed at AI tools is a strong red flag on its own.", m.group(0).strip(), None))
    return hits
