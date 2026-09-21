import { R_CORE_M } from "../lib/science/electrostatics/field.ts";
import { MACRO_DT_S } from "../lib/science/electrostatics/integrator.ts";
import { FIELD_SCALE_V1 } from "../lib/science/electrostatics/sampling.ts";
import type { Domain } from "../lib/science/electrostatics/types.ts";
import type { ElectrostaticSetup } from "./electrostatic.ts";

/**
 * Approved v0.1 parameter envelope (D-01, D-03), canonical SI.
 * Validation never clamps: a candidate either passes whole or is rejected with issues.
 */
export const ENVELOPE = {
  domain: { xmin: -2, xmax: 2, ymin: -1.5, ymax: 1.5 } satisfies Domain,
  sourceCount: { min: 1, max: 4 },
  sourceChargeMagnitude_C: { min: 1e-9, max: 5e-9 },
  testChargeMagnitude_C: { min: 0.1e-9, max: 0.5e-9 },
  testMass_kg: { min: 5e-9, max: 20e-9 },
  chargeToMass_C_per_kg: { min: 0.005, max: 0.05 },
  initialSpeed_mps: { max: 2 },
  /** Test initial position to every source centre (2 rCore). */
  initialSourceDistance_m: 0.24,
  /** Guided presets and auto-placed sources keep at least this centre spacing. */
  presetSourceSpacing_m: 0.24,
  rCore_m: R_CORE_M,
  macroDt_s: MACRO_DT_S,
  maxSubsteps: 4,
  fieldScale: FIELD_SCALE_V1,
} as const;

export const SCHEMA_VERSION = 1;
export const MODEL_VERSION = "electrostatic-point-charge-1";
export const SOURCE_ID_PATTERN = /^[a-z][a-z0-9-]{0,15}$/;
export const PRESET_IDS = ["single-positive", "like-pair", "dipole"] as const;
export const GRID_DENSITIES = ["standard"] as const;

/**
 * Relative slack on envelope bounds so exact decimal bounds survive binary rounding
 * (e.g. 0.5 nC / 10 µg evaluates to 0.05000000000000001). Far below any physical effect.
 */
const BOUND_SLACK = 1e-9;

export type IssueSeverity = "error" | "warning";

export interface ValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly severity: IssueSeverity;
  readonly message: string;
}

export type ValidationResult =
  | { readonly ok: true; readonly setup: ElectrostaticSetup; readonly warnings: readonly ValidationIssue[] }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

function within(value: number, min: number, max: number): boolean {
  return value >= min * (1 - BOUND_SLACK) && value <= max * (1 + BOUND_SLACK);
}

function atLeast(value: number, min: number): boolean {
  return value >= min * (1 - BOUND_SLACK);
}

function inDomain(x: number, y: number, domain: Domain): boolean {
  return x >= domain.xmin && x <= domain.xmax && y >= domain.ymin && y <= domain.ymax;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Convert −0 to 0 so canonical encodings and equality are stable. */
function unsignedZero(value: number): number {
  return value === 0 ? 0 : value;
}

class IssueList {
  readonly items: ValidationIssue[] = [];

  error(path: string, code: string, message: string): void {
    this.items.push({ path, code, severity: "error", message });
  }

  warning(path: string, code: string, message: string): void {
    this.items.push({ path, code, severity: "warning", message });
  }

  get hasErrors(): boolean {
    return this.items.some((issue) => issue.severity === "error");
  }
}

function checkKeys(value: Record<string, unknown>, expected: readonly string[], path: string, issues: IssueList): void {
  for (const key of Object.keys(value)) {
    if (!expected.includes(key)) issues.error(`${path}.${key}`, "unknown-key", `未知欄位 ${key}`);
  }
  for (const key of expected) {
    if (!(key in value)) issues.error(`${path}.${key}`, "missing-key", `缺少欄位 ${key}`);
  }
}

function readNumber(value: Record<string, unknown>, key: string, path: string, issues: IssueList): number {
  const raw = value[key];
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    issues.error(`${path}.${key}`, "not-finite", `${key} 必須是有限數值`);
    return Number.NaN;
  }
  return unsignedZero(raw);
}

