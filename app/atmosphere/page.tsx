import type { Metadata } from "next";
import PlanetaryWindLab from "@/components/PlanetaryWindLab";

export const metadata: Metadata = {
  title: "全球行星風系｜AstroLab",
  description: "以同步全球 3D 風帶與緯度—高度剖面探索三圈環流、氣壓帶與科氏偏轉。",
  openGraph: {
    title: "全球行星風系｜AstroLab",
    description: "三圈環流、氣壓帶與科氏偏轉",
    images: [{ url: "/atmosphere-preview.png", width: 1731, height: 909 }],
  },
};

export default function AtmospherePage() {
  return <PlanetaryWindLab />;
}
