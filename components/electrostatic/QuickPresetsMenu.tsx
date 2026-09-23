"use client";

import { useState } from "react";
import { LayoutGrid } from "lucide-react";
import type { ElectrostaticSetup, PresetId } from "../../models/electrostatic.ts";
import { PRESETS } from "./presets.ts";
import styles from "./ElectrostaticFieldLab.module.css";

interface QuickPresetsMenuProps {
  readonly setup: ElectrostaticSetup;
  readonly onPreset: (preset: PresetId) => void;
}

export default function QuickPresetsMenu(props: QuickPresetsMenuProps) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className={styles.presetPopoverWrap}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      data-testid="quick-presets-menu"
    >
      <summary className={styles.catalogLink}>
        <LayoutGrid size={16} aria-hidden="true" />快速配置
      </summary>
      <div className={styles.presetPopover} role="group" aria-label="快速配置">
        <div className={styles.presetGrid}>
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={props.setup.presetId === preset.id ? styles.activeButton : undefined}
              aria-pressed={props.setup.presetId === preset.id}
              data-testid={`preset-${preset.id}`}
              onClick={() => {
                props.onPreset(preset.id);
                setOpen(false);
              }}
            ><strong>{preset.label}</strong><small>{preset.hint}</small></button>
          ))}
        </div>
      </div>
    </details>
  );
}
