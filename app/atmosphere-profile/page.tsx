import type { Metadata } from "next";
import StandardAtmosphereLab from "@/components/StandardAtmosphereLab";

export const metadata: Metadata = {
  title: "大氣垂直結構｜AstroLab",
  description: "依 1976 年美國標準大氣模式，呈現溫度、氣壓、密度隨高度的變化剖面。",
  openGraph: {
    title: "大氣垂直結構｜AstroLab",
    description: "溫度、氣壓、密度隨高度的變化剖面",
  },
};

export default function AtmosphereProfilePage() {
  return <StandardAtmosphereLab />;
}
