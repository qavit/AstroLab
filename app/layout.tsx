import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AstroLab｜互動式科學模型",
  description: "以同步 2D／3D 視圖探索天文與物理概念。",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "AstroLab｜太陽、天球與竿影",
    description: "用同步地心與觀察者視圖探索太陽周年運動、日行跡與竿影。",
    images: [{ url: "/solar-sphere-preview.png", width: 1680, height: 945 }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
