import styles from "./ElectrostaticFieldLab.module.css";

export default function FieldLegend() {
  return (
    <section className={styles.legend} aria-labelledby="field-legend-title" data-testid="field-legend">
      <div className={styles.sectionHeading}>
        <p>畫面圖例</p>
        <h2 id="field-legend-title">怎麼看箭頭</h2>
      </div>
      <p className={styles.legendScale}>方向看箭頭；長度與明暗用同一套尺度表示強弱。測量數值不會被截斷。</p>
      <ul className={styles.legendList}>
        <li><span className={`${styles.legendGlyph} ${styles.zeroGlyph}`} aria-hidden="true">＋</span><span><strong>零場／近零場</strong><small>方向未定義</small></span></li>
        <li><span className={`${styles.legendGlyph} ${styles.lowGlyph}`} aria-hidden="true">⇢</span><span><strong>很弱的電場</strong><small>用空心虛線箭頭提醒</small></span></li>
        <li><span className={`${styles.legendGlyph} ${styles.normalGlyph}`} aria-hidden="true">→</span><span><strong>可比較的範圍</strong><small>越長、越深代表越強</small></span></li>
        <li><span className={`${styles.legendGlyph} ${styles.highGlyph}`} aria-hidden="true">⊣</span><span><strong>非常強的電場</strong><small>箭頭尾端加上封頂記號</small></span></li>
        <li><span className={`${styles.legendGlyph} ${styles.coreGlyph}`} aria-hidden="true" /><span><strong>灰色核心</strong><small>太靠近來源，不使用點電荷模型</small></span></li>
      </ul>
      <p className={styles.chargeLegend}><span className={styles.positiveMark}>＋</span> 正電荷為圓形　<span className={styles.negativeMark}>−</span> 負電荷為菱形</p>
    </section>
  );
}
