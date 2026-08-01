import type { Metadata } from "next";
import SolarLab from "@/components/SolarLab";

export const metadata: Metadata = {
  title: "太陽、天球與竿影｜AstroLab",
  description: "同步探索地心天球與觀察者天空的互動式科學模型。",
};

export default function Home() {
  return <SolarLab />;
}
