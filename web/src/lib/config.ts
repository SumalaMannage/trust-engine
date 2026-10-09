// Same origin on Cloud Run (FastAPI serves this site), so production leaves the base empty.
// `next dev` has no API of its own, so development defaults to the local FastAPI port.
const DEV_API = process.env.NODE_ENV === "development" ? "http://localhost:8000" : "";
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? DEV_API).replace(/\/+$/, "");

// Only one profile exists on the backend for now.
export const BUSINESS_ID = "demo_bakery";
export const BUSINESS_LABEL = "Demo Bakery";
export const IS_DEMO = BUSINESS_ID.startsWith("demo");

// Text checks average about 4 s; each image can take up to 30 s on the server.
export const CHECK_TIMEOUT_MS = 120_000;
export const SLOW_CHECK_AFTER_MS = 20_000;   // "Still checking · over 20 seconds"

// Backend limits (app/schemas.py).
export const LIMITS = {
  threadItems: 20,
  messageChars: 5_000,
  urlChars: 2_048,
  fileNameChars: 255,
  senderChars: 254,
  imageBytes: 5 * 1024 * 1024,
} as const;
