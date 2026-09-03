"use client";

import Link from "next/link";
import { MathErrorBoundary, MathProvider, Tex, TexBlock, useMathStatus } from "@/components/projectile/mathjax";

/**
 * The model's formulas, the conditions each one needs, and an account of the single curve that is
 * not a closed form. Shared by the in-lab overlay and the standalone `/projectile/notes` route, so
 * the two can never drift apart.
 */

const Formula = TexBlock;
const Inline = Tex;

function TheoryContent() {
  const status = useMathStatus();
  return (
    <>
      {status === "error" && (
        <p className="theory-math-warning">
          數學排版元件載入失敗，以下公式暫以原始 LaTeX 呈現；重新整理頁面可再試一次。
        </p>
      )}
      <div className="theory-body">
        <div className="eyebrow">AstroLab · Model 07</div>
        <h1>拋體運動的理論與計算</h1>
        <p>
          這個模型只有一句核心主張：<strong>水平方向與垂直方向互不影響</strong>。水平沒有力，所以等速；垂直只有重力，所以等加速。
          兩者共用同一個時間 <Inline>{"t"}</Inline>，卻各自獨立地演化。畫面上的每一條曲線、每一個數字，都是這句話的直接後果。
        </p>
        <p>
          因為兩個方向可以分開解，真空情況下的答案都寫得出封閉形式。軌跡不是一步一步累積出來的，而是把時間代進式子求值得到的。
          唯一的例外是空氣阻力，理由寫在最後。
        </p>

        <h2>符號</h2>
        <table>
          <thead><tr><th>符號</th><th>意義</th><th>單位</th></tr></thead>
          <tbody>
            <tr><td><Inline>{"v_0"}</Inline></td><td>發射速率</td><td>m/s</td></tr>
            <tr><td><Inline>{"\\theta"}</Inline></td><td>發射角，自水平面起算</td><td>度</td></tr>
            <tr><td><Inline>{"h"}</Inline></td><td>發射點相對落地面的高度</td><td>m</td></tr>
            <tr><td><Inline>{"g"}</Inline></td><td>重力加速度（地表 9.80665）</td><td>m/s²</td></tr>
            <tr><td><Inline>{"v_x,\\ v_y"}</Inline></td><td>速度的水平、垂直分量</td><td>m/s</td></tr>
          </tbody>
        </table>

        <h2>基本運動方程</h2>
        <Formula>{"v_x = v_0\\cos\\theta \\qquad\\text{(不隨時間改變)}"}</Formula>
        <Formula>{"v_y(t) = v_0\\sin\\theta - gt"}</Formula>
        <Formula>{"x(t) = v_x\\,t \\qquad\\qquad y(t) = h + v_0\\sin\\theta\\,t - \\tfrac{1}{2}gt^2"}</Formula>
        <p>
          模型的分量圖就是這幾條式子的圖像：<Inline>{"x\\text{–}t"}</Inline> 必然是直線，<Inline>{"y\\text{–}t"}</Inline> 必然是二次曲線，
          <Inline>{"v_x"}</Inline> 是水平線，<Inline>{"v_y"}</Inline> 是斜率恆為 <Inline>{"-g"}</Inline> 的直線。
          若在畫面上看到別的形狀，就表示假設被破壞了（例如加入了空氣阻力）。
        </p>

        <h2>飛行時間、射程與最高點</h2>
        <p>落地即 <Inline>{"y = 0"}</Inline>，解 <Inline>{"\\tfrac{1}{2}gt^2 - v_0\\sin\\theta\\,t - h = 0"}</Inline> 取正根：</p>
        <Formula>{"t_f = \\frac{v_0\\sin\\theta + \\sqrt{v_0^2\\sin^2\\theta + 2gh}}{g} \\qquad R = v_0\\cos\\theta\\cdot t_f"}</Formula>
        <p>最高點發生在 <Inline>{"v_y = 0"}</Inline> 的時刻：</p>
        <Formula>{"t_{\\text{apex}} = \\frac{v_0\\sin\\theta}{g} \\qquad y_{\\max} = h + \\frac{v_0^2\\sin^2\\theta}{2g}"}</Formula>
        <p>
          當 <Inline>{"h = 0"}</Inline> 時射程化簡為 <Inline>{"R = v_0^2\\sin 2\\theta / g"}</Inline>。這個形式讓兩件事一眼可見：
          <Inline>{"R"}</Inline> 與 <Inline>{"v_0^2"}</Inline> 成正比、與 <Inline>{"g"}</Inline> 成反比（所以月球上同樣的一拋會遠約六倍），
          而且 <Inline>{"\\sin 2\\theta"}</Inline> 在 <Inline>{"\\theta = 45^\\circ"}</Inline> 取最大。
        </p>

        <h2>最佳發射角：45° 只是特例</h2>
        <p>對一般的發射高度，使射程最大的角度為</p>
        <Formula>{"\\sin\\theta^{*} = \\frac{1}{\\sqrt{2 + 2gh/v_0^2}} \\qquad R_{\\max} = \\frac{v_0}{g}\\sqrt{v_0^2 + 2gh}"}</Formula>
        <p>
          <Inline>{"h = 0"}</Inline> 時 <Inline>{"\\sin\\theta^{*} = 1/\\sqrt{2}"}</Inline>，也就是 45°。
          但只要發射點高於落地面，最佳角就會<strong>小於</strong> 45°：額外的高度已經免費提供了滯空時間，
          因此把速度多分配給水平方向更划算。模型的讀數列永遠顯示由上式算出的角度，不會固定寫 45°。
        </p>

        <h2>互補角：等射程的條件</h2>
        <p>
          由 <Inline>{"R = v_0^2\\sin 2\\theta / g"}</Inline>，因為 <Inline>{"\\sin 2\\theta = \\sin(180^\\circ - 2\\theta)"}</Inline>，
          所以 <Inline>{"\\theta"}</Inline> 與 <Inline>{"90^\\circ - \\theta"}</Inline> 射程相同。
          兩者的滯空時間卻不同，比值為 <Inline>{"\\tan\\theta"}</Inline>：高角度的那一顆晚很多才落地。
          模型讓兩顆球<strong>同時發射</strong>，就是為了讓這個差別看得見。
        </p>
        <p>
          這個配對<strong>只在 <Inline>{"h = 0"}</Inline> 時成立</strong>。發射點一旦抬高，兩個角度的射程就會分開，
          模型會分別報出兩個數字，而不是假裝它們相等。
        </p>

        <h2>安全拋物線（可及邊界）</h2>
        <p>固定速率 <Inline>{"v_0"}</Inline>、掃過所有發射角，得到的軌跡族有一條外包絡線：</p>
        <Formula>{"y = h + \\frac{v_0^2}{2g} - \\frac{gx^2}{2v_0^2}"}</Formula>
        <p>
          它本身也是一條拋物線。邊界以內的每一點，都存在（通常是兩個）發射角打得到；邊界以外則無論怎麼瞄都打不到。
          要打中位於 <Inline>{"(x, y)"}</Inline> 的目標，發射角滿足
        </p>
        <Formula>{"\\tan\\theta = \\frac{v_0^2 \\pm \\sqrt{v_0^4 - g\\left(gx^2 + 2yv_0^2\\right)}}{gx}"}</Formula>
        <p>根號內為負，就代表目標落在安全拋物線之外。兩個解分別對應低伸彈道與高吊彈道。</p>

        <h2>加速度的切向與法向分量</h2>
        <p>
          重力大小方向都不變，但它<strong>對運動所起的作用</strong>一直在變。
          把 <Inline>{"\\vec{a} = (0,\\,-g)"}</Inline> 沿速度方向與其垂直方向分解：
        </p>
        <Formula>{"a_{\\parallel} = -\\frac{g\\,v_y}{v} \\quad\\text{(改變速率)} \\qquad a_{\\perp} = \\frac{g\\,|v_x|}{v} \\quad\\text{(改變方向)}"}</Formula>
        <Formula>{"a_{\\parallel}^{2} + a_{\\perp}^{2} = g^{2}"}</Formula>
        <p>
          上升時 <Inline>{"a_{\\parallel} < 0"}</Inline>（減速），下降時 <Inline>{"a_{\\parallel} > 0"}</Inline>（加速），
          最高點 <Inline>{"a_{\\parallel} = 0"}</Inline>，此時重力全部用來轉彎。軌跡的曲率與曲率半徑為
        </p>
        <Formula>{"\\kappa = \\frac{a_{\\perp}}{v^{2}} = \\frac{g\\,|v_x|}{v^{3}} \\qquad \\rho = \\frac{1}{\\kappa} = \\frac{v^{3}}{g\\,|v_x|}"}</Formula>
        <p>因為最高點的速率最小，曲率在該處最大、曲率半徑最小——這正是密切圓在頂點縮到最小的原因。</p>

        <h2>階梯落點</h2>
        <p>
          設階面深 <Inline>{"w"}</Inline>、階高 <Inline>{"r"}</Inline>，從最上緣拋出。
          第 <Inline>{"n"}</Inline> 階的踏面位於 <Inline>{"y = -nr"}</Inline>，水平範圍 <Inline>{"[(n-1)w,\\ nw]"}</Inline>。
          落在第 <Inline>{"n"}</Inline> 階的條件，是軌跡下降到該踏面高度時尚未越過它的外緣：
        </p>
        <Formula>{"t_n = \\frac{v_y + \\sqrt{v_y^2 + 2gnr}}{g} \\qquad \\text{落在第 } n \\text{ 階} \\iff v_x t_n \\le nw"}</Formula>
        <p>
          模型從 <Inline>{"n = 1"}</Inline> 逐階代入這個不等式，每一階都是一次代數判斷，不是碰撞搜尋。
          水平拋出（<Inline>{"v_y = 0"}</Inline>）時可以直接化簡：
        </p>
        <Formula>{"n = \\left\\lceil \\frac{2v_0^2\\,r}{g\\,w^2} \\right\\rceil"}</Formula>
        <p>
          由於 <Inline>{"n"}</Inline> 與 <Inline>{"v_0^2"}</Inline> 成正比，速度加倍會讓落點往下移約四倍的階數。
          模型同時顯示這個捷徑與一般解，兩者互相驗算。
        </p>

        <h2>空氣阻力：唯一使用數值方法的部分</h2>
        <p>加入與速率平方成正比的阻力後，運動方程變成</p>
        <Formula>{"\\vec{a} = -g\\,\\hat{\\jmath} - k\\,|\\vec{v}|\\,\\vec{v} \\qquad k = \\frac{\\rho\\,C_d\\,A}{2m}\\ \\ (\\text{m}^{-1})"}</Formula>
        <p>
          水平與垂直方程透過 <Inline>{"|\\vec{v}|"}</Inline> 耦合在一起，兩個方向不再獨立，這個系統沒有基本函數形式的解。
          因此模型改用<strong>四階 Runge–Kutta 法</strong>推進，固定步長 <Inline>{"\\Delta t = 0.002\\ \\text{s}"}</Inline>，
          並在最後一步用線性內插求出精確落地點，避免落點被步長量化。
        </p>
        <p>
          這是模型中唯一被逐步累積出來的曲線，其餘全部是解析求值。程式碼裡這一段被獨立在檔案末端並加上標記，
          且有一項測試斷言「標記線以上不得出現任何積分」，讓「以上皆為精確解」成為可驗證的性質，而不是一句會過期的註解。
        </p>

        <h3>數值解的誤差如何被檢查</h3>
        <p>
          把阻力係數設為 <Inline>{"k = 0"}</Inline>，數值積分就必須重現真空的封閉解。測試以
          <Inline>{"v_0 = 26\\ \\text{m/s}"}</Inline>、<Inline>{"\\theta = 38^\\circ"}</Inline>、<Inline>{"h = 8\\ \\text{m}"}</Inline> 檢查：
          落地時間誤差小於 <Inline>{"10^{-3}\\ \\text{s}"}</Inline>，落點誤差小於 <Inline>{"10^{-2}\\ \\text{m}"}</Inline>。
          這是用<strong>它所推廣的那個精確解</strong>來校準積分器，而不是拿它自己的輸出跟自己比。
        </p>
        <p>
          阻力開啟時，模型不會把真空軌跡藏起來，而是兩條並列：這個對照本身就是重點。畫面上以實線與虛線區分，
          並標示阻力曲線為數值結果，性質與其餘曲線不同。
        </p>

        <h2>模型的理想化與限制</h2>
        <table>
          <thead><tr><th>模型中的處理</th><th>真實情況</th><th>教學影響</th></tr></thead>
          <tbody>
            <tr><td>重力為定值，方向固定向下</td><td>重力隨高度與緯度變化，方向指向地心</td><td>在數十公尺尺度內誤差可忽略；不適用於彈道飛彈或衛星</td></tr>
            <tr><td>不計科氏力</td><td>地球自轉會使長程彈道側偏</td><td>短程拋體可忽略；長程偏轉屬於 <Link href="/coriolis">科氏力效應</Link> 模型的主題</td></tr>
            <tr><td>物體視為質點，不自轉</td><td>旋轉會產生馬格努斯力，使球路彎曲</td><td>模型不呈現曲球、上旋與側旋</td></tr>
            <tr><td>阻力採平方律，係數 <Inline>{"k"}</Inline> 為定值</td><td><Inline>{"C_d"}</Inline> 隨雷諾數變化，空氣密度隨高度遞減</td><td>阻力曲線用於定性比較，不作彈道預測</td></tr>
            <tr><td>兩軸使用同一比例尺</td><td>—</td><td>畫面上的形狀即真實形狀；代價是畫框有時留有空白</td></tr>
          </tbody>
        </table>

        <h2>適合與不適合的用途</h2>
        <p>
          適合用來建立「水平垂直獨立」的直觀、比較發射角與射程的關係、討論最佳角與高度的關係、示範互補角與安全拋物線，以及製作教材圖。
          若需要真實彈道計算、運動生物力學分析或體育器材設計，應改用含完整空氣動力模型、旋轉效應與實測係數的專業工具。
        </p>
      </div>
    </>
  );
}

export default function TheoryNotes() {
  return (
    <MathErrorBoundary fallback={<div className="theory-body"><p>理論頁面暫時無法顯示，請重新整理頁面再試一次。</p></div>}>
      <MathProvider>
        <TheoryContent />
      </MathProvider>
    </MathErrorBoundary>
  );
}
