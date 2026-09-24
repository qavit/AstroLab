"use client";

import { useState } from "react";
import { LayoutGrid } from "lucide-react";
import type { ElectrostaticSetup, PresetId } from "../../models/electrostatic.ts";
import { PRESET_CATEGORIES } from "./presets.ts";
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
        {PRESET_CATEGORIES.map((category) => (
          <section key={category.id} className={styles.presetCategory} aria-labelledby={`preset-category-${category.id}`}>
            <h2 id={`preset-category-${category.id}`}>{category.label}</h2>
            <div className={styles.presetGrid}>
              {category.presets.map((preset) => (
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
          </section>
        ))}
      </div>
    </details>
  );
}
