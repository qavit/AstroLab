import type { Metadata } from "next";
import Link from "next/link";
import TheoryNotes from "@/components/projectile/TheoryNotes";

export const metadata: Metadata = {
  title: "拋體運動：理論與計算｜AstroLab",
  description: "拋體運動模型使用的公式、它們的成立條件，以及空氣阻力為何必須改用數值積分。",
};

/** The same notes the lab shows in its overlay, as a linkable page. */
export default function ProjectileNotesPage() {
  return (
    <main className="about-page">
      <nav><Link href="/projectile">← 返回模型</Link></nav>
      <article><TheoryNotes /></article>
    </main>
  );
}
