import type { Metadata } from "next";
import ElectrostaticFieldLab from "@/components/ElectrostaticFieldLab";
import type { ShareRouteInput } from "@/components/electrostatic/share";

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

/** Presence of `s` decides guided vs sandbox; the payload only decides which setup loads. */
function shareInput(s: string | string[] | undefined): ShareRouteInput {
  if (s === undefined) return { present: false };
  if (Array.isArray(s)) return s.length === 1 ? { present: true, encoded: s[0] } : { present: true, repeated: true };
  return { present: true, encoded: s };
}

export default async function ElectrostaticFieldPage({ searchParams }: PageProps) {
  const { s } = await searchParams;
  return <ElectrostaticFieldLab share={shareInput(s)} />;
}
