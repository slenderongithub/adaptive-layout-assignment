import { checkInvariants } from "./invariants";
import type { AdSpec, ElementRole, ElementSpec, Validated } from "./spec";
import type { SurfaceProfile } from "./surfaces";
import type { Rect, ResolvedElement, ResolvedLayout, Template } from "./types";

/* ==========================================================================
   Tuning constants. Everything the engine decides is derived from the content
   box — there are no per-surface special cases anywhere below this block.
   ========================================================================== */

/**
 * Template is chosen from the content box's aspect ratio — gated by whether
 * the box is even big enough to split at all; see MIN_SPLIT_HERO_WIDTH and
 * `canSplitHorizontally` in resolve().
 */
const SPLIT_MIN_ASPECT = 0.95;
const BANNER_MIN_ASPECT = 2.2;

/* ---- type scale --------------------------------------------------------
   One base size derived from the content box, with per-role multipliers on
   top. A 1080px kiosk gets kiosk-sized type and a 300px widget gets
   widget-sized type from the same rule; a fixed 28/22/16 ladder is wrong at
   both ends. The height term stops a very wide, very short strip from asking
   for type that can never stack inside it. */
const TYPE_AREA_DIVISOR = 22;
const TYPE_HEIGHT_DIVISOR = 9;
const TYPE_MIN = 10;
const TYPE_MAX = 72;
const ROLE_TYPE_SCALE: Partial<Record<ElementRole, number>> = {
  headline: 1.6,
  price: 1.15,
  secondary: 0.85,
};
const FAR_VIEWING_TYPE_SCALE = 1.6;
const LINE_HEIGHT = 1.25;
/**
 * The headline reads as a wordmark, so it auto-fits its column down to the
 * type floor rather than stacking into a ragged tower. This is a *sizing*
 * rule, not a degradation step: the priority ladder governs what survives, and
 * gating "set the headline one step smaller" behind "drop the description
 * first" trades a readable line break for a lost sentence.
 */
const MAX_HEADLINE_LINES = 2;

/* ---- text metrics ------------------------------------------------------
   ponytail: a three-bucket glyph table, not real font metrics — the resolver
   is pure, so it cannot call measureText(). A flat per-character average runs
   ~17% wide on mixed-case copy (every "i", "l" and space costs as much as an
   "m"), which silently forces an extra line break; bucketing narrow / wide /
   capital glyphs lands within ~1% of Golos Text's real advances. Both
   renderers draw the lines the resolver produced, so DOM and Canvas can never
   disagree about where the breaks are. Swap for an injected measure function
   if a typeface ever lands where this is visibly off. */
const GLYPH_NARROW = " .,:;'!|ilj()[]";
const GLYPH_WIDE = "MWmw@%";
const GLYPH_WIDTH_NARROW = 0.3;
const GLYPH_WIDTH_WIDE = 0.85;
const GLYPH_WIDTH_CAPITAL = 0.62;
const GLYPH_WIDTH_DEFAULT = 0.52;
/** semibold/bold roles carry a little more advance than the regular cut */
const BOLD_WIDTH_MULTIPLIER = 1.03;
/**
 * Estimates must err wide. A line the resolver thinks fits by a hair but the
 * real font renders 2px over gets silently ellipsised by the renderer's
 * overflow guard — the reader loses words the engine believed it had placed.
 * Wrapping ~4% early costs nothing and makes that impossible.
 */
const MEASURE_SAFETY = 1.04;

/* ---- element sizing ----------------------------------------------------- */
const GAP_RATIO = 0.6;
const GAP_MIN = 4;
const GAP_MAX = 32;
/** The brand mark sits tight to the headline so the two read as one lockup. */
const BRAND_LOCKUP_GAP_RATIO = 0.45;

const CTA_FONT_RATIO = 0.85;
const CTA_FONT_MIN = 12;
const CTA_FONT_MAX = 28;
const CTA_PAD_RATIO = 1.4;
const CTA_HEIGHT_RATIO = 2.8;
const CTA_MIN_WIDTH = 96;

const BRAND_RATIO = 1.4;
const BRAND_MIN = 16;
const BRAND_MAX = 96;

/** Below this a hero image communicates nothing, so it is dropped instead. */
const HERO_MIN_PX = 56;
const SPLIT_HERO_MAX_WIDTH_FRACTION = 0.45;
const BANNER_HERO_MAX_WIDTH_FRACTION = 0.22;
/** The copy column never yields more than this to the hero. */
const MIN_TEXT_COLUMN_PX = 120;
const MIN_TEXT_COLUMN_FRACTION = 0.35;
/**
 * The feasibility floor for CHOOSING a side-by-side template, not the
 * degradation floor for abandoning one already in progress. HERO_MIN_PX
 * (56) is "still worth keeping once we're already committed to split" — it
 * lets a hero shrink that far before giving up on it. This is the higher
 * bar for "worth arranging side by side at all": a fresh hero column
 * narrower than this reads as a sliver, not a product photo, so a surface
 * too narrow to give it at least this much (plus a gap and a legible text
 * column) composes as `stack` instead, no matter what its aspect ratio says.
 */
