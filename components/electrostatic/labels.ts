import type { SourceCharge } from "../../lib/science/electrostatics/types.ts";

/** "正電荷 1" / "負電荷 2" — the name the inspector heading and the Canvas tooltip must agree on. */
export function sourceDisplayName(sources: readonly SourceCharge[], id: string): string {
  const index = sources.findIndex((source) => source.id === id);
  const source = sources[index];
  if (!source) return "源電荷";
  return `${source.q_C > 0 ? "正" : "負"}電荷 ${index + 1}`;
}

/** Signed magnitude in nC, e.g. "+3.0 nC" / "−3.0 nC". */
export function formatCharge(q_C: number): string {
  const sign = q_C > 0 ? "+" : "−";
  return `${sign}${Math.abs(q_C * 1e9).toFixed(1)} nC`;
}
