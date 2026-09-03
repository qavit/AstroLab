import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "拋體運動：理論與計算｜AstroLab",
  description: "拋體運動模型使用的公式、它們的成立條件，以及空氣阻力為何必須改用數值積分。",
};

export default function ProjectileNotesPage() {
  return (
    <main className="about-page">
      <nav><Link href="/projectile">← 返回模型</Link></nav>
      <article>
        <div className="eyebrow">AstroLab · Model 07 notes</div>
        <h1>拋體運動的理論與計算</h1>
        <p>
          這個模型只有一句核心主張：<strong>水平方向與垂直方向互不影響</strong>。水平沒有力，所以等速；垂直只有重力，所以等加速。
          兩者共用同一個時間 <var>t</var>，卻各自獨立地演化。模型裡的每一條曲線、每一個數字，都是這句話的直接後果。
        </p>
        <p>
          因為兩個方向可以分開解，真空情況下的答案都寫得出封閉形式。畫面上的軌跡不是一步一步算出來的，而是把時間代進式子求值得到的。
          唯一的例外是空氣阻力，理由寫在最後一節。
        </p>

        <h2>符號</h2>
        <table>
          <thead><tr><th>符號</th><th>意義</th><th>單位</th></tr></thead>
          <tbody>
            <tr><td><var>v₀</var></td><td>發射速率</td><td>m/s</td></tr>
            <tr><td><var>θ</var></td><td>發射角，自水平面起算</td><td>度</td></tr>
            <tr><td><var>h</var></td><td>發射點相對落地面的高度</td><td>m</td></tr>
            <tr><td><var>g</var></td><td>重力加速度（地表 9.80665）</td><td>m/s²</td></tr>
            <tr><td><var>vₓ</var>, <var>v<sub>y</sub></var></td><td>速度的水平、垂直分量</td><td>m/s</td></tr>
          </tbody>
        </table>

        <h2>基本運動方程</h2>
        <p className="formula">vₓ = v₀ cos θ　（不隨時間改變）</p>
        <p className="formula">v<sub>y</sub>(t) = v₀ sin θ − g t</p>
        <p className="formula">x(t) = vₓ t</p>
        <p className="formula">y(t) = h + v₀ sin θ · t − ½ g t²</p>
        <p>
          模型的分量圖就是這四條式子的圖像：<var>x</var>–<var>t</var> 必然是直線，<var>y</var>–<var>t</var> 必然是二次曲線，
          <var>vₓ</var>–<var>t</var> 是水平線，<var>v<sub>y</sub></var>–<var>t</var> 是斜率恆為 −<var>g</var> 的直線。若在畫面上看到別的形狀，就表示假設被破壞了（例如加入了空氣阻力）。
        </p>

        <h2>飛行時間、射程與最高點</h2>
        <p>落地即 <var>y</var> = 0，解 ½<var>g</var><var>t</var>² − <var>v₀</var> sin θ · <var>t</var> − <var>h</var> = 0 取正根：</p>
        <p className="formula">t<sub>f</sub> = ( v₀ sin θ + √( v₀² sin²θ + 2gh ) ) / g</p>
        <p className="formula">R = v₀ cos θ · t<sub>f</sub></p>
        <p>最高點發生在 <var>v<sub>y</sub></var> = 0 的時刻：</p>
        <p className="formula">t<sub>apex</sub> = v₀ sin θ / g　,　y<sub>max</sub> = h + v₀² sin²θ / (2g)</p>
        <p>
          當 <var>h</var> = 0 時射程化簡為 <span className="formula-inline">R = v₀² sin 2θ / g</span>。這個形式讓兩件事一眼可見：
          <var>R</var> 與 <var>v₀</var>² 成正比、與 <var>g</var> 成反比（所以月球上同樣的一拋會遠約六倍），而且 sin 2θ 在 θ = 45° 取最大。
        </p>

        <h2>最佳發射角：45° 只是特例</h2>
        <p>對一般的發射高度，使射程最大的角度為</p>
        <p className="formula">sin θ<sup>*</sup> = 1 / √( 2 + 2gh / v₀² )　,　R<sub>max</sub> = ( v₀ / g ) √( v₀² + 2gh )</p>
        <p>
          <var>h</var> = 0 時 sin θ<sup>*</sup> = 1/√2，也就是 45°。但只要發射點高於落地面，最佳角就會<strong>小於</strong> 45°：
          額外的高度已經免費提供了滯空時間，因此把速度多分配給水平方向更划算。模型的讀數列永遠顯示由上式算出的角度，不會固定寫 45°。
        </p>

        <h2>互補角：等射程的條件</h2>
        <p>
          由 <span className="formula-inline">R = v₀² sin 2θ / g</span>，因為 sin 2θ = sin(180° − 2θ)，所以 θ 與 90° − θ 射程相同。
          兩者的滯空時間卻不同，比值為 tan θ：高角度的那一顆晚很多才落地。模型讓兩顆球<strong>同時發射</strong>，就是為了讓這個差別看得見。
        </p>
        <p>
          這個配對<strong>只在 h = 0 時成立</strong>。發射點一旦抬高，兩個角度的射程就會分開，模型會分別報出兩個數字，而不是假裝它們相等。
        </p>

        <h2>安全拋物線（可及邊界）</h2>
        <p>固定速率 <var>v₀</var>、掃過所有發射角，得到的軌跡族有一條外包絡線：</p>
        <p className="formula">y = h + v₀² / (2g) − g x² / (2 v₀²)</p>
        <p>
          它本身也是一條拋物線。邊界以內的每一點，都存在（通常是兩個）發射角打得到；邊界以外則無論怎麼瞄都打不到。
          要打中位於 (<var>x</var>, <var>y</var>) 的目標，發射角滿足
        </p>
        <p className="formula">tan θ = ( v₀² ± √( v₀⁴ − g( g x² + 2 y v₀² ) ) ) / ( g x )</p>
        <p>根號內為負，就代表目標落在安全拋物線之外。兩個解分別對應低伸彈道與高吊彈道。</p>

        <h2>加速度的切向與法向分量</h2>
        <p>
          重力大小方向都不變，但它<strong>對運動所起的作用</strong>一直在變。把 <span className="formula-inline">a = (0, −g)</span> 沿速度方向與其垂直方向分解：
        </p>
        <p className="formula">a∥ = − g v<sub>y</sub> / v　（改變速率）</p>
        <p className="formula">a⊥ = g |vₓ| / v　（改變方向）</p>
        <p className="formula">a∥² + a⊥² = g²　（恆成立）</p>
        <p>
          上升時 a∥ &lt; 0（減速），下降時 a∥ &gt; 0（加速），最高點 a∥ = 0，此時重力全部用來轉彎。軌跡的曲率與曲率半徑為
        </p>
        <p className="formula">κ = a⊥ / v² = g |vₓ| / v³　,　ρ = 1 / κ = v³ / ( g |vₓ| )</p>
        <p>因為最高點的速率最小，曲率在該處最大、曲率半徑最小——這正是模型畫出的密切圓在頂點縮到最小的原因。</p>

        <h2>階梯落點</h2>
        <p>
          設階面深 <var>w</var>、階高 <var>r</var>，從最上緣拋出。第 <var>n</var> 階的踏面位於 <var>y</var> = −<var>n r</var>，水平範圍 [(<var>n</var>−1)<var>w</var>, <var>n w</var>]。
          落在第 <var>n</var> 階的條件，是軌跡下降到該踏面高度時尚未越過它的外緣：
        </p>
        <p className="formula">t<sub>n</sub> = ( v<sub>y</sub> + √( v<sub>y</sub>² + 2 g n r ) ) / g　,　落在第 n 階 ⟺ vₓ t<sub>n</sub> ≤ n w</p>
        <p>模型從 <var>n</var> = 1 逐階代入這個不等式，每一階都是一次代數判斷，不是碰撞搜尋。水平拋出（<var>v<sub>y</sub></var> = 0）時可以直接化簡：</p>
        <p className="formula">n = ⌈ 2 v₀² r / ( g w² ) ⌉</p>
        <p>由於 <var>n</var> 與 <var>v₀</var>² 成正比，速度加倍會讓落點往下移約四倍的階數。模型同時顯示這個捷徑與一般解，兩者互相驗算。</p>

        <h2>空氣阻力：唯一使用數值方法的部分</h2>
        <p>
          加入與速率平方成正比的阻力後，運動方程變成
        </p>
        <p className="formula">a = − g ĵ − k |v| v　,　k = ½ ρ C<sub>d</sub> A / m　（單位 m⁻¹）</p>
        <p>
          水平與垂直方程透過 |<var>v</var>| 耦合在一起，兩個方向不再獨立，這個系統沒有基本函數形式的解。
          因此模型改用<strong>四階 Runge–Kutta 法</strong>推進，固定步長 Δ<var>t</var> = 0.002 s，並在最後一步用線性內插求出精確落地點，避免落點被步長量化。
        </p>
        <p>
          這是模型中唯一被逐步累積出來的曲線，其餘全部是解析求值。程式碼裡這一段被獨立在檔案末端並加上標記，
          且有一項測試斷言「標記線以上不得出現任何積分」，讓「以上皆為精確解」是可驗證的性質，而不是一句會過期的註解。
        </p>

        <h3>數值解的誤差如何被檢查</h3>
        <p>
          把阻力係數設為 <var>k</var> = 0，數值積分就必須重現真空的封閉解。測試以 <var>v₀</var> = 26 m/s、θ = 38°、<var>h</var> = 8 m 檢查：
          落地時間誤差小於 10⁻³ s，落點誤差小於 10⁻² m。這是用<strong>它所推廣的那個精確解</strong>來校準積分器，而不是拿它自己的輸出跟自己比。
        </p>
        <p>
          阻力開啟時，模型不會把真空軌跡藏起來，而是兩條並列：這個對照本身就是重點。畫面上以實線與虛線區分，
          並在說明中標示阻力曲線為數值結果，性質與其餘曲線不同。
        </p>

        <h2>模型的理想化與限制</h2>
        <table>
          <thead><tr><th>模型中的處理</th><th>真實情況</th><th>教學影響</th></tr></thead>
          <tbody>
            <tr><td>重力為定值，方向固定向下</td><td>重力隨高度與緯度變化，方向指向地心</td><td>在數十公尺尺度內誤差可忽略；不適用於彈道飛彈或衛星</td></tr>
            <tr><td>不計科氏力</td><td>地球自轉會使長程彈道側偏</td><td>短程拋體可忽略；長程偏轉屬於 <Link href="/coriolis">科氏力效應</Link> 模型的主題</td></tr>
            <tr><td>物體視為質點，不自轉</td><td>旋轉會產生馬格努斯力，使球路彎曲</td><td>模型不呈現曲球、上旋與側旋</td></tr>
            <tr><td>阻力採平方律，係數 k 為定值</td><td>C<sub>d</sub> 隨雷諾數變化，空氣密度隨高度遞減</td><td>阻力曲線用於定性比較，不作彈道預測</td></tr>
            <tr><td>兩軸使用同一比例尺</td><td>—</td><td>畫面上的形狀即真實形狀；代價是縱向常留有空白</td></tr>
          </tbody>
        </table>

        <h2>適合與不適合的用途</h2>
        <p>
          適合用來建立「水平垂直獨立」的直觀、比較發射角與射程的關係、討論最佳角與高度的關係、示範互補角與安全拋物線，以及製作教材圖。
          若需要真實彈道計算、運動生物力學分析或體育器材設計，應改用含完整空氣動力模型、旋轉效應與實測係數的專業工具。
        </p>
      </article>
    </main>
  );
}
