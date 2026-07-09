import { useEffect, useState } from "react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";

// Minimal client-side router. On GitHub Pages the app lives under the Vite
// base (e.g. /mechalc/), so real paths like /mechalc/bolt-calculator work via
// the History API plus a 404.html fallback. The single-file standalone build
// uses a relative base and runs from file://, where paths are meaningless —
// there we fall back to hash routes (#/bolt-calculator) transparently.

const BASE = import.meta.env.BASE_URL; // "/mechalc/" on Pages, "./" standalone
const USE_HASH = !BASE.startsWith("/");
const PREFIX = USE_HASH ? "" : BASE.replace(/\/$/, ""); // "/mechalc"

function currentPath(): string {
  if (USE_HASH) {
    const h = window.location.hash.replace(/^#/, "");
    return h.startsWith("/") ? h : "/" + h;
  }
  let p = window.location.pathname;
  if (PREFIX && p.startsWith(PREFIX)) p = p.slice(PREFIX.length);
  if (!p.startsWith("/")) p = "/" + p;
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p || "/";
}

export function hrefFor(to: string): string {
  return USE_HASH ? `#${to}` : `${PREFIX}${to}`;
}

export function navigate(to: string) {
  if (USE_HASH) {
    window.location.hash = to;
  } else {
    window.history.pushState({}, "", hrefFor(to));
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
}

export function usePath(): string {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const onChange = () => setPath(currentPath());
    window.addEventListener("popstate", onChange);
    window.addEventListener("hashchange", onChange);
    return () => {
      window.removeEventListener("popstate", onChange);
      window.removeEventListener("hashchange", onChange);
    };
  }, []);
  return path;
}

export function Link({
  to,
  children,
  style,
  className,
}: {
  to: string;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Let modified clicks (new tab, etc.) behave like normal links.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    navigate(to);
    window.scrollTo(0, 0);
  };
  return (
    <a href={hrefFor(to)} onClick={onClick} style={style} className={className}>
      {children}
    </a>
  );
}
