import type { Metadata } from "next";
import { socialMetadata } from "@/lib/site-metadata";
import StandardAtmosphereLab from "@/components/StandardAtmosphereLab";

export const metadata: Metadata = {
  title: "Vertical Structure of the Atmosphere | Kakau Lab",
  description: "Explore how temperature, pressure, and density vary with altitude in the U.S. Standard Atmosphere 1976 model.",
  alternates: {
    canonical: "/en/atmosphere-profile",
    languages: { "zh-TW": "/atmosphere-profile", en: "/en/atmosphere-profile", "x-default": "/atmosphere-profile" },
  },
  ...socialMetadata({ title: "Vertical Structure of the Atmosphere | Kakau Lab", description: "An interactive profile of temperature, pressure, and density through the atmosphere.", locale: "en_US" }),
};

export default function EnglishAtmosphereProfilePage() {
  return <StandardAtmosphereLab locale="en" />;
}
