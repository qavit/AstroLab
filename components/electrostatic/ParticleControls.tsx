"use client";

import { useState } from "react";
import type { ElectrostaticSetup } from "../../models/electrostatic.ts";
import styles from "./ElectrostaticFieldLab.module.css";

type ParticleField = "x_m" | "y_m" | "vx_mps" | "vy_mps" | "q_nC" | "mass_ug";

interface ParticleControlsProps {
  readonly setup: ElectrostaticSetup;
  readonly onSelect: () => void;
  readonly selected: boolean;
  /** Candidate display value; NaN for an empty or unparsable entry. Validation decides. */
  readonly onEdit: (field: ParticleField, value: number) => void;
  readonly onToggleSign: () => void;
}

/** Display rounding for SI ↔ prefix conversions; the committed value is the typed number. */
function display(value: number): string {
  return String(Number(value.toPrecision(12)));
}

function NumberField(props: {
  readonly label: string;
  readonly value: number;
  readonly step: string;
  readonly min?: string;
  readonly max?: string;
  readonly testId: string;
  readonly onEdit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label>{props.label}
      <input
        type="number"
        inputMode="decimal"
        step={props.step}
        min={props.min}
        max={props.max}
        value={draft ?? display(props.value)}
        onChange={(event) => {
          setDraft(event.target.value);
          props.onEdit(event.target.value.trim() === "" ? Number.NaN : Number(event.target.value));
        }}
        onBlur={() => setDraft(null)}
        data-testid={props.testId}
      />
    </label>
  );
}

export default function ParticleControls({ setup, onSelect, selected, onEdit, onToggleSign }: ParticleControlsProps) {
  const particle = setup.testParticle;
  const positive = particle.q_C > 0;
  return (
    <fieldset className={styles.controlGroup} data-testid="particle-controls">
      <legend>測試粒子初始條件</legend>
      <p className={styles.helperText}>修改任何初始條件都會暫停並把模擬重設到 t = 0。</p>
      <div className={styles.inlineActions}>
        <button type="button" onClick={onSelect} aria-pressed={selected}>選取測試粒子</button>
        <button type="button" onClick={onToggleSign} data-testid="toggle-particle-sign">
          <span className={positive ? styles.sourceCircle : styles.sourceDiamond}>{positive ? "+" : "−"}</span>
          切換為{positive ? "負" : "正"}電荷
        </button>
      </div>
      <div className={styles.parameterGrid}>
        <NumberField label="x₀（m）" value={particle.x_m} step="0.01" min="-2" max="2" testId="particle-x" onEdit={(v) => onEdit("x_m", v)} />
        <NumberField label="y₀（m）" value={particle.y_m} step="0.01" min="-1.5" max="1.5" testId="particle-y" onEdit={(v) => onEdit("y_m", v)} />
        <NumberField label="vₓ₀（m/s）" value={particle.vx_mps} step="0.1" min="-2" max="2" testId="particle-vx" onEdit={(v) => onEdit("vx_mps", v)} />
        <NumberField label="vᵧ₀（m/s）" value={particle.vy_mps} step="0.1" min="-2" max="2" testId="particle-vy" onEdit={(v) => onEdit("vy_mps", v)} />
        <NumberField label="|q|（nC）" value={Math.abs(particle.q_C) * 1e9} step="0.05" min="0.1" max="0.5" testId="particle-charge" onEdit={(v) => onEdit("q_nC", v)} />
        <NumberField label="m（µg）" value={particle.mass_kg * 1e9} step="1" min="5" max="20" testId="particle-mass" onEdit={(v) => onEdit("mass_ug", v)} />
      </div>
      <p className={styles.helperText}>
        範圍：|q| 0.1–0.5 nC、m 5–20 µg、0.005 ≤ |q|/m ≤ 0.05 C/kg、|v₀| ≤ 2 m/s、起點離每個來源 ≥ 0.24 m。
      </p>
    </fieldset>
  );
}
