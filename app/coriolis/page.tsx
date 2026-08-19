import type { Metadata } from "next";
import CoriolisLab from "@/components/CoriolisLab";

export const metadata: Metadata = {
  title: "科氏力效應｜AstroLab",
  description: "同步顯示慣性系直線與旋轉系彎曲路徑，比較旋轉平台與地球緯度兩種情境下的科氏偏轉。",
  openGraph: {
    title: "科氏力效應｜AstroLab",
    description: "旋轉參考系、科氏參數與傅科擺",
  },
};

export default function CoriolisPage() {
  return <CoriolisLab />;
}
