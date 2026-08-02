import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AstroLab｜互動式科學模型",
  description: "以同步 2D／3D 視圖探索天文與物理概念。",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "AstroLab｜互動式科學模型",
    description: "用可操作的科學模型探索天文、地球科學與物理概念。",
    images: [{ url: "/home-preview.png", width: 1731, height: 909 }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
