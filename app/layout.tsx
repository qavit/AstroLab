import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kakau Lab｜互動式科學模型",
  description: "用可操作的科學模型探索物理、地球科學與天文概念。",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "Kakau Lab｜互動式科學模型",
    description: "用可操作的科學模型探索天文、地球科學與物理概念。",
    images: [{ url: "/home-preview.png", width: 1731, height: 909 }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
