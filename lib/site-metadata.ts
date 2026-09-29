import type { Metadata } from "next";

export const SITE_TITLE = "Kakau Lab｜互動式科學模型";
export const SITE_DESCRIPTION = "用可操作的科學模型探索物理、地球科學與天文概念。";

export type SocialImage = { url: string; width: number; height: number; alt?: string };

export const SITE_OG_IMAGE: SocialImage = {
  url: "/brand/og-lab.png",
  width: 1200,
  height: 630,
  alt: "Kakau Lab：把模型動起來，從操作與觀察理解科學。",
};

type SocialInput = {
  title: string;
  description: string;
  image?: SocialImage;
  locale?: string;
};

/**
 * Next.js merges metadata shallowly, so any page that declares `openGraph`
 * replaces the layout's whole object, `images` included. Build every
 * `openGraph`/`twitter` pair here so no page silently loses its share image.
 */
export function socialMetadata({ title, description, image = SITE_OG_IMAGE, locale }: SocialInput): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: { title, description, images: [image], ...(locale ? { locale } : {}) },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}
