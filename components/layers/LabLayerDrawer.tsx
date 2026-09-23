"use client";

import { useEffect, useRef } from "react";
import { Layers3, X } from "lucide-react";
import type { ReactNode } from "react";

interface LabLayerDrawerProps {
  readonly open: boolean;
  readonly title?: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/** Shared presentation only: each lab keeps its layer names and state locally. */
export function LabLayerDrawer({ open, title = "視圖圖層", onClose, children }: LabLayerDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open, onClose]);

  return (
    <aside className={`layer-drawer ${open ? "open" : ""}`} aria-hidden={!open} aria-label={title} role="dialog" aria-modal="true">
      <header>
        <div><Layers3 size={18} aria-hidden="true" /><strong>{title}</strong></div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="關閉圖層" title="關閉圖層"><X size={17} aria-hidden="true" /></button>
      </header>
      <div className="drawer-scroll">{children}</div>
    </aside>
  );
}

export function LayerGroup({ title, children, open = true }: { readonly title: string; readonly children: ReactNode; readonly open?: boolean }) {
  return <details open={open}><summary>{title}</summary>{children}</details>;
}

export function LayerToggle({ checked, label, onChange, disabled = false, testId }: {
  readonly checked: boolean;
  readonly label: string;
  readonly onChange: () => void;
  readonly disabled?: boolean;
  readonly testId?: string;
}) {
  return <label><input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} data-testid={testId} />{label}</label>;
}
