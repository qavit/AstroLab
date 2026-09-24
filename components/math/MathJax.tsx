"use client";

import { Component, createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { MathJax, MathJaxBaseContext, MathJaxContext } from "better-react-mathjax";

/** Shared, self-hosted MathJax setup for every Kakau Lab model. */
const MATHJAX_CONFIG = {
  loader: { load: ["input/tex", "output/svg"] },
  tex: { inlineMath: [["\\(", "\\)"]], displayMath: [["\\[", "\\]"]] },
  svg: { fontCache: "global" },
};

export type MathStatus = "loading" | "ok" | "error";

function useMathJaxStatus(): MathStatus {
  const base = useContext(MathJaxBaseContext);
  const [status, setStatus] = useState<MathStatus>("loading");
  useEffect(() => {
    if (!base) return;
    let cancelled = false;
    base.promise
      .then((mathJax) => {
        if (!cancelled) setStatus(mathJax && typeof mathJax === "object" && "startup" in mathJax ? "ok" : "error");
      })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, [base]);
  return status;
}

const MathStatusContext = createContext<MathStatus>("loading");

export const useMathStatus = () => useContext(MathStatusContext);

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

/** Nesting is a no-op, so independently reusable panels never load MathJax twice. */
export function MathProvider({ children }: { children: ReactNode }) {
  const existing = useContext(MathJaxBaseContext);
  if (existing) return <>{children}</>;
  return (
    <MathJaxContext version={3} src="/mathjax/tex-svg.js" config={MATHJAX_CONFIG}>
      <StatusProvider>{children}</StatusProvider>
    </MathJaxContext>
  );
}

export function Tex({ children, className, dynamic = false }: { children: string; className?: string; dynamic?: boolean }) {
  const status = useMathStatus();
  const classes = ["formula-inline", className].filter(Boolean).join(" ");
  if (status !== "ok") return <code className={`${classes} formula-plain`}>{children}</code>;
  return <MathJax inline dynamic={dynamic} className={classes}>{`\\(${children}\\)`}</MathJax>;
}

export function TexBlock({ children }: { children: string }) {
  const status = useMathStatus();
  if (status !== "ok") return <p className="formula formula-plain">{children}</p>;
  return <MathJax className="formula">{`\\[${children}\\]`}</MathJax>;
}
