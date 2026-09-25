"use client";

import { useId, useState } from "react";
import styles from "./ElectrostaticFieldLab.module.css";

function display(value: number): string {
  return String(Number(value.toPrecision(12)));
}

interface CommittedNumberFieldProps {
  readonly label: string;
  readonly value: number;
  readonly step: string;
  readonly min?: string;
  readonly max?: string;
  readonly testId: string;
  /** Returns true only when the canonical model accepts the candidate. */
  readonly onCommit: (value: number) => boolean;
}

/**
 * Numeric inputs are a two-phase editor: every focused edit is local, Enter/blur is the commit boundary.
 * Rejected text stays visible beside its local error; Escape restores the last physical value.
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

  return (
    <label className={styles.numberField}>{props.label}
      <input
        type="number"
        inputMode="decimal"
        step={props.step}
        min={props.min}
        max={props.max}
        value={draft ?? display(props.value)}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? errorId : undefined}
        onFocus={() => {
          // Browser number fields do not consistently send beforeinput for deletion. Treat the
          // whole focused edit as a draft so an empty/intermediate value is never submitted.
          if (draft === null) setDraft(display(props.value));
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") { event.preventDefault(); commit(); }
          if (event.key === "Escape") { event.preventDefault(); setDraft(null); setError(null); }
        }}
        data-testid={props.testId}
      />
      {error ? <span id={errorId} className={styles.fieldError} role="alert">{error}</span> : null}
    </label>
  );
}
