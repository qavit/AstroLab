"use client";

import { useId, useState } from "react";
import styles from "./ElectrostaticFieldLab.module.css";

/** Match the editable display precision to the control's explicit step, not floating-point noise. */
function display(value: number, step: string): string {
  const fractional = step.split(".")[1];
  const decimals = fractional?.length ?? 0;
  return String(Number(value.toFixed(decimals)));
}

interface CommittedNumberFieldProps {
  readonly label: string;
  readonly value: number;
  readonly step: string;
  readonly min?: string;
  readonly max?: string;
  /** Render a compact learner-facing unit beside the editable numeric value. */
  readonly unit?: string;
  readonly testId: string;
  /** Returns true only when the canonical model accepts the candidate. */
  readonly onCommit: (value: number) => boolean;
}

/**
 * Numeric inputs have two edit paths. A deliberate step (ArrowUp/ArrowDown, or the native spinner)
 * commits to the canonical model immediately, so the visible number and the physics never disagree.
 * Typed text is a local draft (an empty or intermediate value is never an error while editing);
 * Enter/blur validates it. Rejected text stays visible beside its local error; Escape restores
 * the last physical value.
 */
export default function CommittedNumberField(props: CommittedNumberFieldProps) {
  const errorId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const commitText = (text: string) => {
    const value = text.trim() === "" ? Number.NaN : Number(text);
    if (!Number.isFinite(value) || !props.onCommit(value)) {
      setError("這個數值無法使用；模型仍保留上一個有效值。按 Escape 還原顯示。");
      return;
    }
    setDraft(null);
    setError(null);
  };

  const commit = () => {
    if (draft !== null) commitText(draft);
  };

  /** Step from what the learner currently sees, clamped like a native stepper, then commit at once. */
  const stepBy = (direction: 1 | -1, from: string) => {
    const shown = from.trim() === "" ? Number.NaN : Number(from);
    const base = Number.isFinite(shown) ? shown : props.value;
    const decimals = props.step.split(".")[1]?.length ?? 0;
    let next = Number((base + direction * Number(props.step)).toFixed(decimals));
    if (props.min !== undefined) next = Math.max(next, Number(props.min));
    if (props.max !== undefined) next = Math.min(next, Number(props.max));
    if (props.onCommit(next)) {
      setDraft(display(next, props.step));
      setError(null);
    } else {
      setDraft(display(next, props.step));
      setError("這個數值無法使用；模型仍保留上一個有效值。按 Escape 還原顯示。");
    }
  };

  return (
    <label className={styles.numberField}>
      <span className={styles.numberFieldLabel}>{props.label}</span>
      <span className={styles.numberInputWithUnit}>
        <input
          type="number"
          inputMode="decimal"
          step={props.step}
          min={props.min}
          max={props.max}
        value={draft ?? display(props.value, props.step)}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? errorId : undefined}
          onFocus={() => {
            // Browser number fields do not consistently send beforeinput for deletion. Treat the
            // whole focused edit as a draft so an empty/intermediate value is never submitted.
            if (draft === null) setDraft(display(props.value, props.step));
          }}
          onChange={(event) => {
            const text = event.target.value;
            setDraft(text);
            setError(null);
            // Typing always arrives as an InputEvent with an inputType; the native spinner's
            // step arrives without one. That is a deliberate step, so commit it live.
            const native = event.nativeEvent as Partial<InputEvent>;
            const typed = typeof native.inputType === "string" && native.inputType !== "";
            const value = text.trim() === "" ? Number.NaN : Number(text);
            if (!typed && Number.isFinite(value) && props.onCommit(value)) setDraft(text);
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              stepBy(event.key === "ArrowUp" ? 1 : -1, event.currentTarget.value);
            }
            if (event.key === "Enter") { event.preventDefault(); commit(); }
            if (event.key === "Escape") { event.preventDefault(); setDraft(null); setError(null); }
          }}
          data-testid={props.testId}
        />
        {props.unit ? <span className={styles.numberUnit}>{props.unit}</span> : null}
      </span>
      {error ? <span id={errorId} className={styles.fieldError} role="alert">{error}</span> : null}
    </label>
  );
}