const SETUP_KEYS = [
  "schemaVersion", "modelVersion", "domain", "sources", "probe", "testParticle",
  "singularity", "integrator", "fieldStyle", "presetId",
] as const;

/**
 * Validate an untrusted candidate against schema v1 and the approved envelope. On success the
 * returned setup is canonical: sources ordered by id, −0 normalised, no extra keys.
 */
export function validateSetup(candidate: unknown): ValidationResult {
  const issues = new IssueList();
  if (!isPlainObject(candidate)) {
    issues.error("$", "not-object", "狀態必須是物件");
    return { ok: false, issues: issues.items };
  }
  if (candidate.schemaVersion !== SCHEMA_VERSION) {
    const future = typeof candidate.schemaVersion === "number" && candidate.schemaVersion > SCHEMA_VERSION;
    issues.error(
      "$.schemaVersion",
      future ? "unsupported-future-version" : "unknown-version",
      future ? "此狀態來自較新版本，請使用較新的 Kakau Lab" : "無法辨識的狀態版本",
    );
    return { ok: false, issues: issues.items };
  }
  checkKeys(candidate, SETUP_KEYS, "$", issues);
  if (candidate.modelVersion !== MODEL_VERSION) {
    issues.error("$.modelVersion", "model-version", "科學模型版本不符");
  }

  // Domain, singularity, integrator and field scale are fixed in v0.1; they are serialized so
  // a future version can change them explicitly, never silently.
  const domain = candidate.domain;
  if (!isPlainObject(domain)) {
    issues.error("$.domain", "not-object", "domain 必須是物件");
  } else {
    checkKeys(domain, ["xmin", "xmax", "ymin", "ymax"], "$.domain", issues);
    for (const key of ["xmin", "xmax", "ymin", "ymax"] as const) {
      if (domain[key] !== ENVELOPE.domain[key]) issues.error(`$.domain.${key}`, "fixed-value", "v0.1 world domain 固定為 4×3 m");
    }
  }
  const singularity = candidate.singularity;
  if (!isPlainObject(singularity)) {
    issues.error("$.singularity", "not-object", "singularity 必須是物件");
  } else {
    checkKeys(singularity, ["policy", "rCore_m"], "$.singularity", issues);
    if (singularity.policy !== "excluded-core" || singularity.rCore_m !== ENVELOPE.rCore_m) {
      issues.error("$.singularity", "fixed-value", "v0.1 singularity policy 固定為 0.12 m excluded core");
    }
  }
  const integrator = candidate.integrator;
  if (!isPlainObject(integrator)) {
    issues.error("$.integrator", "not-object", "integrator 必須是物件");
  } else {
    checkKeys(integrator, ["kind", "dt_s", "maxSubsteps"], "$.integrator", issues);
    if (
      integrator.kind !== "velocity-verlet-bounded" ||
      integrator.dt_s !== ENVELOPE.macroDt_s ||
      integrator.maxSubsteps !== ENVELOPE.maxSubsteps
    ) {
      issues.error("$.integrator", "fixed-value", "v0.1 integrator 固定為 1/960 s velocity Verlet＋最多 4 substeps");
    }
  }
  const fieldStyle = candidate.fieldStyle;
  if (!isPlainObject(fieldStyle)) {
    issues.error("$.fieldStyle", "not-object", "fieldStyle 必須是物件");
  } else {
    checkKeys(fieldStyle, ["Emin_N_per_C", "Emax_N_per_C", "gridDensity"], "$.fieldStyle", issues);
    if (
      fieldStyle.Emin_N_per_C !== ENVELOPE.fieldScale.Emin_N_per_C ||
      fieldStyle.Emax_N_per_C !== ENVELOPE.fieldScale.Emax_N_per_C
    ) {
      issues.error("$.fieldStyle", "fixed-value", "v0.1 場強尺度固定為 1–5,000 N/C");
    }
    if (!(GRID_DENSITIES as readonly unknown[]).includes(fieldStyle.gridDensity)) {
      issues.error("$.fieldStyle.gridDensity", "enum", "未知的 grid density");
    }
  }
  const presetId = candidate.presetId;
  if (presetId !== null && !(PRESET_IDS as readonly unknown[]).includes(presetId)) {
    issues.error("$.presetId", "enum", "未知的 preset");
  }

  // Sources.
  const rawSources = candidate.sources;
  const sources: { id: string; x_m: number; y_m: number; q_C: number }[] = [];
  if (!Array.isArray(rawSources)) {
    issues.error("$.sources", "not-array", "sources 必須是陣列");
  } else {
    if (rawSources.length < ENVELOPE.sourceCount.min || rawSources.length > ENVELOPE.sourceCount.max) {
      issues.error("$.sources", "source-count", "來源電荷必須是 1–4 顆");
    }
    const seen = new Set<string>();
    rawSources.forEach((raw, index) => {
      const path = `$.sources[${index}]`;
      if (!isPlainObject(raw)) {
        issues.error(path, "not-object", "來源電荷必須是物件");
        return;
      }
      checkKeys(raw, ["id", "x_m", "y_m", "q_C"], path, issues);
      const id = raw.id;
      if (typeof id !== "string" || !SOURCE_ID_PATTERN.test(id)) {
        issues.error(`${path}.id`, "invalid-id", "來源 id 格式不符");
      } else if (seen.has(id)) {
        issues.error(`${path}.id`, "duplicate-id", `重複的來源 id ${id}`);
      } else {
        seen.add(id);
      }
      const x = readNumber(raw, "x_m", path, issues);
      const y = readNumber(raw, "y_m", path, issues);
      const q = readNumber(raw, "q_C", path, issues);
      if (Number.isFinite(x) && Number.isFinite(y) && !inDomain(x, y, ENVELOPE.domain)) {
        issues.error(path, "outside-domain", "來源電荷必須在 world domain 內");
      }
      if (Number.isFinite(q) && !within(Math.abs(q), ENVELOPE.sourceChargeMagnitude_C.min, ENVELOPE.sourceChargeMagnitude_C.max)) {
        issues.error(`${path}.q_C`, "source-charge-range", "來源電量大小必須是 1–5 nC");
      }
      if (typeof id === "string") sources.push({ id, x_m: x, y_m: y, q_C: q });
    });
    for (let i = 0; i < sources.length; i += 1) {
      for (let j = i + 1; j < sources.length; j += 1) {
        const d = Math.hypot(sources[i].x_m - sources[j].x_m, sources[i].y_m - sources[j].y_m);
        if (d < 2 * ENVELOPE.rCore_m) {
          issues.warning("$.sources", "cores-overlap", `來源 ${sources[i].id} 與 ${sources[j].id} 的 excluded core 重疊，超出已驗證範圍`);
        }
      }
    }
  }

  // Probe: may sit inside a core (its readout is then undefined), but must be in the domain.
  const rawProbe = candidate.probe;
  let probe = { x_m: Number.NaN, y_m: Number.NaN, visible: true };
  if (!isPlainObject(rawProbe)) {
    issues.error("$.probe", "not-object", "probe 必須是物件");
  } else {
    checkKeys(rawProbe, ["x_m", "y_m", "visible"], "$.probe", issues);
    const x = readNumber(rawProbe, "x_m", "$.probe", issues);
    const y = readNumber(rawProbe, "y_m", "$.probe", issues);
    if (Number.isFinite(x) && Number.isFinite(y) && !inDomain(x, y, ENVELOPE.domain)) {
      issues.error("$.probe", "outside-domain", "probe 必須在 world domain 內");
    }
    if (typeof rawProbe.visible !== "boolean") issues.error("$.probe.visible", "not-boolean", "visible 必須是布林值");
    probe = { x_m: x, y_m: y, visible: rawProbe.visible === true };
  }

  // Test particle initial condition.
  const rawTest = candidate.testParticle;
  let testParticle = { x_m: Number.NaN, y_m: Number.NaN, vx_mps: Number.NaN, vy_mps: Number.NaN, q_C: Number.NaN, mass_kg: Number.NaN };
  if (!isPlainObject(rawTest)) {
    issues.error("$.testParticle", "not-object", "testParticle 必須是物件");
  } else {
    const path = "$.testParticle";
    checkKeys(rawTest, ["x_m", "y_m", "vx_mps", "vy_mps", "q_C", "mass_kg"], path, issues);
    testParticle = {
      x_m: readNumber(rawTest, "x_m", path, issues),
      y_m: readNumber(rawTest, "y_m", path, issues),
      vx_mps: readNumber(rawTest, "vx_mps", path, issues),
      vy_mps: readNumber(rawTest, "vy_mps", path, issues),
      q_C: readNumber(rawTest, "q_C", path, issues),
      mass_kg: readNumber(rawTest, "mass_kg", path, issues),
    };
    const { x_m, y_m, vx_mps, vy_mps, q_C, mass_kg } = testParticle;
    if (Number.isFinite(x_m) && Number.isFinite(y_m)) {
      if (!inDomain(x_m, y_m, ENVELOPE.domain)) issues.error(path, "outside-domain", "測試粒子必須在 world domain 內");
      for (const source of sources) {
        if (Number.isFinite(source.x_m) && Number.isFinite(source.y_m) &&
          !atLeast(Math.hypot(x_m - source.x_m, y_m - source.y_m), ENVELOPE.initialSourceDistance_m)) {
          issues.error(path, "too-close-to-source", `測試粒子起點離來源 ${source.id} 必須至少 0.24 m`);
        }
      }
    }
    if (Number.isFinite(q_C) && !within(Math.abs(q_C), ENVELOPE.testChargeMagnitude_C.min, ENVELOPE.testChargeMagnitude_C.max)) {
      issues.error(`${path}.q_C`, "test-charge-range", "測試電量大小必須是 0.1–0.5 nC");
    }
    if (Number.isFinite(mass_kg) && !within(mass_kg, ENVELOPE.testMass_kg.min, ENVELOPE.testMass_kg.max)) {
      issues.error(`${path}.mass_kg`, "mass-range", "質量必須是 5–20 µg");
    }
    if (Number.isFinite(q_C) && Number.isFinite(mass_kg) && mass_kg > 0 &&
      !within(Math.abs(q_C) / mass_kg, ENVELOPE.chargeToMass_C_per_kg.min, ENVELOPE.chargeToMass_C_per_kg.max)) {
      issues.error(path, "charge-to-mass", "|q|/m 必須是 0.005–0.05 C/kg");
    }
    if (Number.isFinite(vx_mps) && Number.isFinite(vy_mps) &&
      !within(Math.hypot(vx_mps, vy_mps), 0, ENVELOPE.initialSpeed_mps.max)) {
      issues.error(path, "speed-range", "初速度大小必須是 0–2 m/s");
    }
  }

  if (issues.hasErrors) return { ok: false, issues: issues.items };

  const setup: ElectrostaticSetup = {
    schemaVersion: SCHEMA_VERSION,
    modelVersion: MODEL_VERSION,
    domain: { ...ENVELOPE.domain },
    sources: [...sources].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    probe,
    testParticle,
    singularity: { policy: "excluded-core", rCore_m: ENVELOPE.rCore_m },
    integrator: { kind: "velocity-verlet-bounded", dt_s: ENVELOPE.macroDt_s, maxSubsteps: ENVELOPE.maxSubsteps },
    fieldStyle: {
      Emin_N_per_C: ENVELOPE.fieldScale.Emin_N_per_C,
      Emax_N_per_C: ENVELOPE.fieldScale.Emax_N_per_C,
      gridDensity: fieldStyle && isPlainObject(fieldStyle) ? (fieldStyle.gridDensity as "standard") : "standard",
    },
    presetId: presetId as ElectrostaticSetup["presetId"],
  };
  return { ok: true, setup, warnings: issues.items };
}
