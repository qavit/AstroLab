"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import TheoryNotes from "./TheoryNotes";

/**
 * Reuses the Projectile lab's theory-overlay grammar (global `theory-*` classes in
 * app/globals.css): same centred modal, same Escape/backdrop/focus behaviour, same page-scroll
 * lock. The content is the shared TheoryNotes, also served at `/electrostatics/notes`.
 */
export default function ModelInfoOverlay({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div className="theory-backdrop" onClick={onClose}>
      <div
        className="theory-panel"
        role="dialog"
        aria-modal="true"
        aria-label="靜電場的理論、模型與計算"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="theory-close" onClick={onClose} aria-label="關閉"><X size={16} /></button>
        <div className="theory-scroll"><TheoryNotes /></div>
      </div>
    </div>
  );
}
