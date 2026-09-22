"use client";

import type { ElectrostaticSetup } from "../../models/electrostatic.ts";
import CommittedNumberField from "./CommittedNumberField";
import styles from "./ElectrostaticFieldLab.module.css";

export type ParticleField = "x_m" | "y_m" | "vx_mps" | "vy_mps" | "q_nC" | "mass_ug";

interface ParticleControlsProps {
  readonly setup: ElectrostaticSetup;
  readonly onEdit: (field: ParticleField, value: number) => boolean;
  readonly onToggleSign: () => void;
}

export default function ParticleControls({ setup, onEdit, onToggleSign }: ParticleControlsProps) {
  const particle = setup.testParticle;
  const positive = particle.q_C > 0;
  return (
    <fieldset className={styles.controlGroup} data-testid="particle-controls">
      <legend>初始條件</legend>
      <p className={styles.helperText}>改變初始條件會回到 t = 0；移動測量點不會重設運動。</p>
      <button type="button" onClick={onToggleSign} data-testid="toggle-particle-sign">
        <span className={positive ? styles.sourceCircle : styles.sourceDiamond}>{positive ? "+" : "−"}</span>
        改成{positive ? "負" : "正"}測試電荷
      </button>
      <details className={styles.precisionDisclosure}>
        <summary>精確位置與速度</summary>
        <div className={styles.parameterGrid}>
          <CommittedNumberField label="水平位置 x₀（m）" value={particle.x_m} step="0.01" min="-2" max="2" testId="particle-x" onCommit={(v) => onEdit("x_m", v)} />
          <CommittedNumberField label="垂直位置 y₀（m）" value={particle.y_m} step="0.01" min="-1.5" max="1.5" testId="particle-y" onCommit={(v) => onEdit("y_m", v)} />
          <CommittedNumberField label="水平初速度 vₓ₀（m/s）" value={particle.vx_mps} step="0.1" min="-2" max="2" testId="particle-vx" onCommit={(v) => onEdit("vx_mps", v)} />
          <CommittedNumberField label="垂直初速度 vᵧ₀（m/s）" value={particle.vy_mps} step="0.1" min="-2" max="2" testId="particle-vy" onCommit={(v) => onEdit("vy_mps", v)} />
        </div>
      </details>
      <div className={styles.parameterGrid}>
        <CommittedNumberField label="電量大小（nC）" value={Math.abs(particle.q_C) * 1e9} step="0.05" min="0.1" max="0.5" testId="particle-charge" onCommit={(v) => onEdit("q_nC", v)} />
        <CommittedNumberField label="質量（µg）" value={particle.mass_kg * 1e9} step="1" min="5" max="20" testId="particle-mass" onCommit={(v) => onEdit("mass_ug", v)} />
      </div>
    </fieldset>
  );
}
