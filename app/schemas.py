"""All data contracts for the Trust Engine (Pydantic v2).
Model.model_json_schema() exports JSON Schema; the same models drive FastAPI
validation and Gemini structured output."""
from __future__ import annotations
from enum import Enum
from typing import Annotated, Literal, Optional, Union
from pydantic import BaseModel, Field

# ---------- 1. INPUT PAYLOADS ----------
class Channel(str, Enum):
    email = "email"; whatsapp = "whatsapp"; sms = "sms"; phone = "phone"
    linkedin = "linkedin"; web = "web"; other = "other"

class UrlInput(BaseModel):
    kind: Literal["url"] = "url"
    url: str = Field(max_length=2048)
    direction: Literal["inbound", "outbound"] = "inbound"

class MessageInput(BaseModel):
    kind: Literal["message"] = "message"
    text: str = Field(max_length=5000)
    channel: Channel = Channel.other
    sender: Optional[str] = Field(None, max_length=254)
    claimed_entity: Optional[str] = Field(None, max_length=120)
    attachment_names: list[str] = Field(default_factory=list, max_length=10)
    direction: Literal["inbound", "outbound"] = "inbound"  # outbound = the owner's own reply

class FileInput(BaseModel):
    kind: Literal["file"] = "file"
    filename: str = Field(max_length=255)
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = Field(None, ge=0)
    claimed_purpose: Optional[str] = Field(None, max_length=120)
    direction: Literal["inbound", "outbound"] = "inbound"

ThreadItem = Annotated[Union[UrlInput, MessageInput, FileInput], Field(discriminator="kind")]

class CheckRequest(BaseModel):
    business_id: str = Field(max_length=64)
    thread: list[ThreadItem] = Field(min_length=1, max_length=20)  # client sends the thread; server stores nothing

# ---------- 2. BUSINESS CONTEXT ENTITY DATABASE ----------
class BankAccount(BaseModel):
    number: str
    bank: str
    first_used: Optional[str] = None
    payments_made: int = 0

class Supplier(BaseModel):
    id: str
    name: str
    aliases: list[str] = []
    known_domains: list[str] = []
    known_phones: list[str] = []
    accounts: list[BankAccount] = []
    typical_amount_min: float = 0
    typical_amount_max: float = 0
    usual_channels: list[Channel] = []
    relationship_since: Optional[str] = None

class TrustedBrand(BaseModel):
    name: str
    keyword: str                     # token attackers imitate, e.g. "zoom"
    domains: list[str]               # official domains
    category: Literal["bank", "courier", "meeting", "software", "other"] = "other"

class BusinessProfile(BaseModel):
    business_id: str
    name: str
    currency: str = "LKR"
    owner_approval_threshold: float = 200_000
    approved_tools: list[str] = []
    suppliers: list[Supplier] = []
    trusted_brands: list[TrustedBrand] = []

# ---------- 3. STRUCTURED EVIDENCE SET ----------
class Severity(str, Enum):
    info = "info"; low = "low"; medium = "medium"; high = "high"; critical = "critical"

class Stage(str, Enum):
    none = "none"; lure = "lure"; fake_page = "fake_page"; payload = "payload"; pressure = "pressure"

class Evidence(BaseModel):
    id: str
    layer: Literal["deterministic", "context", "correlation"]
    rule_id: str
    severity: Severity
    title: str
    detail: str
    observed: Optional[str] = None
    expected: Optional[str] = None
    weight: int
    stage: Stage = Stage.none
    thread_index: Optional[int] = None

class EvidenceSet(BaseModel):
    business_id: str
    evidence: list[Evidence]
    positives: list[str] = []
    score: int
    kill_chain_stage: Stage
    escalation_detected: bool
    injection_attempt_detected: bool
    supplier_matched: Optional[str] = None

# ---------- 4. FINAL TRUST DECISION ----------
class TrustState(str, Enum):
    SAFE = "SAFE"; VERIFY = "VERIFY"; STOP = "STOP"

class AIExplanation(BaseModel):      # Gemini structured-output schema
    headline: str = Field(max_length=120)
    explanation: str = Field(max_length=900)
    actions: list[str] = Field(max_length=4)
    cited_evidence_ids: list[str]

class TrustDecision(BaseModel):
    state: TrustState
    score: int
    kill_chain_stage: Stage
    escalation_detected: bool
    injection_attempt_detected: bool
    headline: str
    explanation: str
    actions: list[str]
    evidence: list[Evidence]
    positives: list[str]
    explanation_source: Literal["gemini", "template"]
    disclaimer: str = ("Checked against your records and known red flags only. "
                       "SAFE means nothing unusual was found, not that the sender is genuine.")
