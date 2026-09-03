"use client";

import {
  Component,
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { MathJax, MathJaxBaseContext, MathJaxContext } from "better-react-mathjax";

/**
 * One MathJax setup for the whole projectile module, so the lab and the theory notes cannot end
 * up with two providers (nesting them is at best redundant and at worst a thrown version clash).
 *
 * Self-hosted — see scripts/copy-mathjax.mjs. The SVG output needs no accompanying web fonts, so
 * the module carries no third-party runtime dependency and works offline.
 */
const MATHJAX_CONFIG = {
  loader: { load: ["input/tex", "output/svg"] },
  tex: { inlineMath: [["\\(", "\\)"]], displayMath: [["\\[", "\\]"]] },
  svg: { fontCache: "global" },
};

export type MathStatus = "loading" | "ok" | "error";

/**
 * `better-react-mathjax` caches the script-load promise in a module-level singleton, created once
 * per page load and never retried. If that first load ever fails — a cold dev server, a flaky
 * connection, an ad blocker — the promise stays rejected for the rest of the tab's life, and every
 * `<MathJax>` instance mounted afterwards keeps throwing from inside a layout effect, with no way
 * to recover short of a full reload.
 *
 * So nothing here mounts `<MathJax>` on the strength of a promise that might still fail: this
 * subscribes to the *current* state of that promise (via the context the library exports for
 * exactly this) and only turns typesetting on once it has actually resolved. Subscribing fresh on
 * every mount also means a panel reopened after an earlier success shows math immediately, rather
 * than replaying the library's one-shot onLoad/onError callbacks, which never fire again for a
 * promise that already settled.
 */
function useMathJaxStatus(): MathStatus {
  const base = useContext(MathJaxBaseContext);
  const [status, setStatus] = useState<MathStatus>("loading");
  useEffect(() => {
    if (!base) return;
    let cancelled = false;
    base.promise
      .then((mathJax) => {
        if (cancelled) return;
        /* A resolved promise is not proof MathJax initialized. This project's dev server answers a
         * missing static file with HTTP 200 and an empty body rather than a 404, so the <script>
         * "loads" without executing anything and `window.MathJax` is left holding only the plain
         * config object seeded before the script runs — which has no `startup`. Requiring the real
         * runtime shape catches that silent-success case the same way a network failure is caught. */
        setStatus(mathJax && typeof mathJax === "object" && "startup" in mathJax ? "ok" : "error");
      })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, [base]);
  return status;
}

const MathStatusContext = createContext<MathStatus>("loading");

export const useMathStatus = () => useContext(MathStatusContext);

/** Defense in depth: an unexpected throw from the typesetting layer should cost the panel that
 * contains it, never the interactive model around it. */
export class MathErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function StatusProvider({ children }: { children: ReactNode }) {
  const status = useMathJaxStatus();
  return <MathStatusContext.Provider value={status}>{children}</MathStatusContext.Provider>;
}

/**
 * Wraps a subtree in MathJax. Nesting is a no-op: an inner provider defers to the outer one, so
 * the theory notes can be rendered either standalone or inside the lab without a second context.
 */
export function MathProvider({ children }: { children: ReactNode }) {
  const existing = useContext(MathJaxBaseContext);
  if (existing) return <>{children}</>;
  return (
    <MathJaxContext version={3} src="/mathjax/tex-svg.js" config={MATHJAX_CONFIG}>
      <StatusProvider>{children}</StatusProvider>
    </MathJaxContext>
  );
}

/**
 * Inline math — named `Tex` rather than `Math` so it cannot shadow the global `Math` object in
 * files that use both. Falls back to the raw LaTeX source until MathJax is confirmed working, and stays
 * that way permanently if it never loads — legible either way, and never a crash.
 */
export function Tex({ children, className }: { children: string; className?: string }) {
  const status = useMathStatus();
  const classes = ["formula-inline", className].filter(Boolean).join(" ");
  if (status !== "ok") return <code className={`${classes} formula-plain`}>{children}</code>;
  return <MathJax inline className={classes}>{`\\(${children}\\)`}</MathJax>;
}

/** Display math, set on its own line. */
export function TexBlock({ children }: { children: string }) {
  const status = useMathStatus();
  if (status !== "ok") return <p className="formula formula-plain">{children}</p>;
  return <MathJax className="formula">{`\\[${children}\\]`}</MathJax>;
}
