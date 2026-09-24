import type { Metadata } from "next";
import ElectrostaticFieldLab from "@/components/ElectrostaticFieldLab";
import type { ShareRouteInput } from "@/components/electrostatic/share";

export const metadata: Metadata = {
  title: "靜電學｜Kakau Lab",
  description: "從點電荷與電場開始，探索看不見的電作用。",
  openGraph: {
    title: "靜電學｜Kakau Lab",
    description: "從點電荷與電場開始，探索看不見的電作用。",
  },
};

type PageProps = {
  searchParams: Promise<{ s?: string | string[] }>;
};

/** Presence of s decides intent choice vs shared free exploration; payload validity is separate. */
function shareInput(s: string | string[] | undefined): ShareRouteInput {
  if (s === undefined) return { present: false };
  if (Array.isArray(s)) return s.length === 1 ? { present: true, encoded: s[0] } : { present: true, repeated: true };
  return { present: true, encoded: s };
}

export default async function ElectrostaticsPage({ searchParams }: PageProps) {
  const { s } = await searchParams;
  return <ElectrostaticFieldLab share={shareInput(s)} />;
}