const MIN_SPLIT_HERO_WIDTH = 96;

function minTextColumnFor(boxWidth: number): number {
  return Math.max(MIN_TEXT_COLUMN_PX, boxWidth * MIN_TEXT_COLUMN_FRACTION);
}

/* ---- micro template ------------------------------------------------------
   `stack`'s copy-first ordering (copy claims its natural height, hero takes
   whatever's left) assumes there's normally enough height for both. Below
   MICRO_MAX_DIM in *both* dimensions that assumption breaks: the copy
   block's own floors (TYPE_MIN, the surface's minTextSize) already consume
   most of a box this small, so "leftover" for the hero rounds to nothing.
   A watch face isn't a shrunken phone screen — it's a different form factor
   with a different composition rule, so below this size the hero claims a
   fixed dominant share of the height *first*, and the copy is split into a
   two-column bottom bar sized from whatever remains. */
const MICRO_MAX_DIM = 260;
const HERO_DOMINANT_SHARE = 0.75;
/**
 * The bottom bar is only viable as *two* columns if the box is wide enough
 * to give the CTA its own non-negotiable minimum width (CTA_MIN_WIDTH) and
 * still leave the headline column something to work with. Narrower than
 * this, forcing a side-by-side bar is the same mistake `canSplitHorizontally`
 * already guards against at the top level — a sliver instead of a real
 * feasibility check — so those surfaces stay on the plain `stack` template.
 */
const MICRO_MIN_LEFT_COLUMN_WIDTH = 60;

/* ---- degradation -------------------------------------------------------- */
const FONT_SHRINK_RATIO = 0.12;
const IMAGE_SHRINK_FACTOR = 0.85;
const MIN_USABLE_IMAGE_PX = 20;

/**
 * Reading order inside the copy block. Deliberately NOT the priority order:
 * priority answers "what survives when space runs out", this answers "where
 * does it go". Conflating the two is what put the CTA above the price.
 */
const READING_ORDER: ElementRole[] = ["branding", "headline", "price", "secondary", "cta"];

