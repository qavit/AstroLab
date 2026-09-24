"use client";

import { MathErrorBoundary, MathProvider, Tex, TexBlock, useMathStatus } from "../math/MathJax";
import FieldLegend from "./FieldLegend";

/**
 * The electrostatics model's assumptions, formulas, validity limits and numerical method. Shared by
 * the in-lab overlay and the standalone `/electrostatics/notes` route, so the two cannot drift.
 * Every number quoted here is the v0.1 contract in `lib/science/electrostatics` and
 * `models/electrostatic-validation.ts`; changing either means updating this text.
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
      <div className="theory-body" data-testid="electrostatic-theory">
        <div className="eyebrow">Kakau Lab · Model 09</div>
        <h1>靜電場的理論、模型與計算</h1>
        <p>
          畫面上有幾顆固定的電荷。你可以問兩件事：<strong>某一點的電場是多少？</strong>如果放一顆會動的測試電荷，它會怎麼運動？
          這一頁先說明模型的基本想法，再說明怎麼讀畫面、模型在哪裡不再適用；比較技術性的計算細節放在標示「進階」的區塊，需要時再展開。
        </p>

        <h2>1. 這個模型在做什麼？</h2>
        <ul>
          <li>每顆<strong>源電荷</strong>是理想的點電荷，位置固定、不會移動。</li>
          <li>
            <strong>測試電荷</strong>會受力運動，但不會反過來推動源電荷。這是模型的假設，不是說真實電荷之間沒有交互作用。
            因為源電荷固定不動，電場不會隨時間自己改變；測試電荷只是在這個固定的電場中運動。
          </li>
          <li>探針只讀取某一點的電場，不影響任何東西。</li>
        </ul>
        <p>
          畫面只畫一個平面，但使用的仍是普通三維空間中的庫侖平方反比定律。我們只是把電荷和觀察點限制在同一個平面。
        </p>
        <details className="theory-advanced">
          <summary>進階：這和「真正的二維靜電學」有什麼不同？</summary>
          <p>
            真正的二維靜電學（例如無限長的帶電線在平面上的截面）電場隨 <Inline>{"1/r"}</Inline> 變化，位勢是對數形式。
            這個模型<strong>不是</strong>那樣：它的電場隨 <Inline>{"1/r^2"}</Inline> 變化，只是只在一個平面上取值。
          </p>
        </details>

        <h2>2. 電場從哪裡來？</h2>
        <p>第 <Inline>{"i"}</Inline> 顆源電荷 <Inline>{"q_i"}</Inline> 位於 <Inline>{"\\vec r_i"}</Inline>，它在位置 <Inline>{"\\vec r"}</Inline> 造成的電場為</p>
        <Formula>{"\\vec E_i(\\vec r) = k\\,q_i\\,\\frac{\\vec r - \\vec r_i}{|\\vec r - \\vec r_i|^{3}} \\qquad k = \\frac{1}{4\\pi\\varepsilon_0} \\approx 8.99\\times10^{9}\\ \\text{N·m}^2/\\text{C}^2"}</Formula>
        <p>
          白話地說：正的源電荷讓電場<strong>背離</strong>它，負的源電荷讓電場<strong>指向</strong>它；離得越遠，電場大小以距離平方的倒數減小。
        </p>

        <h2>3. 多顆電荷怎麼一起作用？</h2>
        <p>每顆電荷各自造成一個電場，合電場是它們的<strong>向量和</strong>：</p>
        <Formula>{"\\vec E(\\vec r) = \\sum_i \\vec E_i(\\vec r)"}</Formula>
        <p>
          相加的是向量，不是大小。兩個大小相同、方向相反的貢獻可以互相抵消；方向不同的貢獻要用平行四邊形（或分量）合成。
          畫面上的「貢獻箭頭」就是每個 <Inline>{"\\vec E_i"}</Inline>，「合電場箭頭」就是它們的和 <Inline>{"\\vec E"}</Inline>。
        </p>

        <h2>4. 電場怎麼變成力與運動？</h2>
        <p>
          模型先算出某個位置的電場 <Inline>{"\\vec E"}</Inline>，再用測試電荷的電量算出力 <Inline>{"\\vec F"}</Inline>，最後用質量算出加速度 <Inline>{"\\vec a"}</Inline>：
        </p>
        <Formula>{"\\vec E \\quad\\Rightarrow\\quad \\vec F = q_{\\text{test}}\\vec E \\quad\\Rightarrow\\quad \\vec a = \\frac{\\vec F}{m} = \\frac{q_{\\text{test}}}{m}\\vec E"}</Formula>
        <ul>
          <li>電場 <Inline>{"\\vec E"}</Inline> 只由源電荷和位置決定。改變測試電荷的正負或質量，<strong>都不會改變 E</strong>。</li>
          <li>測試電荷變號，力 <Inline>{"\\vec F"}</Inline> 與加速度 <Inline>{"\\vec a"}</Inline> 會反向。正測試電荷的力與加速度和 E 同向；負測試電荷則反向。</li>
          <li>質量不影響 <Inline>{"\\vec E"}</Inline> 和 <Inline>{"\\vec F"}</Inline>，但質量越大，加速度 <Inline>{"|\\vec a|"}</Inline> 越小。</li>
          <li>
            <strong>E、F、a 不一定是粒子前進的方向。</strong>它們決定的是速度如何改變；粒子實際往哪裡走，還取決於它現在的速度。
            速度、力、加速度是三個不同的量，可以指向不同方向。
          </li>
        </ul>

        <h2>5. 怎麼讀畫面上的箭頭？</h2>
        <p>
          箭頭方向代表電場方向；箭頭的視覺強弱只用來方便比較，不是線性的場強刻度。真正的 N/C 數值請看測量讀值。
          測量讀值是實際計算的結果，沒有被截斷，電場本身也沒有上限。
        </p>
        <FieldLegend />
        <details className="theory-advanced">
          <summary>進階：畫面怎麼判斷零場與箭頭強弱</summary>
          <h3>箭頭強弱的顯示尺度</h3>
          <p>
            目前的顯示尺度（v0.1）：小於 1 N/C 顯示在尺度的低端；1–5000 N/C 之間依對數變化；大於 5000 N/C 顯示在高端。
            這只影響箭頭畫多長、多深：
          </p>
          <Formula>{"s(E) = \\operatorname{clamp}\\left(\\frac{\\log_{10}E - \\log_{10}1}{\\log_{10}5000 - \\log_{10}1},\\ 0,\\ 1\\right) \\qquad (E \\text{ 以 N/C 計})"}</Formula>
          <h3>零場的判斷</h3>
          <p>
            幾個貢獻抵消後，電腦用有限位數計算，常會留下極小的殘值，而不是剛好等於 0。所以模型用一個容許值來分類：
          </p>
          <Formula>{"\\tau_{\\text{zero}} = 10^{-12}\\times\\max\\left(1\\ \\text{N/C},\\ \\sum_i |\\vec E_i|\\right)"}</Formula>
          <p>
            若 <Inline>{"|\\vec E| \\le \\tau_{\\text{zero}}"}</Inline>，系統把它分類為零場／近零場，因此不顯示方向。
            數值計算仍可能留下極小的非零殘值；被改變的是「有沒有定義方向」，不是把計算結果改寫成 0。
          </p>
        </details>

        <h2>6. 灰色核心代表什麼？</h2>
        <p>
          點電荷的場在 <Inline>{"r\\to 0"}</Inline> 時會發散。本模型<strong>不</strong>把力調軟、不把場截斷、不編一個源電荷處的有限值，也不會悄悄把粒子推開。
          取而代之的是：每顆源電荷有一個排除半徑
        </p>
        <Formula>{"r_{\\text{core}} = 0.12\\ \\text{m}"}</Formula>
        <p>
          在這個邊界上或以內，本產品不使用點電荷模型；探針會顯示「模型未定義」。
          若測試電荷的一步會進入核心，模擬就<strong>停在第一次碰到邊界的位置</strong>。
          灰色核心是<strong>模型有效性的邊界</strong>，不是帶電物體的實際半徑。
          同樣地，測試電荷離開 4 m × 3 m 的觀察範圍時，軌跡也在邊界結束，不會繞回來或反彈。
        </p>

        <h2>7. 模型有哪些限制？</h2>
        <ul>
          <li><strong>理想點電荷 vs. 真實電荷分布</strong>：真實物體有大小與形狀；靠近它時，點電荷的公式不再準確。灰色核心正是這個「不再適用」的提醒。</li>
          <li><strong>固定的源電荷 vs. 會互相移動的電荷</strong>：真實電荷之間會互相施力並運動；這裡的源電荷不動，測試電荷也不反作用於它們。</li>
          <li><strong>只有靜電</strong>：沒有磁場效應、沒有電磁輻射，也沒有相對論修正。測試電荷速度遠小於光速時，這是合理的簡化。</li>
          <li><strong>平面設置 vs. 三維定律</strong>：所有物體在同一平面，電場用三維庫侖定律。</li>
          <li><strong>灰色核心與觀察範圍邊界</strong>是刻意設下的有效性邊界；粒子到了那裡就停止，而不是被修飾過。</li>
          <li><strong>v0.1 的參數範圍</strong>是經過驗證的產品範圍，不是自然界的界線（見下方）。</li>
        </ul>

        <details className="theory-advanced">
          <summary>進階：粒子運動怎麼數值計算</summary>
          <p>
            電場可以直接代公式求值；粒子的運動則要用數值方法一步一步推進，因為力會隨位置改變。簡單說：模型把時間切成很短的固定小段，一段一段推進，並在每一段檢查有沒有碰到邊界。細節如下。
          </p>
          <ul>
            <li>
              <strong>速度 Verlet 法</strong>。每個子步長 <Inline>{"h"}</Inline>：
              <Formula>{"\\vec r' = \\vec r + \\vec v\\,h + \\tfrac12\\vec a\\,h^2,\\quad \\vec a' = \\tfrac{q}{m}\\vec E(\\vec r'),\\quad \\vec v' = \\vec v + \\tfrac12(\\vec a + \\vec a')\\,h"}</Formula>
            </li>
            <li>
              <strong>固定的物理步長</strong> <Inline>{"\\Delta t = 1/960\\ \\text{s}"}</Inline>。每個物理步可依當下狀態分成 1、2 或 4 個子步：
              選<strong>最小的</strong>子步數，使一個子步的移動量（<Inline>{"|\\vec v|h + \\tfrac12|\\vec a|h^2"}</Inline>）不超過「離最近核心邊界距離」的 2%；
              即使 4 個子步仍達不到，也只用 4 個，不會無限細分。子步數完全由當下狀態決定，同樣的設定永遠得到同樣的軌跡。
            </li>
            <li>
              <strong>連續的第一次碰撞偵測</strong>。每個子步都檢查這段位移是否穿過某個灰色核心或觀察範圍邊界，
              有的話就停在最早的交點，而不是只看步末的位置，所以粒子不會「跳過」核心。
            </li>
            <li>
              <strong>播放速度不是物理時鐘</strong>。瀏覽器的動畫時間只決定「每秒顯示多少物理步」；0.25×、0.5×、1×、2× 只改變觀看速度，
              不改變 <Inline>{"\\Delta t"}</Inline>、不改變軌跡，也不會為了追上進度而放大步長。
            </li>
          </ul>
        </details>

        <details className="theory-advanced">
          <summary>v0.1 驗證範圍</summary>
          <p>
            下表是目前 v0.1 <strong>經過驗證、產品支援的操作範圍</strong>。超出這些範圍不代表庫侖定律失效，只是這個產品沒有針對那裡驗證它的計算與呈現。
          </p>
          <table>
            <thead><tr><th>項目</th><th>v0.1 範圍</th></tr></thead>
            <tbody>
              <tr><td>觀察範圍</td><td>4 m × 3 m（<Inline>{"x\\in[-2,2]"}</Inline>、<Inline>{"y\\in[-1.5,1.5]"}</Inline> m）</td></tr>
              <tr><td>源電荷顆數</td><td>1–4 顆</td></tr>
              <tr><td>源電荷 <Inline>{"|q|"}</Inline></td><td>1–5 nC</td></tr>
              <tr><td>測試電荷 <Inline>{"|q|"}</Inline></td><td>0.1–0.5 nC</td></tr>
              <tr><td>測試粒子質量</td><td>5–20 µg</td></tr>
              <tr><td>荷質比 <Inline>{"|q|/m"}</Inline></td><td>0.005–0.05 C/kg</td></tr>
              <tr><td>初速率</td><td>0–2 m/s</td></tr>
              <tr><td>測試粒子起點離每顆源電荷中心</td><td>至少 0.24 m（核心半徑的兩倍）</td></tr>
              <tr><td>排除核心半徑</td><td>0.12 m</td></tr>
            </tbody>
          </table>
          <p>
            最多四顆是目前 v0.1 的操作與驗證範圍，不是物理定律的限制。兩顆源電荷的中心若近到核心互相重疊，也會被標為超出已驗證範圍。
          </p>
        </details>
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
