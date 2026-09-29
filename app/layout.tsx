import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { localeHtmlLang, type Locale } from "@/lib/i18n";
import { SITE_DESCRIPTION, SITE_TITLE, socialMetadata } from "@/lib/site-metadata";

// Next.js needs an absolute base to turn relative OG/Twitter image URLs into the absolute
// ones link-preview crawlers require; without it they resolve against an implicit
// http://localhost and break on kakau.tw's canonical origin.
export const metadata: Metadata = {
  metadataBase: new URL("https://lab.kakau.tw"),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  icons: {
    icon: [{ url: "/favicon.svg?v=ivory-rounded-1", sizes: "any", type: "image/svg+xml" }],
    shortcut: "/favicon.svg?v=ivory-rounded-1",
  },
  ...socialMetadata({ title: SITE_TITLE, description: SITE_DESCRIPTION }),
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders = await headers();
  const locale: Locale = requestHeaders.get("x-kakau-locale") === "en" ? "en" : "zh-TW";
  return <html lang={localeHtmlLang[locale]}><body>{children}</body></html>;
}