function assertNever(x: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(x)}`);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/* ==========================================================================
   Text metrics
   ========================================================================== */

function isBoldRole(role: ElementRole): boolean {
  return role === "headline" || role === "price" || role === "cta";
}

function glyphWidth(ch: string): number {
  if (GLYPH_NARROW.includes(ch)) return GLYPH_WIDTH_NARROW;
  if (GLYPH_WIDE.includes(ch)) return GLYPH_WIDTH_WIDE;
  if (ch >= "A" && ch <= "Z") return GLYPH_WIDTH_CAPITAL;
  return GLYPH_WIDTH_DEFAULT;
}

/** Average advance per character of `text`, in em. */
function averageGlyphWidth(text: string, role: ElementRole): number {
  if (text.length === 0) return GLYPH_WIDTH_DEFAULT;
  let em = 0;
  for (const ch of text) em += glyphWidth(ch);
  return (em / text.length) * (isBoldRole(role) ? BOLD_WIDTH_MULTIPLIER : 1) * MEASURE_SAFETY;
}

function measureText(text: string, fontSize: number, role: ElementRole): number {
  return averageGlyphWidth(text, role) * text.length * fontSize;
}

function wrapText(text: string, fontSize: number, maxWidth: number, role: ElementRole): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measureText(candidate, fontSize, role) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [""];
}

function ellipsize(text: string, fontSize: number, maxWidth: number, role: ElementRole): string {
  if (measureText(text, fontSize, role) <= maxWidth) return text;
  // Seed from the whole string's average, then step down until it genuinely
  // fits: the surviving prefix has its own glyph mix, so a single divide
  // overshoots (and a 2px overshoot costs the element its place in the loop).
  let cut = Math.max(1, Math.min(text.length, Math.floor(maxWidth / (averageGlyphWidth(text, role) * fontSize))));
  let candidate = `${text.slice(0, cut).trimEnd()}…`;
  while (cut > 1 && measureText(candidate, fontSize, role) > maxWidth) {
    cut -= 1;
    candidate = `${text.slice(0, cut).trimEnd()}…`;
  }
  return candidate;
}

/* ==========================================================================
   State
   ========================================================================== */

interface ElementState {
  spec: ElementSpec;
  visible: boolean;
  /** text + button */
  fontSize?: number;
  /** text — collapsed to a single ellipsised line */
  truncated?: boolean;
  /** branding + button. The hero has no stored size: it is elastic (below). */
  width?: number;
  height?: number;
}

interface Ctx {
  box: Rect;
  template: Template;
  base: number;
  gap: number;
  tapFloor: number;
  textFloor: number;
  /** micro template only: the hero/bottom-bar vertical split. */
  heroHeight?: number;
  barHeight?: number;
}

function fontFloor(spec: Extract<ElementSpec, { type: "text" }>, ctx: Ctx): number {
  return Math.max(ctx.textFloor, TYPE_MIN, spec.minFontSize ?? 0);
}

function buttonFontSize(ctx: Pick<Ctx, "base" | "textFloor">): number {
  const floor = Math.max(ctx.textFloor, CTA_FONT_MIN);
  return Math.max(Math.round(clamp(ctx.base * CTA_FONT_RATIO, CTA_FONT_MIN, CTA_FONT_MAX)), floor);
}

function buttonMetrics(label: string, ctx: Pick<Ctx, "base" | "tapFloor" | "textFloor">) {
  const fontSize = buttonFontSize(ctx);
  const padX = fontSize * CTA_PAD_RATIO;
  return {
    fontSize,
    width: Math.max(CTA_MIN_WIDTH, ctx.tapFloor, Math.round(measureText(label, fontSize, "cta") + padX * 2)),
    height: Math.max(ctx.tapFloor, Math.round(fontSize * CTA_HEIGHT_RATIO)),
  };
}

function createState(spec: ElementSpec, ctx: Ctx): ElementState {
  switch (spec.type) {
    case "text": {
      const scale = ROLE_TYPE_SCALE[spec.role] ?? 1;
      const fontSize = Math.max(Math.round(ctx.base * scale), fontFloor(spec, ctx));
      return { spec, visible: true, fontSize, truncated: false };
    }
    case "image": {
      // The hero is sized from whatever the copy leaves over, every pass.
      if (spec.role === "hero-image") return { spec, visible: true };
      const height = Math.round(clamp(ctx.base * BRAND_RATIO, BRAND_MIN, BRAND_MAX));
      return { spec, visible: true, width: height * spec.aspectRatio, height };
    }
    case "button": {
      const { fontSize, width, height } = buttonMetrics(spec.label, ctx);
      return { spec, visible: true, fontSize, width, height };
    }
    default:
      return assertNever(spec);
  }
}

/* ==========================================================================
   Composition

   One pass produces a complete, centred layout plus a single boolean: does it
   fit. The hero is *elastic* — it claims whatever the copy block leaves over,
   which is what removes the dead space and stops the "35% of the width no
   matter what" undersizing. Nothing here mutates state, so the degradation
   loop can recompose from scratch after every step.
   ========================================================================== */

interface Composition {
  placed: Map<string, Rect>;
  lines: Map<string, string[]>;
  /** effective size after the headline's auto-fit; may be below state.fontSize */
  fontSizes: Map<string, number>;
  align: "left" | "center";
  overflow: boolean;
}

interface BlockItem {
  state: ElementState;
  width: number;
  height: number;
  lines?: string[];
  fontSize?: number;
}

function readingIndex(state: ElementState): number {
  const i = READING_ORDER.indexOf(state.spec.role);
  return i === -1 ? READING_ORDER.length : i;
}

/**
 * Micro template: the hero claims `ctx.heroHeight` across the full width
 * first — computed in resolve(), not here, because it has to be known
 * before element font sizes are (the bottom bar's real size is what the
 * text scales against) — then the copy splits into two columns inside
 * `ctx.barHeight`: headline + secondary on the left, price + CTA on the
 * right. This is the one template where a *role*, not a priority number,
 * drives the composition — the same way `banner` already special-cases the
 * CTA into its own column regardless of its priority value.
 *
 * Branding gets no slot at all: it's flagged as overflow unconditionally so
 * the ordinary priority loop — where it is priority 5, the lowest, and so
 * always the first candidate — drops it on the first pass. Same mechanism
 * every other template relies on (an overflow flag driving degradation),
 * just asserted directly here because there's no placement to measure a
 * mark against when it was never given a slot in the first place.
 */
function composeMicro(states: Map<string, ElementState>, ctx: Ctx): Composition {
  const { box, gap, heroHeight = 0, barHeight = 0 } = ctx;
  const visible = [...states.values()].filter((s) => s.visible);
  const hero = visible.find((s) => s.spec.role === "hero-image");
  const branding = visible.find((s) => s.spec.role === "branding");
  const headline = visible.find((s) => s.spec.role === "headline");
  const secondary = visible.find((s) => s.spec.role === "secondary");
  const price = visible.find((s) => s.spec.role === "price");
  const cta = visible.find((s) => s.spec.role === "cta");

  const placed = new Map<string, Rect>();
  const lines = new Map<string, string[]>();
  const fontSizes = new Map<string, number>();
  let overflow = Boolean(branding);

  if (hero) {
    placed.set(hero.spec.id, { x: box.x, y: box.y, width: box.width, height: heroHeight });
  }

  const barY = box.y + heroHeight + gap;

  // The right column is sized to what the CTA actually needs (it has a
  // non-negotiable minimum width, CTA_MIN_WIDTH, that a flat 50/50 split
  // can clip on a narrow box), not an even half — the left column gets
  // whatever that leaves, down to MICRO_MIN_LEFT_COLUMN_WIDTH (the same
  // floor resolve() used to decide micro was viable at all — see
  // `canMicroSplit`). Content-driven, the same principle as the
  // split/banner hero column, just applied to the bottom bar.
  const rightColWidth = Math.min(Math.max(cta?.width ?? 0, box.width * 0.3), box.width - gap - MICRO_MIN_LEFT_COLUMN_WIDTH);
  const leftColWidth = box.width - gap - rightColWidth;
  if (leftColWidth < MICRO_MIN_LEFT_COLUMN_WIDTH - 0.5 || rightColWidth < (cta?.width ?? 0) - 0.5) overflow = true;

  const layoutColumn = (items: (ElementState | undefined)[], x: number, colWidth: number) => {
    const built: BlockItem[] = [];
    for (const state of items) {
      if (!state) continue;
      const spec = state.spec;
      if (spec.type === "text") {
        const floor = fontFloor(spec, ctx);
        let fontSize = state.fontSize ?? floor;
        let ls = state.truncated
          ? [ellipsize(spec.content, fontSize, colWidth, spec.role)]
          : wrapText(spec.content, fontSize, colWidth, spec.role);
        while (spec.role === "headline" && !state.truncated && ls.length > MAX_HEADLINE_LINES && fontSize > floor) {
          fontSize -= 1;
          ls = wrapText(spec.content, fontSize, colWidth, spec.role);
        }
        const widest = Math.max(...ls.map((l) => measureText(l, fontSize, spec.role)));
        if (widest > colWidth + 0.5) overflow = true;
        built.push({ state, width: colWidth, height: ls.length * fontSize * LINE_HEIGHT, lines: ls, fontSize });
      } else if (spec.type === "button") {
        const width = Math.min(state.width ?? 0, colWidth);
        const height = state.height ?? 0;
        if ((state.width ?? 0) > colWidth + 0.5) overflow = true;
        built.push({ state, width, height });
      }
    }

    const total = built.reduce((sum, it, i) => sum + it.height + (i < built.length - 1 ? gap : 0), 0);
    if (total > barHeight + 0.1) overflow = true;
    let y = barY + Math.max(0, (barHeight - total) / 2);
    for (const it of built) {
      const height = Math.min(it.height, barHeight);
      placed.set(it.state.spec.id, { x, y, width: it.width, height });
      if (it.lines) lines.set(it.state.spec.id, it.lines);
      if (it.fontSize !== undefined) fontSizes.set(it.state.spec.id, it.fontSize);
      y += height + gap;
    }
  };

  layoutColumn([headline, secondary], box.x, leftColWidth);
  layoutColumn([price, cta], box.x + leftColWidth + gap, rightColWidth);

  return { placed, lines, fontSizes, align: "left", overflow };
}

function compose(states: Map<string, ElementState>, ctx: Ctx): Composition {
  if (ctx.template === "micro") return composeMicro(states, ctx);

  const { box, template, gap } = ctx;
  const visible = [...states.values()].filter((s) => s.visible);
  const hero = visible.find((s) => s.spec.role === "hero-image");
  const heroAspect = hero && hero.spec.type === "image" ? hero.spec.aspectRatio : 1;
  const cta = visible.find((s) => s.spec.role === "cta");

  const align: "left" | "center" = template === "stack" ? "center" : "left";
  const minTextColumn = minTextColumnFor(box.width);
  let overflow = false;

  /* -- 1. carve the columns ------------------------------------------------
     Copy always keeps `minTextColumn`; the hero may have the rest. */
  let heroWidth = 0;
  let heroHeight = 0;
  let ctaColumn = 0;

  if (template === "banner" && cta) ctaColumn = (cta.width ?? 0) + gap;

  if (hero && template !== "stack") {
    const maxFraction = template === "banner" ? BANNER_HERO_MAX_WIDTH_FRACTION : SPLIT_HERO_MAX_WIDTH_FRACTION;
    const want = Math.min(box.height * heroAspect, box.width * maxFraction);
    const room = box.width - ctaColumn - gap - minTextColumn;
    heroWidth = Math.min(want, room);
    if (heroWidth < HERO_MIN_PX) {
      // Starved: keep it drawable so intermediate passes stay sane, and flag
      // the overflow so the loop degrades until the hero's turn comes up.
      heroWidth = HERO_MIN_PX;
      overflow = true;
    }
    // Height is set in step 3, once the copy block has been measured.
  }

  const heroColumn = hero && template !== "stack" ? heroWidth + gap : 0;
  const textWidth = box.width - heroColumn - ctaColumn;
  if (textWidth < minTextColumn) overflow = true;

  /* -- 2. build the copy block -------------------------------------------- */
  const blockStates = visible
    .filter((s) => s.spec.role !== "hero-image")
    .filter((s) => !(template === "banner" && s.spec.role === "cta"))
    .sort((a, b) => readingIndex(a) - readingIndex(b) || a.spec.priority - b.spec.priority);

  const items: BlockItem[] = [];
  for (const state of blockStates) {
    const spec = state.spec;
    if (spec.type === "text") {
      const floor = fontFloor(spec, ctx);
      let fontSize = state.fontSize ?? floor;
      let lines = state.truncated
        ? [ellipsize(spec.content, fontSize, textWidth, spec.role)]
        : wrapText(spec.content, fontSize, textWidth, spec.role);

      // Auto-fit the headline to MAX_HEADLINE_LINES before anything is dropped.
      while (
        spec.role === "headline" &&
        !state.truncated &&
        lines.length > MAX_HEADLINE_LINES &&
        fontSize > floor
      ) {
        fontSize -= 1;
        lines = wrapText(spec.content, fontSize, textWidth, spec.role);
      }

      const widest = Math.max(...lines.map((l) => measureText(l, fontSize, spec.role)));
      // Only an unbreakable word can exceed the column; the loop shrinks type.
      if (widest > textWidth + 0.5) overflow = true;
      items.push({ state, width: textWidth, height: lines.length * fontSize * LINE_HEIGHT, lines, fontSize });
    } else {
      const width = state.width ?? 0;
      const height = state.height ?? 0;
      if (width > textWidth + 0.5) overflow = true;
      items.push({ state, width, height });
    }
  }

  // The brand mark is a lockup with the headline, not a separate stack entry —
  // at a full gap it reads as an orb floating above the copy.
  const gapAfter = (item: BlockItem) =>
    item.state.spec.role === "branding" ? Math.max(GAP_MIN, Math.round(gap * BRAND_LOCKUP_GAP_RATIO)) : gap;

  const blockHeight = items.reduce(
    (sum, item, i) => sum + item.height + (i < items.length - 1 ? gapAfter(item) : 0),
    0,
  );

  /* -- 3. the hero plate matches the copy block --------------------------
     The plate is an image well, not a tight crop of the product: it spans
     exactly the copy block's height so the two columns share a top and a
     bottom edge, and the product is contained inside it. Sizing the plate to
     the product instead leaves it visibly short against the copy. */
  if (hero && template !== "stack") {
    heroHeight = clamp(blockHeight, HERO_MIN_PX, box.height);
  }

  /* -- 4. place ------------------------------------------------------------ */
  const placed = new Map<string, Rect>();
  const lines = new Map<string, string[]>();
  const fontSizes = new Map<string, number>();

  const putBlock = (originX: number, originY: number, columnWidth: number) => {
    let y = originY;
    for (const item of items) {
      const x = align === "center" ? originX + (columnWidth - item.width) / 2 : originX;
      placed.set(item.state.spec.id, { x, y, width: item.width, height: item.height });
      if (item.lines) lines.set(item.state.spec.id, item.lines);
      if (item.fontSize !== undefined) fontSizes.set(item.state.spec.id, item.fontSize);
      y += item.height + gapAfter(item);
    }
  };

  if (template === "stack") {
    if (hero) {
      heroHeight = Math.max(0, box.height - blockHeight - gap);
      heroWidth = heroHeight * heroAspect;
      if (heroWidth > box.width) {
        heroWidth = box.width;
        heroHeight = box.width / heroAspect;
      }
      if (heroHeight < HERO_MIN_PX) {
        heroHeight = HERO_MIN_PX;
        heroWidth = HERO_MIN_PX * heroAspect;
        overflow = true;
      }
    }
    const total = blockHeight + (hero ? heroHeight + gap : 0);
    // Tight on purpose: checkInvariants() allows only ~0.01px of slack, so a
    // looser tolerance here can let a composition through as "fits" that
    // then renders a hair past the box edge — a real, if tiny, clip.
    if (total > box.height + 0.1) overflow = true;
    let y = box.y + Math.max(0, (box.height - total) / 2);
    if (hero) {
      placed.set(hero.spec.id, {
        x: box.x + (box.width - heroWidth) / 2,
        y,
        width: heroWidth,
        height: heroHeight,
      });
      y += heroHeight + gap;
    }
    putBlock(box.x, y, box.width);
  } else {
    if (blockHeight > box.height + 0.1) overflow = true;
    if (hero) {
      placed.set(hero.spec.id, {
        x: box.x,
        y: box.y + (box.height - heroHeight) / 2,
        width: heroWidth,
        height: heroHeight,
      });
    }
    putBlock(box.x + heroColumn, box.y + Math.max(0, (box.height - blockHeight) / 2), textWidth);
    if (template === "banner" && cta) {
      const width = cta.width ?? 0;
      const height = cta.height ?? 0;
      // Banner CTAs live in their own right-hand column, so they are not part
      // of `blockHeight`. Still, their hard tap/text floors must fit the
      // content box vertically; otherwise placement below would produce a
      // clipped button while the composition incorrectly reported success.
      if (height > box.height + 0.1 || width > box.width + 0.1) overflow = true;
      placed.set(cta.spec.id, {
        x: box.x + box.width - width,
        y: box.y + (box.height - height) / 2,
        width,
        height,
      });
    }
  }

  return { placed, lines, fontSizes, align, overflow };
}

/* ==========================================================================
   Degradation — priority-ordered, one step per pass
   ========================================================================== */

function hasMoreStages(state: ElementState, ctx: Ctx): boolean {
  if (!state.visible) return false;
  const spec = state.spec;
  switch (spec.type) {
    case "text": {
      if ((state.fontSize ?? 0) > fontFloor(spec, ctx)) return true;
      if (spec.canTruncate && !state.truncated) return true;
      return spec.canDrop === true;
    }
    case "image": {
      // The hero has no shrink ladder: it is elastic, so it either fits in
      // what the copy leaves or it earns nothing and goes. In `micro` it
      // doesn't even earn-or-go: the whole point of that template is a
      // guaranteed dominant share for the hero (see resolve()), so it is
      // never a degradation candidate there — everything else in the copy
      // block, including price, is what gives way under extreme constraint.
      if (spec.role === "hero-image") return ctx.template !== "micro" && spec.canDrop === true;
      return (state.height ?? 0) > MIN_USABLE_IMAGE_PX || spec.canDrop === true;
    }
    case "button":
      return spec.canDrop === true;
    default:
      return assertNever(spec);
  }
}

/** Applies exactly one degradation step and returns the trace line for it. */
function degradeOneStep(state: ElementState, ctx: Ctx): string {
  const spec = state.spec;
  switch (spec.type) {
    case "text": {
      const floor = fontFloor(spec, ctx);
      const fontSize = state.fontSize ?? floor;
      if (fontSize > floor) {
        const step = Math.max(1, Math.round(fontSize * FONT_SHRINK_RATIO));
        state.fontSize = Math.max(floor, fontSize - step);
        return `${spec.id}: type down to ${state.fontSize}px`;
      }
      if (spec.canTruncate && !state.truncated) {
        state.truncated = true;
        return `${spec.id}: collapsed to one ellipsised line`;
      }
      state.visible = false;
      return `${spec.id}: dropped — still overflows at the ${floor}px floor`;
    }
    case "image": {
      if (spec.role === "hero-image") {
        state.visible = false;
        return `${spec.id}: dropped — no usable image area left on this surface`;
      }
      const height = state.height ?? 0;
      if (height > MIN_USABLE_IMAGE_PX) {
        const next = Math.max(MIN_USABLE_IMAGE_PX, height * IMAGE_SHRINK_FACTOR);
        state.height = next;
        state.width = next * spec.aspectRatio;
        return `${spec.id}: mark down to ${Math.round(next)}px`;
      }
      state.visible = false;
      return `${spec.id}: dropped — below the smallest legible mark size`;
    }
    case "button": {
      state.visible = false;
      return `${spec.id}: dropped — no room for the button`;
    }
    default:
      return assertNever(spec);
  }
}

function sideBySideTextWidth(spec: Validated<AdSpec>, ctx: Ctx): number {
  const { box, template, gap } = ctx;
  const hero = spec.elements.find(
    (el): el is Extract<ElementSpec, { type: "image" }> => el.role === "hero-image" && el.type === "image",
  );
  const cta = spec.elements.find(
    (el): el is Extract<ElementSpec, { type: "button" }> => el.role === "cta" && el.type === "button",
  );
  const minTextColumn = minTextColumnFor(box.width);
  let ctaColumn = 0;
  let heroColumn = 0;

  if (template === "banner" && cta) ctaColumn = buttonMetrics(cta.label, ctx).width + gap;

  if (hero) {
    const maxFraction = template === "banner" ? BANNER_HERO_MAX_WIDTH_FRACTION : SPLIT_HERO_MAX_WIDTH_FRACTION;
    const want = Math.min(box.height * hero.aspectRatio, box.width * maxFraction);
    const room = box.width - ctaColumn - gap - minTextColumn;
    const heroWidth = Math.max(HERO_MIN_PX, Math.min(want, room));
    heroColumn = heroWidth + gap;
  }

  return box.width - heroColumn - ctaColumn;
}

function shouldFallbackToStackForHeadline(spec: Validated<AdSpec>, ctx: Ctx): boolean {
  if (ctx.template !== "split" && ctx.template !== "banner") return false;
  const headline = spec.elements.find(
    (el): el is Extract<ElementSpec, { type: "text" }> => el.role === "headline" && el.type === "text",
  );
  if (!headline) return false;

  const textWidth = sideBySideTextWidth(spec, ctx);
  const floor = fontFloor(headline, ctx);
  const lines = wrapText(headline.content, floor, textWidth, "headline");
  const widest = Math.max(...lines.map((line) => measureText(line, floor, "headline")));
  return widest > textWidth + 0.5 || lines.length > MAX_HEADLINE_LINES;
}

/* ==========================================================================
   Entry point
   ========================================================================== */

export function resolve(spec: Validated<AdSpec>, surface: Validated<SurfaceProfile>): ResolvedLayout {
  const box: Rect = {
    x: surface.safeArea.left,
    y: surface.safeArea.top,
    width: surface.width - surface.safeArea.left - surface.safeArea.right,
    height: surface.height - surface.safeArea.top - surface.safeArea.bottom,
  };

  // base/gap depend only on the box, never on the template, so they can be
  // computed before the template is chosen and used to decide it.
  const viewingScale = surface.viewingDistance === "far" ? FAR_VIEWING_TYPE_SCALE : 1;
  const base = clamp(
    Math.min((Math.sqrt(box.width * box.height) / TYPE_AREA_DIVISOR) * viewingScale, box.height / TYPE_HEIGHT_DIVISOR),
    TYPE_MIN,
    TYPE_MAX,
  );
  const gap = Math.round(clamp(base * GAP_RATIO, GAP_MIN, GAP_MAX));

  /**
   * Aspect ratio alone picks banner/split/stack, but aspect says nothing
   * about absolute size: a perfect square at 2000px and one at 200px have
   * the same ratio, yet only one has room to put a hero next to copy. A
   * split/banner is only viable if the box can give the hero its feasibility
   * floor AND the copy its minimum legible column, side by side; if it
   * can't, no aspect ratio makes that a good idea, so the composition falls
   * back to stack (hero on top, copy below) instead of forcing a sliver.
   */
  const canSplitHorizontally = box.width >= MIN_SPLIT_HERO_WIDTH + gap + minTextColumnFor(box.width);
  const aspect = box.width / box.height;
  let template: Template = !canSplitHorizontally
    ? "stack"
    : aspect >= BANNER_MIN_ASPECT
      ? "banner"
      : aspect >= SPLIT_MIN_ASPECT
        ? "split"
        : "stack";

  const tapFloor = surface.touchOnly ? surface.minTapTarget : 0;
  const textFloor = surface.minTextSize ?? 0;

  // Size, not shape: a box that would otherwise stack (too narrow/tall to
  // split) but is small in *both* dimensions gets the hero-dominant micro
  // template instead — see the MICRO_MAX_DIM comment above — provided it can
  // actually fit the bar's two columns side by side (MICRO_MIN_LEFT_COLUMN_WIDTH
  // above); otherwise plain `stack` remains the honest answer.
  const canMicroSplit = box.width >= CTA_MIN_WIDTH + gap + MICRO_MIN_LEFT_COLUMN_WIDTH;
  if (template === "stack" && canMicroSplit && box.width <= MICRO_MAX_DIM && box.height <= MICRO_MAX_DIM) {
    template = "micro";
  }

  let effectiveBase = base;
  let effectiveGap = gap;
  let heroHeight: number | undefined;
  let barHeight: number | undefined;

  if (template === "micro") {
    // Pass 1: split the height using the full-box gap as a stand-in, just
    // to get a bar size to size text against.
    const provisionalBarHeight = box.height - Math.round(box.height * HERO_DOMINANT_SHARE) - gap;
    const colWidth = (box.width - gap) / 2;
    // Text in the bar scales off the bar it will actually occupy, not the
    // full box — the same continuous formula as everywhere else (see
    // `base` above), just fed the smaller region. `fontFloor()` still
    // enforces textFloor as a hard minimum on top of this.
    effectiveBase = clamp(
      Math.min(
        (Math.sqrt(colWidth * provisionalBarHeight) / TYPE_AREA_DIVISOR) * viewingScale,
        provisionalBarHeight / TYPE_HEIGHT_DIVISOR,
      ),
      TYPE_MIN,
      TYPE_MAX,
    );
    effectiveGap = Math.round(clamp(effectiveBase * GAP_RATIO, GAP_MIN, GAP_MAX));

    // Pass 2: final split with the refined gap, then guarantee the bar
    // never ends up shorter than what the undroppable headline (at the
    // surface's real text floor) and CTA (at its real tap-target floor)
    // need — real per-surface minimums, not a guess — even if that means
    // giving up some of the hero's dominant share to get it.
    const headlineSpec = spec.elements.find((e) => e.role === "headline");
    const headlineFloor = Math.max(
      textFloor,
      TYPE_MIN,
      headlineSpec?.type === "text" ? (headlineSpec.minFontSize ?? 0) : 0,
    );
    // Matches createState()'s own cta sizing exactly (same formula, same
    // rounding), computed here rather than waited for because the left
    // column's real width — what the headline actually has to fit — depends
    // on it. See composeMicro for the width split this mirrors.
    const ctaSpec = spec.elements.find((e) => e.role === "cta");
    const ctaMetrics =
      ctaSpec?.type === "button"
        ? buttonMetrics(ctaSpec.label, { base: effectiveBase, tapFloor, textFloor })
        : { fontSize: buttonFontSize({ base: effectiveBase, textFloor }), width: CTA_MIN_WIDTH, height: tapFloor };
    const ctaWidth = ctaMetrics.width;
    const ctaHeight = ctaMetrics.height;
    const rightColWidth = Math.min(
      Math.max(ctaWidth, box.width * 0.3),
      box.width - effectiveGap - MICRO_MIN_LEFT_COLUMN_WIDTH,
    );
    const leftColWidth = box.width - effectiveGap - rightColWidth;

    // Measured, not assumed: at the floor size there's no shrinking left to
    // give, so however many lines the real copy actually wraps to in the
    // real left column IS the height the bar must have room for.
    const headlineWrapped =
      headlineSpec?.type === "text" ? wrapText(headlineSpec.content, headlineFloor, leftColWidth, "headline") : [""];
    const headlineLines = headlineWrapped.length;
    // A word the wrapper couldn't break is a hard wall, not a height
    // problem: the headline can't shrink below its floor or truncate in
    // this spec, so no amount of extra bar height fixes an unbreakable word
    // wider than the column itself.
    const headlineWidest = Math.max(...headlineWrapped.map((l) => measureText(l, headlineFloor, "headline")));
    const minBarHeight = Math.max(headlineLines * headlineFloor * LINE_HEIGHT, ctaHeight);

    // If even giving the bar everything except a bare-minimum hero still
    // can't cover minBarHeight, or the headline simply can't fit the
    // column's width at its floor size, a squeezed two-column bar is the
    // wrong tool for this combination (typically a demanding minTextSize
    // forcing many/wide wrapped lines in a half-width column) — a
    // full-width `stack`, where text wraps against the whole box instead of
    // half of it, handles it better, so fall back to that rather than
    // forcing an infeasible split.
    if (
      ctaWidth > box.width - effectiveGap - MICRO_MIN_LEFT_COLUMN_WIDTH ||
      minBarHeight > box.height - effectiveGap - HERO_MIN_PX ||
      headlineWidest > leftColWidth + 0.5
    ) {
      template = "stack";
      effectiveBase = base;
      effectiveGap = gap;
    } else {
      barHeight = Math.max(box.height - Math.round(box.height * HERO_DOMINANT_SHARE) - effectiveGap, 0);
      barHeight = Math.max(barHeight, minBarHeight);
      heroHeight = box.height - effectiveGap - barHeight;
    }
  }

  const ctx: Ctx = {
    box,
    template,
    base: effectiveBase,
    gap: effectiveGap,
    tapFloor,
    textFloor,
    heroHeight,
    barHeight,
  };

  if (shouldFallbackToStackForHeadline(spec, ctx)) {
    template = "stack";
    ctx.template = template;
  }

  const states = new Map<string, ElementState>();
  for (const el of spec.elements) states.set(el.id, createState(el, ctx));

  const warnings: string[] = [];
  const maxIterations = spec.elements.length * 20 + 20;
  let composition = compose(states, ctx);
  let iteration = 0;

  while (composition.overflow) {
    iteration += 1;
    if (iteration > maxIterations) {
      throw new Error(`resolve(): degradation loop did not converge for spec "${spec.id}" on surface "${surface.id}"`);
    }

    // Least important first: highest priority *number* degrades first.
    const candidates = [...states.values()]
      .filter((s) => hasMoreStages(s, ctx))
      .sort((a, b) => b.spec.priority - a.spec.priority);

    if (candidates.length === 0) {
      throw new Error(
        `resolve(): spec "${spec.id}" cannot fit on surface "${surface.id}" — undroppable elements exceed available space`,
      );
    }

    const target = candidates[0];
    warnings.push(`${iteration}. ${degradeOneStep(target, ctx)} (priority ${target.spec.priority})`);
    composition = compose(states, ctx);
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  const elements: ResolvedElement[] = [];
  const droppedElementIds: string[] = [];

  for (const state of states.values()) {
    if (!state.visible) {
      droppedElementIds.push(state.spec.id);
      continue;
    }
    const rect = composition.placed.get(state.spec.id);
    if (!rect) {
      throw new Error(`resolve(): visible element "${state.spec.id}" received no rectangle`);
    }

    const elSpec = state.spec;
    const resolvedEl: ResolvedElement = {
      id: elSpec.id,
      role: elSpec.role,
      type: elSpec.type,
      x: round(rect.x),
      y: round(rect.y),
      width: round(rect.width),
      height: round(rect.height),
    };
    if (elSpec.type === "text") {
      const wrapped = composition.lines.get(elSpec.id) ?? [elSpec.content];
      resolvedEl.fontSize = composition.fontSizes.get(elSpec.id) ?? state.fontSize;
      resolvedEl.lines = wrapped;
      resolvedEl.content = wrapped.join(" ");
      resolvedEl.truncated = state.truncated ?? false;
      resolvedEl.align = composition.align;
    } else if (elSpec.type === "button") {
      resolvedEl.fontSize = state.fontSize;
      resolvedEl.content = elSpec.label;
    } else if (elSpec.type === "image") {
      resolvedEl.src = elSpec.src;
    }
    elements.push(resolvedEl);
  }

  const resolved: ResolvedLayout = {
    surfaceId: surface.id,
    specId: spec.id,
    surfaceWidth: surface.width,
    surfaceHeight: surface.height,
    template,
    elements,
    droppedElementIds,
    warnings,
  };

  const violations = checkInvariants(resolved, surface, spec);
  if (violations.length > 0) {
    throw new Error(
      `resolve(): invariant violation(s) for spec "${spec.id}" on surface "${surface.id}":\n  - ${violations.join("\n  - ")}`,
    );
  }

  return resolved;
}

export { assertNever };
