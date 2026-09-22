import { particleReadout, type ElectrostaticRuntime, type ElectrostaticSetup } from "../../models/electrostatic.ts";
import { formatValue } from "./ProbePanel";
import styles from "./ElectrostaticFieldLab.module.css";

interface ParticlePanelProps {
  readonly setup: ElectrostaticSetup;
  readonly runtime: ElectrostaticRuntime;
}

function vectorRow(label: string, unit: string, x: number, y: number, testId: string) {
  return (
    <tr data-testid={testId} data-x={x} data-y={y}>
      <th scope="row">{label}</th>
      <td>{formatValue(x)}</td>
      <td>{formatValue(y)}</td>
      <td>{formatValue(Math.hypot(x, y))}</td>
      <td>{unit}</td>
    </tr>
  );
}

const INVALID_TEXT: Record<string, string> = {
  "inside-source-core": "粒子位於來源 excluded core 邊界上；點電荷模型在此未定義，不顯示 E／F／a。",
  "non-finite-input": "粒子狀態不是有限值；不顯示 E／F／a。",
  "no-sources": "沒有來源電荷；不顯示 E／F／a。",
};

export default function ParticlePanel({ setup, runtime }: ParticlePanelProps) {
  const readout = particleReadout(setup, runtime);
  const { particle } = runtime;
  return (
    <section
      className={styles.probePanel}
      aria-labelledby="particle-panel-title"
      data-testid="particle-panel"
      data-t-s={particle.t_s}
      data-x-m={particle.x_m}
      data-y-m={particle.y_m}
      data-vx-mps={particle.vx_mps}
      data-vy-mps={particle.vy_mps}
      data-macro-steps={runtime.macroSteps}
      data-clock-status={runtime.status}
    >
      <div className={styles.sectionHeading}>
        <p>MODEL-DERIVED PARTICLE EVIDENCE</p>
        <h2 id="particle-panel-title">測試粒子讀值</h2>
      </div>
      <dl className={styles.totalReadout}>
        <div><dt>t</dt><dd data-testid="particle-time">{particle.t_s.toFixed(4)} s</dd></div>
        <div><dt>位置</dt><dd data-testid="particle-position">x = {particle.x_m.toFixed(3)} m　y = {particle.y_m.toFixed(3)} m</dd></div>
        <div><dt>狀態</dt><dd data-testid="particle-status">{runtime.status === "running" ? "播放中" : runtime.status === "stopped" ? "已停止" : "暫停"}</dd></div>
      </dl>
      <div className={styles.tableWrap}>
        <table className={styles.probeTable}>
          <caption>目前位置的速度、電場、力與加速度（皆由模型計算）</caption>
          <thead><tr><th scope="col">量</th><th scope="col">x</th><th scope="col">y</th><th scope="col">大小</th><th scope="col">單位</th></tr></thead>
          <tbody>
            {vectorRow("v", "m/s", particle.vx_mps, particle.vy_mps, "particle-velocity")}
            {readout.valid ? (
              <>
                {vectorRow("E", "N/C", readout.field.x, readout.field.y, "particle-field")}
                {vectorRow("F", "N", readout.force_N.x, readout.force_N.y, "particle-force")}
                {vectorRow("a", "m/s²", readout.acceleration_mps2.x, readout.acceleration_mps2.y, "particle-acceleration")}
              </>
            ) : null}
          </tbody>
        </table>
      </div>
      {!readout.valid ? (
        <div className={styles.invalidReadout} data-testid="particle-readout-invalid">
          <strong>E／F／a 未定義</strong>
          <span>{INVALID_TEXT[readout.reason] ?? "模型在此位置未定義。"}</span>
        </div>
      ) : null}
    </section>
  );
}
