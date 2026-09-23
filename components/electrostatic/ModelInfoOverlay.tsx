"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import FieldLegend from "./FieldLegend";
import styles from "./ElectrostaticFieldLab.module.css";
import { Tex } from "../math/MathJax";

/**
 * Reuses the Projectile lab's theory-overlay grammar (global `theory-*` classes in
 * app/globals.css) rather than inventing a new dialog pattern: same centred modal,
 * same Escape/backdrop/focus behaviour, same page-scroll lock.
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
        aria-label="這個模型畫的是什麼？"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="theory-close" onClick={onClose} aria-label="關閉"><X size={16} /></button>
        <div className={`theory-scroll ${styles.modelNotesGrid}`}>
          <div>
            <h2>點電荷模型</h2>
            <p>每顆源電荷固定不動；畫面顯示它們在平面上造成的三維反平方電場。測試電荷不會改變來源。</p>
            <p><Tex>{"\\vec E = \\sum_i \\vec E_i"}</Tex>，箭頭相加後得到合電場。灰色核心內不使用點電荷近似。</p>
          </div>
          <FieldLegend />
        </div>
      </div>
    </div>
  );
}
