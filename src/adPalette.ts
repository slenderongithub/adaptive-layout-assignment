/**
 * The creative's palette lives in index.css (`--ad-*`) so the DOM renderer can
 * use the custom properties directly and the Canvas renderer can read the same
 * resolved values — one source of truth, no chance of the two paths drifting
 * into different-looking designs.
 */
export interface AdPalette {
  bg1: string;
  bg2: string;
  ink: string;
  inkMuted: string;
  accent: string;
  ctaBg: string;
  ctaInk: string;
  frame: string;
  markA: string;
  markB: string;
  markInk: string;
}

export const AD_FONT = '"Golos Text", "Golos Text Fallback", system-ui, sans-serif';

export function readAdPalette(): AdPalette {
  const style = getComputedStyle(document.documentElement);
  const v = (name: string) => style.getPropertyValue(name).trim();
  return {
    bg1: v("--ad-bg-1"),
    bg2: v("--ad-bg-2"),
    ink: v("--ad-ink"),
    inkMuted: v("--ad-ink-muted"),
    accent: v("--ad-accent"),
    ctaBg: v("--ad-cta-bg"),
    ctaInk: v("--ad-cta-ink"),
    frame: v("--ad-frame"),
    markA: v("--ad-mark-a"),
    markB: v("--ad-mark-b"),
    markInk: v("--ad-mark-ink"),
  };
}
