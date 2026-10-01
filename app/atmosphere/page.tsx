import type { Metadata } from "next";
import { socialMetadata } from "@/lib/site-metadata";
import PlanetaryWindLab from "@/components/PlanetaryWindLab";

export const metadata: Metadata = {
  title: "全球行星風系｜Kakau Lab",
  description: "以同步全球 3D 風帶與緯度—高度剖面探索三圈環流、氣壓帶與科氏偏轉。",
  ...socialMetadata({ title: "全球行星風系｜Kakau Lab", description: "三圈環流、氣壓帶與科氏偏轉", image: { url: "/atmosphere-preview.png", width: 1731, height: 909 } }),
  alternates: { canonical: "/atmosphere" },
};

export default function AtmospherePage() {
  return <PlanetaryWindLab />;
}
