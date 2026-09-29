/* The SVGs are local, hand-authored brand assets; Next image optimization does not improve them. */
/* eslint-disable @next/next/no-img-element */

interface Props {
  /** Use the symbol-only asset where a model toolbar has no horizontal room. */
  compact?: boolean;
}

/* The navy mark disappears on a dark page, so an ivory twin is rendered beside it and the theme
 * (app/globals.css) decides which one is shown. Two static <img>s rather than a script-driven swap
 * keeps the first paint correct before any JavaScript runs. */
export default function KakauLabMark({ compact = false }: Props) {
  return (
    <>
      <span className="kakau-lab-mark kakau-lab-mark--light">
        {!compact && <img className="kakau-lab-mark__wordmark" src="/brand/lab_inline_transparent_light.svg" alt="Kakau Lab" />}
        <img className="kakau-lab-mark__symbol" src="/brand/symbol_color.svg" alt={compact ? "Kakau Lab" : ""} aria-hidden={compact ? undefined : true} />
      </span>
      <span className="kakau-lab-mark kakau-lab-mark--dark" aria-hidden="true">
        {!compact && <img className="kakau-lab-mark__wordmark" src="/brand/lab_inline_transparent_dark.svg" alt="" />}
        <img className="kakau-lab-mark__symbol" src="/brand/symbol_color_dark.svg" alt="" />
      </span>
    </>
  );
}
