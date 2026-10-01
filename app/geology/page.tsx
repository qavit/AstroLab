import type { Metadata } from "next";
import { socialMetadata } from "@/lib/site-metadata";
import ValleyBeddingLab from "@/components/ValleyBeddingLab";

export const metadata: Metadata = {
  title: "岩層位態與河谷地形｜Kakau Lab",
  description: "同步俯視地質圖與立體地形，探索岩層走向、傾向、傾角及河谷 V 字法則。",
  ...socialMetadata({ title: "岩層位態 × 河谷地形｜Kakau Lab", description: "用俯視圖與立體剖面看懂 V 字法則", image: { url: "/geology-preview.png", width: 1730, height: 909 } }),
  alternates: { canonical: "/geology" },
};

export default function GeologyPage() {
  return <ValleyBeddingLab />;
}
