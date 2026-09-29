import type { MetadataRoute } from "next";

const publishedPaths = [
  "/",
  "/about",
  "/atmosphere",
  "/atmosphere-profile",
  "/coriolis",
  "/electrostatics",
  "/electrostatics/notes",
  "/en/atmosphere-profile",
  "/geology",
  "/magnetism",
  "/projectile",
  "/projectile/notes",
  "/solar",
] as const;

/** Index only published routes. A locale peer appears here only after its reviewed content exists. */
export default function sitemap(): MetadataRoute.Sitemap {
  return publishedPaths.map((path) => ({ url: new URL(path, "https://lab.kakau.tw").href }));
}
