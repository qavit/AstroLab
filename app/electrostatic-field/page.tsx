import { permanentRedirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Legacy identity only. Re-emit every query value without interpreting the share payload. */
export default async function LegacyElectrostaticFieldPage({ searchParams }: PageProps) {
  const current = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(current)) {
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else if (value !== undefined) query.append(key, value);
  }
  permanentRedirect(`/electrostatics${query.size > 0 ? `?${query.toString()}` : ""}`);
}
