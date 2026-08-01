import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AstroLab｜互動式科學模型",
  description: "以同步 2D／3D 視圖探索天文與物理概念。",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
