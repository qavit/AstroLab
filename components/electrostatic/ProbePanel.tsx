import type { ReactNode } from "react";
import { Tex } from "@/components/math/MathJax";
import { probeReadout, type ElectrostaticSetup } from "../../models/electrostatic.ts";
import { SANDBOX_POLICY, type EvidencePolicy } from "../../models/electrostatic-learning.ts";
import styles from "./ElectrostaticFieldLab.module.css";

export function formatValue(value: number, unit = ""): string {
  if (value === 0) return `0${unit ? ` ${unit}` : ""}`;
  const absolute = Math.abs(value);
  const text = absolute >= 1e4 || absolute < 1e-2 ? value.toExponential(3) : value.toPrecision(4);
  return `${text}${unit ? ` ${unit}` : ""}`;
}

interface ProbePanelProps {
  readonly setup: ElectrostaticSetup;
  readonly policy?: EvidencePolicy;
  /** Transient Canvas<->row linkage only; never selection, physics or history. */
  readonly emphasizedSourceId?: string | null;
  readonly onEmphasizeSource?: (id: string | null) => void;
  /** Guided: this readout is the current observation target. */
  readonly focused?: boolean;
  /** Guided B manipulation shows |E| in the task card, so the detailed table is secondary here. */
  readonly secondary?: boolean;
  /** How per-source components are offered: a disclosure (free exploration), always visible
   * (guided step that reasons from them) or not at all (guided steps that do not need them). */
  readonly detail?: "disclosure" | "inline" | "hidden";
}

function GatedProbePanel() {
  return (
    <section className={`${styles.readoutPanel} ${styles.probeReadoutPanel}`} aria-label="電場讀值" data-testid="probe-panel" data-probe-state="gated">
      <p className={styles.helperText} data-testid="probe-gated">先送出你的預測，再用測量結果核對想法。</p>
    </section>
  );
}

/** Free exploration keeps the components behind a disclosure; a guided step that reasons from
 * them shows them directly so the learner never has to open an unexplained door. */
function Wrapper({ inline, children }: { readonly inline: boolean; readonly children: ReactNode }) {
  if (inline) return <div className={styles.readoutInline} data-testid="component-evidence">{children}</div>;
  return (
    <details className={styles.readoutDetails}>
      <summary>各來源分量</summary>
      {children}
    </details>
  );
}

export default function ProbePanel({ setup, policy = SANDBOX_POLICY, emphasizedSourceId = null, onEmphasizeSource, focused = false, secondary = false, detail = "disclosure" }: ProbePanelProps) {
  if (!policy.probeContributions) return <GatedProbePanel />;
  const showTotal = policy.probeTotal;
  const showComponents = policy.probeComponents;
  const readout = probeReadout(setup);
  const sourceById = new Map(setup.sources.map((source, index) => [source.id, { source, index }]));
  const state = !readout.valid ? "invalid-core" : !showTotal ? "contributions" : readout.isZero ? "zero" : "valid";
  const emphasize = onEmphasizeSource ?? (() => {});
  return (
    <section className={`${styles.readoutPanel} ${styles.probeReadoutPanel} ${focused ? styles.focusedPanel : ""}`} aria-label="電場讀值" data-testid="probe-panel" data-probe-state={state} data-focus={focused ? "true" : "false"}>
      {focused ? <span className={styles.focusBadge}>現在看這裡</span> : null}
      {!readout.valid ? (
        <div className={styles.invalidReadout} role="status" data-testid="probe-invalid">
          <strong>這個位置太靠近源電荷，點電荷模型無法給出讀值。</strong>
          <span>測量點仍留在原位；把它移出灰色區域即可繼續測量。</span>
        </div>
      ) : (
        <>
          {showTotal && !secondary ? (
            <div className={styles.probeReadout}>
              <div className={styles.probeReadoutMagnitude}>
                <span className={styles.probeReadoutTitle}>電場</span>
                <div className={styles.probeEquation} data-testid="total-magnitude">
                  <Tex dynamic className={styles.probeEquationFormula}>{"|\\vec{E}| ="}</Tex>
                  <strong>{formatValue(readout.magnitude_N_per_C)}</strong>
                  <span>N/C</span>
                </div>
              </div>
              <div className={styles.probeReadoutDirection} data-testid="total-direction">
                <span>方向</span>
                <strong>{readout.direction_rad === null ? "未定義（合電場為零）" : `${(readout.direction_rad * 180 / Math.PI).toFixed(1)}°`}</strong>
              </div>
            </div>
          ) : !showTotal ? <p className={styles.helperText}>先比較每顆源電荷造成的電場；下一步才會顯示合電場。</p> : null}
          {detail === "hidden" ? null : <Wrapper inline={detail === "inline"}>
            <div className={styles.tableWrap}>
              <table className={styles.probeTable}>
                <caption>各來源分量</caption>
                <thead><tr><th scope="col">來源</th>{showComponents ? <><th scope="col">Eₓ</th><th scope="col">Eᵧ</th></> : null}<th scope="col">|E|</th></tr></thead>
                <tbody>
                  {readout.contributions.map((item) => {
                    const record = sourceById.get(item.sourceId);
                    return (
                      <tr
                        key={item.sourceId}
                        data-testid={`contribution-${item.sourceId}`}
                        data-emphasized={emphasizedSourceId === item.sourceId ? "true" : "false"}
                        className={emphasizedSourceId === item.sourceId ? styles.contributionRowEmphasized : undefined}
                        tabIndex={0}
                        onMouseEnter={() => emphasize(item.sourceId)}
                        onMouseLeave={() => emphasize(null)}
                        onFocus={() => emphasize(item.sourceId)}
                        onBlur={() => emphasize(null)}
                      >
                        <th scope="row">{record ? `${record.source.q_C > 0 ? "正" : "負"}電荷 ${record.index + 1}` : "來源"}</th>
                        {showComponents ? <><td>{formatValue(item.Ex_N_per_C)}</td><td>{formatValue(item.Ey_N_per_C)}</td></> : null}
                        <td>{formatValue(item.magnitude_N_per_C, "N/C")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Wrapper>}
        </>
      )}
    </section>
  );
}
