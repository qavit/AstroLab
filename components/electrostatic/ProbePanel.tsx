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
}

function GatedProbePanel({ setup }: { readonly setup: ElectrostaticSetup }) {
  return (
    <section className={styles.readoutPanel} aria-labelledby="probe-panel-title" data-testid="probe-panel" data-probe-state="gated">
      <h3 id="probe-panel-title">這裡的電場</h3>
      <p className={styles.probePosition} data-testid="probe-position">x = {setup.probe.x_m.toFixed(3)} m　y = {setup.probe.y_m.toFixed(3)} m</p>
      <p className={styles.helperText} data-testid="probe-gated">先送出你的預測，再用測量結果核對想法。</p>
    </section>
  );
}

export default function ProbePanel({ setup, policy = SANDBOX_POLICY, emphasizedSourceId = null, onEmphasizeSource }: ProbePanelProps) {
  if (!policy.probeContributions) return <GatedProbePanel setup={setup} />;
  const showTotal = policy.probeTotal;
  const showComponents = policy.probeComponents;
  const readout = probeReadout(setup);
  const sourceById = new Map(setup.sources.map((source, index) => [source.id, { source, index }]));
  const state = !readout.valid ? "invalid-core" : !showTotal ? "contributions" : readout.isZero ? "zero" : "valid";
  const emphasize = onEmphasizeSource ?? (() => {});
  return (
    <section className={styles.readoutPanel} aria-labelledby="probe-panel-title" data-testid="probe-panel" data-probe-state={state}>
      <h3 id="probe-panel-title">這裡的電場</h3>
      <p className={styles.probePosition} data-testid="probe-position">x = {setup.probe.x_m.toFixed(3)} m　y = {setup.probe.y_m.toFixed(3)} m</p>
      {!readout.valid ? (
        <div className={styles.invalidReadout} role="status" data-testid="probe-invalid">
          <strong>這個位置太靠近源電荷，點電荷模型無法給出讀值。</strong>
          <span>測量點仍留在原位；把它移出灰色區域即可繼續測量。</span>
        </div>
      ) : (
        <>
          {showTotal ? (
            <div className={styles.heroReadout}>
              <span><Tex>{"|\\vec E|"}</Tex> 電場大小</span>
              <strong data-testid="total-magnitude">{formatValue(readout.magnitude_N_per_C, "N/C")}</strong>
              <small data-testid="total-direction">{readout.direction_rad === null ? "合電場為零，因此沒有方向" : `方向 ${(readout.direction_rad * 180 / Math.PI).toFixed(1)}°`}</small>
            </div>
          ) : <p className={styles.helperText}>先比較每顆源電荷造成的電場；下一步才會顯示合電場。</p>}
          {/* One advanced disclosure: per-source contributions and the resultant's x/y components
              are the same layer of detail, so they no longer compete as separate summaries. */}
          <details className={styles.readoutDetails}>
            <summary>看電場是怎麼由各來源相加而成</summary>
            <div className={styles.tableWrap}>
              <table className={styles.probeTable}>
                <caption>各源電荷對測量點的電場貢獻</caption>
                <thead><tr><th scope="col">來源</th><th scope="col">電量</th>{showComponents ? <><th scope="col">Eₓ</th><th scope="col">Eᵧ</th></> : null}<th scope="col">大小</th></tr></thead>
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
                        <td>{record ? formatValue(record.source.q_C / 1e-9, "nC") : "—"}</td>
                        {showComponents ? <><td>{formatValue(item.Ex_N_per_C)}</td><td>{formatValue(item.Ey_N_per_C)}</td></> : null}
                        <td>{formatValue(item.magnitude_N_per_C, "N/C")}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {showTotal ? <tfoot><tr data-testid="total-field-row"><th scope="row">合電場</th><td>—</td>{showComponents ? <><td data-testid="total-ex">{formatValue(readout.Ex_N_per_C)}</td><td data-testid="total-ey">{formatValue(readout.Ey_N_per_C)}</td></> : null}<td>{formatValue(readout.magnitude_N_per_C, "N/C")}</td></tr></tfoot> : null}
              </table>
            </div>
            {showComponents ? <p><Tex dynamic>{`\\vec E = (${formatValue(readout.Ex_N_per_C)},\\ ${formatValue(readout.Ey_N_per_C)})\\ \\mathrm{N/C}`}</Tex></p> : null}
          </details>
        </>
      )}
    </section>
  );
}
