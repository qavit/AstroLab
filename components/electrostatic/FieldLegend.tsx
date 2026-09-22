import styles from "./ElectrostaticFieldLab.module.css";

export default function FieldLegend() {
  return (
    <section className={styles.legend} aria-labelledby="field-legend-title" data-testid="field-legend">
      <div className={styles.sectionHeading}>
        <p>FIELD SCALE</p>
        <h2 id="field-legend-title">場強圖例</h2>
      </div>
      <p className={styles.legendScale}>固定對數尺度：1–5,000 N/C；探針數值不截斷。</p>
      <ul className={styles.legendList}>
        <li><span className={`${styles.legendGlyph} ${styles.zeroGlyph}`} aria-hidden="true">＋</span><span><strong>零場／近零場</strong><small>方向未定義</small></span></li>
        <li><span className={`${styles.legendGlyph} ${styles.lowGlyph}`} aria-hidden="true">⇢</span><span><strong>低截斷</strong><small>&lt; 1 N/C，空心虛線箭頭</small></span></li>
        <li><span className={`${styles.legendGlyph} ${styles.normalGlyph}`} aria-hidden="true">→</span><span><strong>正常尺度</strong><small>長度與明度共同編碼</small></span></li>
        <li><span className={`${styles.legendGlyph} ${styles.highGlyph}`} aria-hidden="true">⊣</span><span><strong>高截斷</strong><small>&gt; 5,000 N/C，封頂箭頭</small></span></li>
        <li><span className={`${styles.legendGlyph} ${styles.coreGlyph}`} aria-hidden="true" /><span><strong>Excluded core</strong><small>點電荷模型未定義</small></span></li>
      </ul>
      <p className={styles.chargeLegend}><span className={styles.positiveMark}>＋</span> 正電荷為圓形　<span className={styles.negativeMark}>−</span> 負電荷為菱形</p>
    </section>
  );
}
