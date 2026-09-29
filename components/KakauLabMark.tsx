/* The SVGs are local, hand-authored brand assets; Next image optimization does not improve them. */
/* eslint-disable @next/next/no-img-element */

interface Props {
  /** Use the symbol-only asset where a model toolbar has no horizontal room. */
  compact?: boolean;
}

export default function KakauLabMark({ compact = false }: Props) {
  return (
    <span className="kakau-lab-mark">
      {!compact && <img className="kakau-lab-mark__wordmark" src="/brand/lab_inline_transparent_light.svg" alt="Kakau Lab" />}
      <img className="kakau-lab-mark__symbol" src="/brand/symbol_color.svg" alt={compact ? "Kakau Lab" : ""} aria-hidden={compact ? undefined : true} />
    </span>
  );
}
