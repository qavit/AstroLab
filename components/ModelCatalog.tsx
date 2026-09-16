import Link from "next/link";
import {
  ArrowUpRight,
  Compass,
  Layers,
  Magnet,
  Mountain,
  Orbit,
  RotateCw,
  Target,
  Waves,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { publishedLabs, type LabManifest, type LabSubject } from "@/lib/labs/registry";

/** Maps the registry's string icon keys to actual components. The registry itself stays free of React/lucide. */
const icons: Record<string, LucideIcon> = {
  orbit: Orbit,
  magnet: Magnet,
  wind: Wind,
  mountain: Mountain,
  layers: Layers,
  "rotate-cw": RotateCw,
  target: Target,
  waves: Waves,
};

const subjectLabels: Record<LabSubject, string> = {
  physics: "物理",
  "earth-science": "地球科學",
  astronomy: "天文",
  math: "數學",
  chemistry: "化學",
};

function labHref(lab: LabManifest): string {
  return lab.implementation.app === "kakau-lab" ? (lab.implementation.route ?? "/") : (lab.implementation.url ?? "#");
}

function CardArt({ lab }: { lab: LabManifest }) {
  const cardArt = lab.presentation?.cardArt;
  const previewImage = lab.presentation?.previewImage;

  if (previewImage) {
    return <div className="model-card-preview" style={{ backgroundImage: `url(${previewImage})` }} />;
  }
  if (cardArt === "layers") {
    return (
      <div className="layers-card-art">
        <i /><i /><i /><i /><i />
      </div>
    );
  }
  if (cardArt === "projectile") {
    return (
      <div className="projectile-card-art">
        <i />
        <svg viewBox="0 0 100 100" className="projectile-card-path" aria-hidden="true">
          <path d="M14 82 Q50 8 86 82" stroke="#5ed8c3" strokeWidth="3" strokeLinecap="round" fill="none" />
          <path d="M50 25 L50 45" stroke="#ffd280" strokeWidth="1.6" strokeDasharray="3 3" fill="none" />
          <path d="M50 25 L72 25" stroke="#8ad6ff" strokeWidth="1.6" strokeDasharray="3 3" fill="none" />
          <circle cx="50" cy="25" r="3.4" fill="#f4f1e8" />
        </svg>
      </div>
    );
  }
  if (cardArt === "coriolis") {
    return (
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
    );
  }
  if (cardArt === "magnet") {
    return (
      <div className="magnet-card-art">
        <span>⊙</span><span>⊗</span><i /><i /><i />
      </div>
    );
  }
  return null;
}

function ModelCard({ lab }: { lab: LabManifest }) {
  const Icon = lab.presentation?.icon ? icons[lab.presentation.icon] : undefined;
  const href = labHref(lab);
  const isExternal = lab.implementation.app !== "kakau-lab";
  const className = `model-card model-card-${lab.presentation?.tone ?? "default"}`;

  const content = (
    <>
      <div className="model-card-art">
        <CardArt lab={lab} />
        <div className="model-card-art-overlay" />
        <span className="model-card-number">{lab.number}</span>
      </div>
      <div className="model-card-body">
        <div className="model-card-meta">
          <span>{Icon ? <Icon size={14} /> : null} {subjectLabels[lab.subject]}</span>
          <ArrowUpRight size={17} />
        </div>
        <h3>{lab.title}</h3>
        <p>{lab.description}</p>
        <div className="model-card-tags">{lab.topics.map((topic) => <span key={topic}>{topic}</span>)}</div>
      </div>
    </>
  );

  if (isExternal) {
    return (
      <a href={href} className={className}>
        {content}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}

export default function ModelCatalog() {
  const labs = publishedLabs();

  return (
    <main className="catalog-shell">
      <header className="catalog-header">
        <Link href="/" className="catalog-brand" aria-label="Kakau Lab 模型目錄">
          <Compass size={20} /> <span>Kakau Lab</span>
        </Link>
        <span className="catalog-count">{`${labs.length.toString().padStart(2, "0")} interactive models`}</span>
      </header>

      <section className="catalog-hero">
        <div>
          <p className="catalog-eyebrow">INTERACTIVE SCIENCE MODELS</p>
          <h1>把看不見的規律，<br />變成可以操作的模型。</h1>
          <p>從天球到風場、從地質圖到磁場；每一個模型都把計算、圖像和操作放在同一個畫面。</p>
        </div>
        <aside className="catalog-principle"><span>Kakau Lab</span><strong>看見關係<br />再理解公式</strong></aside>
      </section>

      <section className="catalog-section" aria-labelledby="catalog-title">
        <div className="catalog-section-heading"><p>模型目錄</p><h2 id="catalog-title">選擇一個主題開始探索</h2></div>
        <div className="model-card-grid">
          {labs.map((lab) => <ModelCard lab={lab} key={lab.id} />)}
        </div>
      </section>

      <footer className="catalog-footer"><span>Kakau Lab</span><span>同步計算 · 互動操作 · 科學視覺化</span></footer>
    </main>
  );
}
