import styles from "./ElectrostaticFieldLab.module.css";

/** Compact Canvas-local legend: the map is presentation-only, but its quantity stays explicit. */
export default function FieldStrengthMapLegend() {
  return (
    <section className={styles.fieldStrengthMapLegend} aria-label="場強色圖圖例" data-testid="field-strength-map-legend">
      <strong>場強色圖｜|E|（N/C）</strong>
      <div className={styles.fieldStrengthGradient} aria-hidden="true" />
      <div className={styles.fieldStrengthMarks}><span>1</span><span>10</span><span>100</span><span>1000</span><span>5000</span></div>
      <small>非線性顯示尺度；5000 N/C 以上使用相同最強色。實際測量值不會截斷。</small>
    </section>
  );
}
