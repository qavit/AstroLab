import type { Metadata } from "next";
import ModelCatalog from "@/components/ModelCatalog";

export const metadata: Metadata = {
  title: "AstroLab｜互動式科學模型",
  description: "用可操作的科學模型探索天文、地球科學與物理概念。",
};

export default function Home() {
  return <ModelCatalog />;
}
