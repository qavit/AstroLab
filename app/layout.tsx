import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { localeHtmlLang, type Locale } from "@/lib/i18n";

// Next.js needs an absolute base to turn relative OG/Twitter image URLs into the absolute
// ones link-preview crawlers require; without it they resolve against an implicit
// http://localhost and break on kakau.tw's canonical origin.
export const metadata: Metadata = {
  metadataBase: new URL("https://lab.kakau.tw"),
  title: "Kakau Lab｜互動式科學模型",
  description: "用可操作的科學模型探索物理、地球科學與天文概念。",
  icons: {
    icon: [{ url: "/favicon.svg?v=ivory-rounded-1", sizes: "any", type: "image/svg+xml" }],
    shortcut: "/favicon.svg?v=ivory-rounded-1",
  },
  openGraph: {
    title: "Kakau Lab｜互動式科學模型",
    description: "用可操作的科學模型探索天文、地球科學與物理概念。",
    images: [{ url: "/home-preview.png", width: 1731, height: 909 }],
  },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders = await headers();
  const locale: Locale = requestHeaders.get("x-kakau-locale") === "en" ? "en" : "zh-TW";
  return <html lang={localeHtmlLang[locale]}><body>{children}</body></html>;
}
