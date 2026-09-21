import type { ElectrostaticSetup } from "./electrostatic.ts";
import { validateSetup } from "./electrostatic-validation.ts";
import type { ValidationIssue } from "./electrostatic-validation.ts";

/**
 * Versioned share-state codec, schema v1: canonical JSON (sorted keys, −0 → 0) encoded as
 * unpadded base64url. Only the validated initial setup is encoded — never runtime, trail,
 * learner answers or derived readouts. Decoding is atomic: any problem rejects the whole payload.
 *
 * Deliberately free of URL/DOM APIs so it runs identically in tests, SSR and the browser; the
 * component layer decides which query key carries the payload.
 */

/** Budget for the encoded payload (the spec's 2,000-character URL budget). */
export const MAX_ENCODED_LENGTH = 2000;

export type EncodeResult =
  | { readonly ok: true; readonly encoded: string }
  | { readonly ok: false; readonly reason: "invalid-setup" | "too-long"; readonly issues: readonly ValidationIssue[] };

export type DecodeResult =
  | { readonly ok: true; readonly setup: ElectrostaticSetup; readonly warnings: readonly ValidationIssue[] }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const LOOKUP: Readonly<Record<string, number>> = Object.fromEntries([...ALPHABET].map((c, i) => [c, i]));
const BASE64URL = /^[A-Za-z0-9_-]*$/;

function bytesToBase64url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (b0 << 16) | (b1 << 8) | b2;
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += ALPHABET[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += ALPHABET[n & 63];
  }
  return out;
}

function base64urlToBytes(text: string): Uint8Array | null {
  if (!BASE64URL.test(text) || text.length % 4 === 1) return null;
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 4) {
    const chunk = text.slice(i, i + 4);
    const values = [...chunk].map((c) => LOOKUP[c]);
    const n = (values[0] << 18) | (values[1] << 12) | ((values[2] ?? 0) << 6) | (values[3] ?? 0);
    bytes.push((n >> 16) & 255);
    if (chunk.length > 2) bytes.push((n >> 8) & 255);
    if (chunk.length > 3) bytes.push(n & 255);
    // Reject non-canonical trailing bits so every payload has exactly one encoding.
    if (chunk.length === 2 && (values[1] & 15) !== 0) return null;
    if (chunk.length === 3 && (values[2] & 3) !== 0) return null;
  }
  return Uint8Array.from(bytes);
}

/** JSON with recursively sorted object keys and −0 written as 0. */
export function canonicalJson(value: unknown): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RangeError("non-finite number");
    return JSON.stringify(value === 0 ? 0 : value);
  }
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  throw new TypeError(`unsupported value ${typeof value}`);
}

function issue(code: string, message: string): ValidationIssue {
  return { path: "$", code, severity: "error", message };
}

/** Validate then encode. Oversized payloads are refused, never truncated. */
export function encodeSetup(setup: unknown): EncodeResult {
  const validated = validateSetup(setup);
  if (!validated.ok) return { ok: false, reason: "invalid-setup", issues: validated.issues };
  const encoded = bytesToBase64url(new TextEncoder().encode(canonicalJson(validated.setup)));
  if (encoded.length > MAX_ENCODED_LENGTH) {
    return { ok: false, reason: "too-long", issues: [issue("too-long", "分享狀態超過 2,000 字元，無法產生分享連結")] };
  }
  return { ok: true, encoded };
}

/** base64url → UTF-8 JSON → schema version gate → full validation. Fails closed. */
export function decodeSetup(encoded: string): DecodeResult {
  if (typeof encoded !== "string" || encoded.length === 0) {
    return { ok: false, issues: [issue("empty", "沒有分享狀態")] };
  }
  if (encoded.length > MAX_ENCODED_LENGTH) {
    return { ok: false, issues: [issue("too-long", "分享狀態過長")] };
  }
  const bytes = base64urlToBytes(encoded);
  if (bytes === null) return { ok: false, issues: [issue("bad-encoding", "分享狀態編碼損壞")] };
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, issues: [issue("bad-encoding", "分享狀態編碼損壞")] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, issues: [issue("bad-json", "分享狀態內容不完整")] };
  }
  const result = validateSetup(parsed);
  if (!result.ok) return { ok: false, issues: result.issues };
  return { ok: true, setup: result.setup, warnings: result.warnings };
}
