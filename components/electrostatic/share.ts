import { decodeSetup, encodeSetup } from "../../models/electrostatic-serialization.ts";
import { DEFAULT_PRESET, ELECTROSTATIC_PRESETS, type ElectrostaticSetup } from "../../models/electrostatic.ts";
import type { ValidationIssue } from "../../models/electrostatic-validation.ts";

export const SHARE_QUERY_KEY = "s";
export const MAX_SHARE_URL_LENGTH = 2000;

export interface InitialShareState {
  readonly setup: ElectrostaticSetup;
  readonly error: string | null;
  readonly issues: readonly ValidationIssue[];
}

/** Decode once at the route boundary. Invalid input fails closed to the safe default preset. */
export function initialStateFromShare(encoded: string | null | undefined): InitialShareState {
  if (!encoded) return { setup: ELECTROSTATIC_PRESETS[DEFAULT_PRESET], error: null, issues: [] };
  const decoded = decodeSetup(encoded);
  if (decoded.ok) return { setup: decoded.setup, error: null, issues: decoded.warnings };
  return {
    setup: ELECTROSTATIC_PRESETS[DEFAULT_PRESET],
    error: "分享狀態無法讀取；已載入安全的單電荷設定。",
    issues: decoded.issues,
  };
}

export type ShareUrlResult =
  | { readonly ok: true; readonly url: string; readonly encoded: string }
  | { readonly ok: false; readonly message: string; readonly issues: readonly ValidationIssue[] };

/** Encode schema v1 and replace only the share query key; UI/session state never enters the URL. */
export function createShareUrl(setup: ElectrostaticSetup, currentUrl: string): ShareUrlResult {
  const encoded = encodeSetup(setup);
  if (!encoded.ok) {
    return {
      ok: false,
      message: encoded.reason === "too-long" ? "分享連結超過 2,000 字元。" : "目前設定未通過驗證，無法分享。",
      issues: encoded.issues,
    };
  }
  const url = new URL(currentUrl);
  url.searchParams.set(SHARE_QUERY_KEY, encoded.encoded);
  if (url.toString().length > MAX_SHARE_URL_LENGTH) {
    return { ok: false, message: "完整分享網址超過 2,000 字元。", issues: [] };
  }
  return { ok: true, url: url.toString(), encoded: encoded.encoded };
}

/** Cheap structural sharing keeps probe-only edits from invalidating the static field grid. */
export function retainFieldSceneReferences(
  previous: ElectrostaticSetup,
  next: ElectrostaticSetup,
): ElectrostaticSetup {
  const sameSources = previous.sources.length === next.sources.length && previous.sources.every((source, index) => {
    const candidate = next.sources[index];
    return candidate !== undefined && source.id === candidate.id && source.x_m === candidate.x_m &&
      source.y_m === candidate.y_m && source.q_C === candidate.q_C;
  });
  const sameDomain = previous.domain.xmin === next.domain.xmin && previous.domain.xmax === next.domain.xmax &&
    previous.domain.ymin === next.domain.ymin && previous.domain.ymax === next.domain.ymax;
  const sameCore = previous.singularity.policy === next.singularity.policy &&
    previous.singularity.rCore_m === next.singularity.rCore_m;
  const sameStyle = previous.fieldStyle.Emin_N_per_C === next.fieldStyle.Emin_N_per_C &&
    previous.fieldStyle.Emax_N_per_C === next.fieldStyle.Emax_N_per_C &&
    previous.fieldStyle.gridDensity === next.fieldStyle.gridDensity;
  if (!sameSources || !sameDomain || !sameCore || !sameStyle) return next;
  return {
    ...next,
    sources: previous.sources,
    domain: previous.domain,
    singularity: previous.singularity,
    fieldStyle: previous.fieldStyle,
  };
}
