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
}

function GatedProbePanel({ setup }: { readonly setup: ElectrostaticSetup }) {
  return (
    <section className={styles.probePanel} aria-labelledby="probe-panel-title" data-testid="probe-panel" data-probe-state="gated">
      <div className={styles.sectionHeading}>
        <p>MODEL-DERIVED EVIDENCE</p>
        <h2 id="probe-panel-title">探針讀值</h2>
      </div>
      <p className={styles.probePosition} data-testid="probe-position">
        x = {setup.probe.x_m.toFixed(3)} m　y = {setup.probe.y_m.toFixed(3)} m
      </p>
      <p className={styles.helperText} data-testid="probe-gated">先送出你的預測，才會逐步顯示探針證據。</p>
    </section>
  );
}

/**
 * Probe evidence. Gated layers are not rendered at all (no hidden DOM, no data attributes), so
 * nothing leaks to the accessibility tree before the learner commits.
 */
export default function ProbePanel({ setup, policy = SANDBOX_POLICY }: ProbePanelProps) {
  if (!policy.probeContributions) return <GatedProbePanel setup={setup} />;
  const showTotal = policy.probeTotal;
  const showComponents = policy.probeComponents;
  const readout = probeReadout(setup);
  const sourceById = new Map(setup.sources.map((source) => [source.id, source]));
  const state = !readout.valid ? "invalid-core" : !showTotal ? "contributions" : readout.isZero ? "zero" : "valid";
  return (
    <section className={styles.probePanel} aria-labelledby="probe-panel-title" data-testid="probe-panel" data-probe-state={state}>
      <div className={styles.sectionHeading}>
        <p>MODEL-DERIVED EVIDENCE</p>
        <h2 id="probe-panel-title">探針讀值</h2>
      </div>
      <p className={styles.probePosition} data-testid="probe-position">
        x = {setup.probe.x_m.toFixed(3)} m　y = {setup.probe.y_m.toFixed(3)} m
      </p>
      {!readout.valid ? (
        <div className={styles.invalidReadout} role="status" data-testid="probe-invalid">
          <strong>點電荷模型在此未定義</strong>
          <span>探針位於來源 {readout.sourceId ?? "未知"} 的 0.12 m excluded core 內；座標未被移動。</span>
        </div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.probeTable}>
              <caption>各來源對探針位置的電場貢獻</caption>
              <thead><tr>
                <th scope="col">來源</th><th scope="col">q</th>
                {showComponents ? <><th scope="col">Eₓ</th><th scope="col">Eᵧ</th></> : null}
                <th scope="col">|E|</th>
              </tr></thead>
              <tbody>
                {readout.contributions.map((item) => {
                  const source = sourceById.get(item.sourceId);
                  return (
                    <tr key={item.sourceId} data-testid={`contribution-${item.sourceId}`}>
                      <th scope="row">{item.sourceId}</th>
                      <td>{source ? formatValue(source.q_C / 1e-9, "nC") : "—"}</td>
                      {showComponents ? <><td>{formatValue(item.Ex_N_per_C)}</td><td>{formatValue(item.Ey_N_per_C)}</td></> : null}
                      <td>{formatValue(item.magnitude_N_per_C)}</td>
                    </tr>
                  );
                })}
              </tbody>
              {showTotal ? <tfoot>
                <tr data-testid="total-field-row">
                  <th scope="row">合場</th><td>—</td>
                  {showComponents ? <>
                    <td data-testid="total-ex">{formatValue(readout.Ex_N_per_C)}</td>
                    <td data-testid="total-ey">{formatValue(readout.Ey_N_per_C)}</td>
                  </> : null}
                  <td data-testid="total-magnitude">{formatValue(readout.magnitude_N_per_C)}</td>
                </tr>
              </tfoot> : null}
            </table>
          </div>
          {showComponents ? <dl className={styles.totalReadout}>
            <div><dt>單位</dt><dd>N/C</dd></div>
            <div><dt>方向</dt><dd data-testid="total-direction">{readout.direction_rad === null ? "未定義（零場）" : `${(readout.direction_rad * 180 / Math.PI).toFixed(2)}°`}</dd></div>
            <div><dt>zero tolerance</dt><dd>{formatValue(readout.zeroTolerance_N_per_C, "N/C")}</dd></div>
          </dl> : null}
        </>
      )}
    </section>
  );
}
