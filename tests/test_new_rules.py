from app.main import PROFILES
from app.evidence import analyze, decide_state
from app.schemas import CheckRequest, TrustState

def ids(thread):
    es = analyze(CheckRequest(business_id="demo_bakery", thread=thread), PROFILES["demo_bakery"])
    return {e.rule_id for e in es.evidence}, decide_state(es)

def m(text, **kw): return {"kind": "message", "text": text, **kw}

def test_device_code_on_real_microsoft_page():
    r, st = ids([m("Open https://microsoft.com/devicelogin and enter the code ABCD-1234 to verify your device.")])
    assert "DEVICE_CODE_LURE" in r and st != TrustState.SAFE

def test_html_and_svg_attachments_flagged():
    for f in ("Remittance.html", "voice.svg"):
        r, st = ids([m("see attached", attachment_names=[f])])
        assert "ACTIVE_CONTENT_ATTACHMENT" in r and st != TrustState.SAFE

def test_password_supplied_for_attachment_is_not_a_credential_request():
    r, _ = ids([m("Attached document. PDF Password:Abc123", attachment_names=["Doc.pdf"])])
    assert "PROTECTED_ATTACHMENT_LURE" in r and "CREDENTIAL_REQUEST" not in r

def test_real_credential_request_still_caught():
    r, _ = ids([m("Please send me your password so I can fix your account.")])
    assert "CREDENTIAL_REQUEST" in r

def test_display_name_spoof():
    r, st = ids([m("pay the invoice", sender="ABC Flour <abcflour.accounts@gmail.com>", channel="email")])
    assert "CTX_DISPLAY_NAME_SPOOF" in r and st != TrustState.SAFE

def test_genuine_otp_sms_and_teams_link_are_safe():
    assert ids([m("Your one-time code is 482910. Do not share it with anyone.", channel="sms")])[1] == TrustState.SAFE
    assert ids([m("Join: https://teams.microsoft.com/l/meetup-join/abc")])[1] == TrustState.SAFE

def test_supplier_with_correct_display_name_and_domain_is_safe():
    assert ids([m("Invoice LKR 98,000, account 100200308231.", sender="ABC Flour <accounts@abcflour.example>", channel="email")])[1] == TrustState.SAFE
