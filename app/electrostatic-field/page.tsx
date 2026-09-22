import type { Metadata } from "next";
import ElectrostaticFieldLab from "@/components/ElectrostaticFieldLab";

export const metadata: Metadata = {
  title: "靜電場工作室｜Kakau Lab",
  description: "建立點電荷配置、觀察向量疊加，並用空間探針讀取每個來源與總電場。",
  openGraph: {
    title: "靜電場工作室｜Kakau Lab",
    description: "用可分享的物理設定探索多電荷電場與向量疊加。",
  },
};

type PageProps = {
  searchParams: Promise<{ s?: string | string[] }>;
};

export default async function ElectrostaticFieldPage({ searchParams }: PageProps) {
  const { s } = await searchParams;
  return <ElectrostaticFieldLab initialShare={typeof s === "string" ? s : null} />;
}
