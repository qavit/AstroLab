import type { Metadata } from "next";
import ProjectileLab from "@/components/ProjectileLab";

export const metadata: Metadata = {
  title: "拋體運動｜AstroLab",
  description: "水平等速與垂直等加速的獨立性、互補角、安全拋物線、階梯落點與空氣阻力對照。",
  openGraph: {
    title: "拋體運動｜AstroLab",
    description: "把拋物線拆成水平與垂直兩個各自成立的運動",
  },
};

export default function ProjectilePage() {
  return <ProjectileLab />;
}
