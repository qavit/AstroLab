import { Tex } from "@/components/math/MathJax";
import { particleReadout, type ElectrostaticRuntime, type ElectrostaticSetup } from "../../models/electrostatic.ts";
import { SANDBOX_POLICY, type EvidencePolicy } from "../../models/electrostatic-learning.ts";
import { formatValue } from "./ProbePanel";
import styles from "./ElectrostaticFieldLab.module.css";

interface ParticlePanelProps {
  readonly setup: ElectrostaticSetup;
  readonly runtime: ElectrostaticRuntime;
  readonly policy?: EvidencePolicy;
}

function vectorRow(name: string, symbol: string, unit: string, x: number, y: number, testId: string) {
  return (
    <tr data-testid={testId} data-x={x} data-y={y}>
      <th scope="row">{name}</th><td><Tex>{symbol}</Tex></td><td>{formatValue(Math.hypot(x, y))}</td><td>{unit}</td>
    </tr>
  );
}

export default function ParticlePanel({ setup, runtime, policy = SANDBOX_POLICY }: ParticlePanelProps) {
  const readout = particleReadout(setup, runtime);
  const anyEvidence = policy.particleField || policy.particleForce || policy.particleAcceleration;
  const { particle } = runtime;
  return (
    <section
      className={styles.readoutPanel}
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
      <h3 id="particle-panel-title">測試電荷現在怎麼動</h3>
      <dl className={styles.statusStrip}>
        <div><dt>時間</dt><dd data-testid="particle-time">{particle.t_s.toFixed(3)} s</dd></div>
        <div><dt>位置</dt><dd data-testid="particle-position">({particle.x_m.toFixed(2)}, {particle.y_m.toFixed(2)}) m</dd></div>
        <div><dt>狀態</dt><dd data-testid="particle-status">{runtime.status === "running" ? "運動中" : runtime.status === "stopped" ? "已停下" : "暫停"}</dd></div>
      </dl>
      <div className={styles.tableWrap}>
        <table className={styles.probeTable}>
          <caption>測試電荷的向量讀值</caption>
          <thead><tr><th scope="col">物理量</th><th scope="col">符號</th><th scope="col">大小</th><th scope="col">單位</th></tr></thead>
          <tbody>
            {vectorRow("速度", "|\\vec v|", "m/s", particle.vx_mps, particle.vy_mps, "particle-velocity")}
            {readout.valid && policy.particleField ? vectorRow("所在位置的電場", "|\\vec E|", "N/C", readout.field.x, readout.field.y, "particle-field") : null}
            {readout.valid && policy.particleForce ? vectorRow("受到的電力", "|\\vec F|", "N", readout.force_N.x, readout.force_N.y, "particle-force") : null}
            {readout.valid && policy.particleAcceleration ? vectorRow("加速度", "|\\vec a|", "m/s²", readout.acceleration_mps2.x, readout.acceleration_mps2.y, "particle-acceleration") : null}
          </tbody>
        </table>
      </div>
      {!anyEvidence ? <p className={styles.helperText} data-testid="particle-gated">先送出你的預測，再核對電場、力與加速度。</p> : null}
      {anyEvidence && !readout.valid ? <div className={styles.invalidReadout} data-testid="particle-readout-invalid"><strong>這裡無法計算運動</strong><span>測試電荷太靠近來源電荷；回到有效位置後再開始。</span></div> : null}
      {anyEvidence && readout.valid ? (
        <details className={styles.readoutDetails}>
          <summary>為什麼三個方向可能不同？</summary>
          <p><Tex>{"\\vec F = q\\vec E"}</Tex>：電荷為負時，力與電場反向。</p>
          <p><Tex>{"\\vec a = \\vec F / m"}</Tex>：質量越大，同一個力造成的加速度越小。</p>
          <p>分量：v = ({formatValue(particle.vx_mps)}, {formatValue(particle.vy_mps)}) m/s；E = ({formatValue(readout.field.x)}, {formatValue(readout.field.y)}) N/C。</p>
        </details>
      ) : null}
    </section>
  );
}
