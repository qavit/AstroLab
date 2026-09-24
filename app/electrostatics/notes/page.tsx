import type { Metadata } from "next";
import Link from "next/link";
import TheoryNotes from "@/components/electrostatic/TheoryNotes";

export const metadata: Metadata = {
  title: "靜電場：理論、模型與計算｜Kakau Lab",
  description: "靜電學模型使用的點電荷電場、力與加速度的關係、模型的有效範圍，以及粒子運動的數值計算方式。",
};

/** The same notes the lab shows in its overlay, as a linkable page. */
export default function ElectrostaticsNotesPage() {
  return (
    <main className="about-page">
      <nav><Link href="/electrostatics">← 返回模型</Link></nav>
      <article><TheoryNotes /></article>
    </main>
  );
}
