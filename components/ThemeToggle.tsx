"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import type { Locale } from "@/lib/i18n";
import { applyTheme, readStoredTheme, subscribeTheme } from "@/lib/theme";

const copy = {
  "zh-TW": { label: "外觀", light: "亮色", dark: "暗色", system: "跟隨系統" },
  en: { label: "Appearance", light: "Light", dark: "Dark", system: "System" },
} as const;

const icons = { light: Sun, dark: Moon, system: Monitor } as const;

export default function ThemeToggle({ locale = "zh-TW" }: { locale?: Locale }) {
  const text = copy[locale];
  // The pre-paint script already applied the stored choice to <html>; the store only drives which
  // button reads as pressed, so the server render assumes "system" and the client corrects it.
  const mode = useSyncExternalStore(subscribeTheme, readStoredTheme, () => "system" as const);

  return (
    <div className="theme-switcher" role="group" aria-label={text.label}>
      {(["light", "dark", "system"] as const).map((target) => {
        const Icon = icons[target];
        return (
          <button
            key={target}
            type="button"
            title={text[target]}
            aria-label={text[target]}
            aria-pressed={mode === target}
            onClick={() => applyTheme(target)}
          >
            <Icon size={14} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
