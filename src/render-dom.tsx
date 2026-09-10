import type { CSSProperties } from "react";
import { Hero3D } from "./Hero3D";
import type { ResolvedElement, ResolvedLayout } from "./types";

const TRANSITION = "left 0.28s ease, top 0.28s ease, width 0.28s ease, height 0.28s ease, font-size 0.28s ease";

/**
 * The hero plate deliberately does NOT animate its width/height.
 *
 * A WebGL canvas has no intermediate states: react-three-fiber re-measures on a
 * ResizeObserver and only re-renders at the new aspect on the following frame,
 * so animating the box stretches the render for the whole transition. Snapping
 * the plate to its final size and easing only its position keeps the switch
 * clean — the product is never drawn at the wrong aspect.
 */
const HERO_TRANSITION = "left 0.28s ease, top 0.28s ease";

/** Matches the resolver's LINE_HEIGHT so wrapped rows land where it placed them. */
const LINE_HEIGHT = 1.25;

function box(el: ResolvedElement): CSSProperties {
  return {
    position: "absolute",
    left: el.x,
    top: el.y,
    width: el.width,
    height: el.height,
    boxSizing: "border-box",
    transition: TRANSITION,
  };
}

function inkFor(role: ResolvedElement["role"]): string {
  if (role === "price") return "var(--ad-accent)";
  if (role === "secondary") return "var(--ad-ink-muted)";
  return "var(--ad-ink)";
}

function TextBlock({ el }: { el: ResolvedElement }) {
  const weight = el.role === "headline" ? 600 : el.role === "price" ? 700 : 400;
  return (
    <div
      style={{
        ...box(el),
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        fontSize: el.fontSize,
        lineHeight: LINE_HEIGHT,
        fontWeight: weight,
        color: inkFor(el.role),
        letterSpacing: el.role === "headline" ? "-0.02em" : "normal",
        textAlign: el.align ?? "left",
      }}
      title={el.truncated ? el.content : undefined}
    >
      {(el.lines ?? [el.content ?? ""]).map((line, i) => (
        // The resolver already broke these to fit; nowrap + ellipsis is only a
        // guard against its metrics estimate landing a hair wide.
        <span key={i} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {line}
        </span>
      ))}
    </div>
  );
}

export function LayoutRenderer({ layout }: { layout: ResolvedLayout }) {
  return (
    <div
      style={{
        position: "relative",
        width: layout.surfaceWidth,
        height: layout.surfaceHeight,
        background: "radial-gradient(120% 140% at 15% 0%, var(--ad-bg-1) 0%, var(--ad-bg-2) 62%)",
        overflow: "hidden",
        transition: "background 0.28s ease",
      }}
    >
      {layout.elements.map((el) => {
        if (el.type === "button") {
          return (
            <button
              key={el.id}
              type="button"
              style={{
                ...box(el),
                display: "grid",
                placeItems: "center",
                padding: 0,
                fontSize: el.fontSize ?? 14,
                fontWeight: 500,
                lineHeight: 1,
                background: "var(--ad-cta-bg)",
                color: "var(--ad-cta-ink)",
                border: "none",
                borderRadius: 9999,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {el.content}
            </button>
          );
        }

        if (el.role === "hero-image") {
          return (
            <div
              key={el.id}
              className="ad-hero"
              role="img"
              aria-label="product"
              style={{
                ...box(el),
                transition: HERO_TRANSITION,
                borderRadius: Math.min(24, el.width * 0.1),
                overflow: "hidden",
                background: "var(--ad-frame)",
              }}
            >
              <Hero3D modelUrl={el.src ?? ""} />
            </div>
          );
        }

        if (el.type === "image") {
          // branding — a square mark, so a circle rather than the stretched
          // lozenge the old non-aspect-preserving sizing produced.
          return (
            <div
              key={el.id}
              role="img"
              aria-label="brand"
              style={{
                ...box(el),
                borderRadius: 9999,
                display: "grid",
                placeItems: "center",
                background: "linear-gradient(83deg, var(--ad-mark-a) 0%, var(--ad-mark-b) 100%)",
                color: "var(--ad-mark-ink)",
                fontWeight: 700,
                fontSize: Math.max(9, el.height * 0.46),
                lineHeight: 1,
              }}
            >
              N
            </div>
          );
        }

        return <TextBlock key={el.id} el={el} />;
      })}
    </div>
  );
}
