/*
 * API contract, mirrored by hand from app/schemas.py (backend commit 8dfa7e2).
 * Once the backend runs locally, regenerate and compare:
 *   npx openapi-typescript http://localhost:8000/openapi.json -o src/lib/api/schema.gen.ts
 */

export type Channel = "email" | "whatsapp" | "sms" | "phone" | "linkedin" | "web" | "other";
export type Direction = "inbound" | "outbound";
export type ImageMime = "image/jpeg" | "image/png" | "image/webp";

// ---------- request ----------
export interface MessageInput {
  kind: "message";
  text: string;                       // max 5,000
  channel?: Channel;
  sender?: string | null;             // max 254
  claimed_entity?: string | null;     // max 120
  attachment_names?: string[];        // max 10
  direction?: Direction;
}

export interface UrlInput {
  kind: "url";
  url: string;                        // max 2,048
  direction?: Direction;
}

export interface FileInput {
  kind: "file";
  filename: string;                   // max 255. Only the name is sent, never the file.
  mime_type?: string | null;
  size_bytes?: number | null;
  claimed_purpose?: string | null;
  direction?: Direction;
}

export interface ImageInput {
  kind: "image";
  image_b64: string;                  // raw base64, no data: prefix, about 5 MB decoded
  mime_type: ImageMime;
  expected_amount?: number | null;
  direction?: Direction;
}

export type ThreadItem = MessageInput | UrlInput | FileInput | ImageInput;

export interface CheckRequest {
  business_id: string;
  thread: ThreadItem[];               // 1 to 20 items
}

// ---------- response ----------
export type TrustState = "SAFE" | "VERIFY" | "STOP";
export type Severity = "info" | "low" | "medium" | "high" | "critical";
export type Stage = "none" | "lure" | "fake_page" | "payload" | "pressure";
export type EvidenceLayer = "deterministic" | "context" | "correlation" | "ai";

export interface Evidence {
  id: string;
  layer: EvidenceLayer;
  rule_id: string;
  severity: Severity;
  title: string;
  detail: string;
  observed?: string | null;
  expected?: string | null;
  weight: number;
  stage: Stage;
  thread_index?: number | null;
}

export interface ImageRead {
  index: number;
  image_type: string;
  legible: boolean;
  reference_id?: string | null;
  amount?: number | null;
  currency?: string | null;
  date?: string | null;
  requests_made: string[];
  urgency_cues: string[];
  warning_signs: string[];
  text_excerpt: string;
}

export interface TrustDecision {
  state: TrustState;
  score: number;
  kill_chain_stage: Stage;
  escalation_detected: boolean;
  injection_attempt_detected: boolean;
  headline: string;
  explanation: string;
  actions: string[];
  evidence: Evidence[];
  positives: string[];
  explanation_source: "gemini" | "template";
  image_reads: ImageRead[];
  disclaimer: string;
}

// ---------- business view (GET /v1/business/{id}) ----------
export interface MaskedAccount {
  bank: string;
  last4: string;
  payments_made: number;
  first_used?: string | null;
}

export interface SupplierView {
  id: string;
  name: string;
  aliases: string[];
  known_domains: string[];
  phone_hints: string[];              // e.g. "ends 4567"
  accounts: MaskedAccount[];
  typical_amount_min: number;
  typical_amount_max: number;
  usual_channels: Channel[];
  relationship_since?: string | null;
}

export interface BusinessView {
  business_id: string;
  name: string;
  currency: string;
  owner_approval_threshold: number;
  approved_tools: string[];
  suppliers: SupplierView[];
  trusted_brand_names: string[];
}
