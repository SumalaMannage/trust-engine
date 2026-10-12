from app import rules
from app.context import check_message_context
from app.evidence import analyze, decide_state
from app.main import PROFILES
from app.schemas import AnalystFinding, CheckRequest, MessageInput, TrustState

def ids(text): return {h[0] for h in rules.check_message_text(text)}
def state(text, findings=None, **kw):
    r = CheckRequest(business_id="demo_bakery", thread=[{"kind": "message", "text": text, **kw}])
    return decide_state(analyze(r, PROFILES["demo_bakery"], None, findings or []))
def F(q, tactic, conf="medium"): return AnalystFinding(tactic=tactic, quote=q, reason="r", confidence=conf, source_index=0)

# ---- each new rule fires on paraphrases (not copies of any test sample) ----
def test_advance_fee_variants():
    assert "ADVANCE_FEE" in ids("To lock in your place please pay the training fee of 2,000 today")
    assert "ADVANCE_FEE" in ids("Kindly settle the customs charges so we can release the parcel")
    assert "ADVANCE_FEE" not in ids("Delivery charges are included in your invoice, thanks")

def test_qr_trick():
    assert "QR_PAYMENT_TRICK" in ids("Please scan the code with your bank app to receive my payment")
    assert "QR_PAYMENT_TRICK" not in ids("Scan the code at the till to see our menu")

def test_unconfirmed_payment_pressure():
    assert "PAID_CLAIM_PRESSURE" in ids("Done, I have paid, see slip. Please hand over the cake now, my driver is waiting outside")
    assert "PAID_CLAIM_PRESSURE" not in ids("I paid this morning by transfer, I'll collect the cake at 5pm tomorrow, thanks")
    assert "PAID_CLAIM_PRESSURE" not in ids("Hi, my driver is waiting outside, is the order ready?")

def test_bait_link_needs_both_bait_and_link():
    assert "CLICKBAIT_LINK" in ids("Is this you in this video?? click here to see http://clip-view.example/a1")
    assert "CLICKBAIT_LINK" not in ids("Is this you on the shop poster? Come and see")
    assert "CLICKBAIT_LINK" not in ids("Our new menu is here https://shop.example/menu")

def test_signin_lure_counts_as_credential_request():
    assert "CREDENTIAL_REQUEST" in ids("Open the quote here and sign in with your email to see the details https://quote-share.example/q1")
    assert "CREDENTIAL_REQUEST" in ids("Please sign in to view the document: https://doc-share.example/d9")
    assert "CREDENTIAL_REQUEST" not in ids("Your order has shipped, thanks for shopping with us")

def test_unknown_biller():
    t = "Please find attached invoice 220 for Rs 12,000, subscription renewal. Payment due within 5 days to the bank details below."
    sup, hits, _ = check_message_context(MessageInput(text=t), PROFILES["demo_bakery"])
    assert sup is None and any(h[0] == "CTX_UNKNOWN_BILLER_ACCOUNT" for h in hits)
    t3 = "Invoice for this month, LKR 98,000, payment due Friday to account 100200308231"
    sup3, hits3, _ = check_message_context(MessageInput(text=t3, claimed_entity="ABC Flour", sender="accounts@abcflour.example", channel="email"), PROFILES["demo_bakery"])
    assert sup3 is not None and not any(h[0] == "CTX_UNKNOWN_BILLER" for h in hits3)    # a known supplier is not flagged

# ---- soft AI tactics: pushy or angry is not enough on its own ----
def test_two_soft_findings_alone_stay_safe_but_risky_ones_do_not():
    msg = "Third time I am writing. Unacceptable service, I want my refund and I will post a bad review."
    soft = [F("Unacceptable service", "pressure_urgency", "high"), F("I will post a bad review", "emotional_manipulation", "high")]
    assert state(msg, soft) == TrustState.SAFE
    risky = [F("I want my refund", "payment_redirection", "high"), F("Third time I am writing", "impersonation", "medium")]
    assert state(msg, risky) == TrustState.VERIFY

def test_legit_messages_stay_safe_with_the_new_rules():
    for t in ["Hi, can I order a birthday cake for Saturday? I'll pay on pickup.",
              "Your order #4471 has been confirmed. Thank you for shopping with us.",
              "We are planning a corporate gathering for about 80 guests next month, could you send a menu and prices?",
              "Reminder: invoice 118 is 10 days overdue. Please settle this week."]:
        assert state(t) == TrustState.SAFE, t

def test_unknown_biller_alone_is_enough_for_a_warning():
    t = "Please find attached invoice 220 for Rs 12,000, listing renewal. Payment due within 5 days to the account below."
    assert state(t) == TrustState.VERIFY

def test_overdue_reminder_with_same_account_and_receipts_are_not_flagged():
    reminder = "Hi, a reminder that invoice 1187 for Rs 56,400 is 10 days overdue. We need the payment this week. Same bank account as always."
    receipt = "Thanks for your payment of Rs 2,900 for your monthly plan, invoice CB-20933. View your billing anytime in settings."
    assert state(reminder) == TrustState.SAFE
    assert state(receipt) == TrustState.SAFE

def test_overpayment_passed_on_to_a_third_party():
    t = "Our finance team will send a slightly higher amount to cover the courier, please forward the balance to the courier on collection."
    assert "OVERPAYMENT" in ids(t) and state(t) != TrustState.SAFE

def test_one_ai_finding_alone_is_not_enough_two_are():
    msg = "Your parcel arrives tomorrow. Track it with the courier app."
    one = [F("Track it with the courier app", "impersonation", "high")]
    two = one + [F("Your parcel arrives tomorrow", "payment_redirection", "medium")]
    assert state(msg, one) == TrustState.SAFE
    assert state(msg, two) == TrustState.VERIFY
