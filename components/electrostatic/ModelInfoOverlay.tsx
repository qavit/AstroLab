"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import TheoryNotes from "./TheoryNotes";

/**
 * Reuses the Projectile lab's theory-overlay grammar (global `theory-*` classes in
 * app/globals.css): same centred modal, same Escape/backdrop/focus behaviour, same page-scroll
 * lock. The content is the shared TheoryNotes, also served at `/electrostatics/notes`.
 */
export default function ModelInfoOverlay({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  /* Modal contract: focus moves into the dialog, Tab is contained, Escape closes, and focus
   * returns to the button that opened it. */
  useEffect(() => {
    const invoker = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onCloseRef.current(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])',
      )).filter((element) => !element.hasAttribute("disabled") && element.getClientRects().length > 0);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!panelRef.current.contains(active)) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      invoker?.focus();
    };
  }, []);

  return (
    <div className="theory-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        className="theory-panel"
        role="dialog"
        aria-modal="true"
        aria-label="靜電場的理論、模型與計算"
        onClick={(event) => event.stopPropagation()}
      >
        <button ref={closeRef} className="theory-close" onClick={onClose} aria-label="關閉"><X size={16} /></button>
        <div className="theory-scroll"><TheoryNotes /></div>
      </div>
    </div>
  );
}
