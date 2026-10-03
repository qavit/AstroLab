import type { Metadata } from "next";
import FbdLab from "@/components/FbdLab";
import { socialMetadata } from "@/lib/site-metadata";
export const metadata: Metadata = {
  title: "自由體圖｜Kakau Lab",
  description: "從木塊、桌面與手的交互作用建立自由體圖，提交、比較並修正你的模型。",
  ...socialMetadata({ title: "自由體圖｜Kakau Lab", description: "先選系統，再由交互作用建立力圖。" }),
  alternates: { canonical: "/fbd" },
  robots: { index: false, follow: true },
};
export default function FbdPage() { return <FbdLab />; }
