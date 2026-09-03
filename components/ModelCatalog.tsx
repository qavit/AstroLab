import Link from "next/link";
import { ArrowUpRight, Compass, Layers, Magnet, Mountain, Orbit, RotateCw, Target, Wind, type LucideIcon } from "lucide-react";

type CatalogModel = {
  href: string;
  subject: string;
  /** Catalogue number, which follows the order the models were built, not the order shown. */
  number: string;
  title: string;
  description: string;
  tags: readonly string[];
  /** Preview image. Omitted for models whose card art is drawn in CSS instead. */
  image?: string;
  /** CSS-drawn card art to use when `image` is omitted. */
  cardArt?: "magnet" | "layers" | "coriolis" | "projectile";
  icon: LucideIcon;
  tone: string;
};

const models: readonly CatalogModel[] = [
  {
    href: "/solar",
    subject: "天文",
    number: "01",
    title: "太陽、天球與竿影",
    description: "同步觀看地心天球與觀察者天空，連結季節、日行跡與竿影。",
    tags: ["天球座標", "四季", "日行跡"],
    image: "/solar-sphere-preview.png",
    icon: Orbit,
    tone: "solar",
  },
  {
    href: "/atmosphere",
    subject: "地球科學",
    number: "03",
    title: "全球行星風系",
    description: "用風帶、氣壓帶與粒子流，理解三圈環流與科氏偏轉。",
    tags: ["三圈環流", "ITCZ", "風場粒子"],
    image: "/atmosphere-preview.png",
    icon: Wind,
    tone: "atmosphere",
  },
  {
    href: "/geology",
    subject: "地球科學",
    number: "04",
    title: "岩層位態 × 河谷地形",
    description: "將地質圖與立體塊體同步，練習走向、傾向與 V 字法則。",
    tags: ["地質圖", "V 字法則", "岩層位態"],
    image: "/geology-preview.png",
    icon: Mountain,
    tone: "geology",
  },
  {
    href: "/atmosphere-profile",
    subject: "地球科學",
    number: "05",
    title: "大氣垂直結構",
    description: "依美國標準大氣 1976 模式，繪製溫度、氣壓、密度隨高度變化的剖面。",
    tags: ["標準大氣", "氣壓遞減", "大氣分層"],
    cardArt: "layers",
    icon: Layers,
    tone: "atmosphere",
  },
  {
    href: "/magnetism",
    subject: "物理",
    number: "02",
    title: "多導線磁場疊加",
    description: "從空間視角與俯視圖同步理解安培定律與磁場向量疊加。",
    tags: ["安培定律", "向量疊加", "右手定則"],
    cardArt: "magnet",
    icon: Magnet,
    tone: "magnetism",
  },
  {
    href: "/coriolis",
    subject: "物理",
    number: "06",
    title: "科氏力效應",
    description: "同步顯示慣性系直線與旋轉系彎曲路徑，理解科氏偏轉如何隨緯度與轉速改變。",
    tags: ["旋轉參考系", "科氏參數", "傅科擺"],
    cardArt: "coriolis",
    icon: RotateCw,
    tone: "coriolis",
  },
  {
    href: "/projectile",
    subject: "物理",
    number: "07",
    title: "拋體運動",
    description: "把拋物線拆成水平等速與垂直等加速，並比較互補角、安全拋物線與空氣阻力。",
    tags: ["水平垂直獨立", "安全拋物線", "曲率與加速度分量"],
    cardArt: "projectile",
    icon: Target,
    tone: "projectile",
  },
];

export default function ModelCatalog() {
  return (
    <main className="catalog-shell">
      <header className="catalog-header">
        <Link href="/" className="catalog-brand" aria-label="AstroLab 模型目錄">
          <Compass size={20} /> <span>AstroLab</span>
        </Link>
        <span className="catalog-count">07 interactive models</span>
      </header>

      <section className="catalog-hero">
        <div>
          <p className="catalog-eyebrow">INTERACTIVE SCIENCE MODELS</p>
          <h1>把看不見的規律，<br />變成可以操作的模型。</h1>
          <p>從天球到風場、從地質圖到磁場；每一個模型都把計算、圖像和操作放在同一個畫面。</p>
        </div>
        <aside className="catalog-principle"><span>AstroLab</span><strong>看見關係<br />再理解公式</strong></aside>
      </section>

      <section className="catalog-section" aria-labelledby="catalog-title">
        <div className="catalog-section-heading"><p>模型目錄</p><h2 id="catalog-title">選擇一個主題開始探索</h2></div>
        <div className="model-card-grid">
          {models.map((model) => {
            const Icon = model.icon;
            return (
              <Link href={model.href} className={`model-card model-card-${model.tone}`} key={model.href}>
                <div className="model-card-art">
                  {model.image ? (
                    <div className="model-card-preview" style={{ backgroundImage: `url(${model.image})` }} />
                  ) : model.cardArt === "layers" ? (
                    <div className="layers-card-art"><i /><i /><i /><i /><i /></div>
                  ) : model.cardArt === "projectile" ? (
                    <div className="projectile-card-art">
                      <i />
                      <svg viewBox="0 0 100 100" className="projectile-card-path" aria-hidden="true">
                        <path d="M14 82 Q50 8 86 82" stroke="#5ed8c3" strokeWidth="3" strokeLinecap="round" fill="none" />
                        <path d="M50 25 L50 45" stroke="#ffd280" strokeWidth="1.6" strokeDasharray="3 3" fill="none" />
                        <path d="M50 25 L72 25" stroke="#8ad6ff" strokeWidth="1.6" strokeDasharray="3 3" fill="none" />
                        <circle cx="50" cy="25" r="3.4" fill="#f4f1e8" />
                      </svg>
                    </div>
                  ) : model.cardArt === "coriolis" ? (
                    <div className="coriolis-card-art">
                      <i /><i />
                      <svg viewBox="0 0 100 100" className="coriolis-card-path" aria-hidden="true">
                        <defs>
                          <marker id="coriolis-card-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                            <path d="M0,0 L6,3 L0,6 Z" fill="#5ed8c3" />
                          </marker>
                        </defs>
                        <path d="M50 18 L66 60" stroke="#f2c66d" strokeWidth="1.6" strokeDasharray="4 4" fill="none" />
                        <path d="M50 18 C68 26 76 46 66 60" stroke="#5ed8c3" strokeWidth="3" strokeLinecap="round" fill="none" markerEnd="url(#coriolis-card-arrow)" />
                      </svg>
                    </div>
                  ) : (
                    <div className="magnet-card-art"><span>⊙</span><span>⊗</span><i /><i /><i /></div>
                  )}
                  <div className="model-card-art-overlay" />
                  <span className="model-card-number">{model.number}</span>
                </div>
                <div className="model-card-body">
                  <div className="model-card-meta"><span><Icon size={14} /> {model.subject}</span><ArrowUpRight size={17} /></div>
                  <h3>{model.title}</h3>
                  <p>{model.description}</p>
                  <div className="model-card-tags">{model.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <footer className="catalog-footer"><span>AstroLab</span><span>同步計算 · 互動操作 · 科學視覺化</span></footer>
    </main>
  );
}
