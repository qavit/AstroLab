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
          畫面上有幾顆固定的電荷，你可以問兩件事：<strong>某一點的電場是多少？</strong>如果放一顆會動的測試電荷，它會怎麼運動？
          這一頁說明畫面背後採用的物理模型、每個箭頭與數字的意思、模型在哪裡停止適用，以及運動是怎麼算出來的。
        </p>

        <h2>模型只做這幾件事</h2>
        <ul>
          <li>每顆<strong>源電荷</strong>是理想的點電荷，位置固定、不會移動。</li>
          <li>
            <strong>測試電荷</strong>會受力運動，但不會反過來推動源電荷。這是模型的假設，不是說真實電荷之間沒有交互作用；
            正因為源電荷不動，電場才是「位置的固定函數」，運動才能一步一步算。
          </li>
          <li>探針只讀取電場，不影響任何東西。</li>
        </ul>

        <h2>點電荷的電場與疊加</h2>
        <p>第 <Inline>{"i"}</Inline> 顆源電荷 <Inline>{"q_i"}</Inline> 位於 <Inline>{"\\vec r_i"}</Inline>，它在位置 <Inline>{"\\vec r"}</Inline> 造成的電場為</p>
        <Formula>{"\\vec E_i(\\vec r) = k\\,q_i\\,\\frac{\\vec r - \\vec r_i}{|\\vec r - \\vec r_i|^{3}} \\qquad k = \\frac{1}{4\\pi\\varepsilon_0} \\approx 8.99\\times10^{9}\\ \\text{N·m}^2/\\text{C}^2"}</Formula>
        <p>
          正的源電荷讓電場<strong>背離</strong>它，負的源電荷讓電場<strong>指向</strong>它；大小與距離平方成反比。
          多顆電荷同時存在時，電場是<strong>向量相加</strong>：
        </p>
        <Formula>{"\\vec E(\\vec r) = \\sum_i \\vec E_i(\\vec r)"}</Formula>
        <p>
          相加的是向量，不是大小。兩個大小相同、方向相反的貢獻可以互相抵消，方向不同的貢獻要用平行四邊形（或分量）合成。
          畫面上的「貢獻箭頭」就是每個 <Inline>{"\\vec E_i"}</Inline>，「合電場箭頭」就是它們的和 <Inline>{"\\vec E"}</Inline>。
        </p>

        <h2>從電場到力、再到加速度</h2>
        <Formula>{"\\vec E \;\\longrightarrow\; \\vec F = q_{\\text{test}}\\,\\vec E \;\\longrightarrow\; \\vec a = \\frac{\\vec F}{m} = \\frac{q_{\\text{test}}}{m}\\,\\vec E"}</Formula>
        <ul>
          <li>電場 <Inline>{"\\vec E"}</Inline> 只由源電荷與位置決定。換測試電荷的正負或質量，<strong>不會改變 E</strong>。</li>
          <li>測試電荷變號，力 <Inline>{"\\vec F"}</Inline> 與加速度 <Inline>{"\\vec a"}</Inline> 反向；正電荷順著 E，負電荷逆著 E。</li>
          <li>質量不影響電力 <Inline>{"\\vec F"}</Inline>，但質量越大，加速度 <Inline>{"|\\vec a|"}</Inline> 越小。</li>
          <li>
            電場箭頭<strong>不一定</strong>是粒子前進的方向。E 決定的是力與加速度；粒子往哪裡走還取決於它現在的速度。
            速度、力、加速度是三個不同的量，可以指向不同方向。
          </li>
        </ul>

        <h2>二維的畫面，三維的庫侖定律</h2>
        <p>
          源電荷、探針與測試電荷都放在同一個平面上，但電場用的是<strong>一般三維空間的庫侖平方反比定律</strong>（上面的 <Inline>{"1/r^2"}</Inline>），
          只是只在這個平面上取值。它<strong>不是</strong>真正的二維靜電學（那會得到 <Inline>{"1/r"}</Inline> 的場與對數位勢）。
          你可以把每顆源電荷想成一顆真實的球形電荷，而我們只看通過所有電荷的那個切面。
        </p>

        <h2>怎麼讀畫面</h2>
        <p>
          箭頭是電場的<strong>視覺化</strong>。方向就是電場方向；長度與明暗只是為了讓很大的動態範圍看得見，<strong>不等於場強的線性尺</strong>。
          目前的顯示尺度（v0.1）：小於 1 N/C 顯示在尺度的低端；1–5000 N/C 之間依對數變化；大於 5000 N/C 顯示在高端。
          探針與讀數顯示的是真實計算值，<strong>沒有被截斷</strong>；電場本身也不會在 5000 N/C 封頂。
        </p>
        <Formula>{"s(E) = \\operatorname{clamp}\\!\\left(\\frac{\\log_{10}E - \\log_{10}1}{\\log_{10}5000 - \\log_{10}1},\\ 0,\\ 1\\right)"}</Formula>
        <p>上式（<Inline>{"E"}</Inline> 以 N/C 計）只決定箭頭畫多長、多深。</p>
        <FieldLegend />

        <h2>什麼時候算「零場」？</h2>
        <p>
          幾個貢獻抵消後，電腦用有限位數計算，常會留下極小的殘值，而不是剛好等於 0。所以模型用一個容許值來判斷：
        </p>
        <Formula>{"\\tau_{\\text{zero}} = 10^{-12}\\times\\max\\!\\left(1\\ \\text{N/C},\\ \\sum_i |\\vec E_i|\\right)"}</Formula>
        <p>
          若 <Inline>{"|\\vec E| \\le \\tau_{\\text{zero}}"}</Inline>，就視為零場。此時大小視為零，<strong>方向沒有定義</strong>，畫面不會編造一個角度。
          容許值跟著各貢獻的總大小縮放，所以「抵消得夠徹底」的判斷不會被電荷的大小影響。
        </p>

        <h2>灰色核心：模型停止適用的邊界</h2>
        <p>
          點電荷的場在 <Inline>{"r\\to 0"}</Inline> 時發散。本模型<strong>不</strong>把力調軟、不把場截斷、不編一個源電荷處的有限值，也不會悄悄把粒子推開。
          取而代之的是：每顆源電荷有一個排除半徑
        </p>
        <Formula>{"r_{\\text{core}} = 0.12\\ \\text{m}"}</Formula>
        <p>
          在這個邊界上或以內，本產品不使用點電荷模型；探針會顯示「模型未定義」。
          若測試電荷的一步會進入核心，模擬就<strong>停在第一次碰到邊界的位置</strong>。
          灰色核心是<strong>模型有效性的邊界</strong>，不是帶電物體的實際半徑。
          同樣地，測試電荷離開 4 m × 3 m 的觀察範圍時，軌跡也在邊界結束，不會繞回來或反彈。
        </p>

        <h2>運動是怎麼算出來的</h2>
        <p>
          電場可以直接代公式求值；粒子的運動則要用數值方法一步一步推進，因為力隨位置改變。目前的做法是：
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
            有的話就停在最早的交點，而不是只看步末的位置——所以粒子不會「跳過」核心。
          </li>
          <li>
            <strong>播放速度不是物理時鐘</strong>。瀏覽器的動畫時間只決定「每秒顯示多少物理步」；0.25×、0.5×、1×、2× 只改變觀看速度，
            不改變 <Inline>{"\\Delta t"}</Inline>、不改變軌跡，也不會為了追上進度而放大步長。
          </li>
        </ul>

        <h2>這一版在哪些範圍內經過驗證？</h2>
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

        <h2>模型的限制</h2>
        <ul>
          <li><strong>理想點電荷 vs. 真實電荷分布</strong>：真實物體有大小與形狀；靠近它時，點電荷的公式不再準確。灰色核心正是這個「不再適用」的提醒。</li>
          <li><strong>固定的源電荷 vs. 會互相移動的電荷</strong>：真實電荷之間會互相施力並運動；這裡的源電荷不動，測試電荷也不反作用於它們。</li>
          <li><strong>只有靜電</strong>：沒有磁場效應、沒有電磁輻射，也沒有相對論修正。測試電荷速度遠小於光速時，這是合理的簡化。</li>
          <li><strong>平面設置 vs. 三維定律</strong>：所有物體在同一平面，電場用三維庫侖定律（見上）。</li>
          <li><strong>灰色核心與觀察範圍邊界</strong>是刻意設下的有效性邊界；粒子到了那裡就停止，而不是被修飾過。</li>
          <li><strong>v0.1 的參數範圍</strong>是經過驗證的產品範圍，不是自然界的界線。</li>
        </ul>
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
