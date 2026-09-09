import { checkInvariants } from "./invariants";
import type { AdSpec, ElementRole, ElementSpec, Validated } from "./spec";
import type { SurfaceProfile } from "./surfaces";
import type { Rect, ResolvedElement, ResolvedLayout, Template } from "./types";

/* ==========================================================================
   Tuning constants. Everything the engine decides is derived from the content
   box — there are no per-surface special cases anywhere below this block.
   ========================================================================== */

/** Template is chosen from the content box's aspect ratio, nothing else. */
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
}

function fontFloor(spec: Extract<ElementSpec, { type: "text" }>, ctx: Ctx): number {
  return Math.max(ctx.textFloor, TYPE_MIN, spec.minFontSize ?? 0);
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
      const fontSize = Math.round(clamp(ctx.base * CTA_FONT_RATIO, CTA_FONT_MIN, CTA_FONT_MAX));
      const padX = fontSize * CTA_PAD_RATIO;
      const width = Math.max(CTA_MIN_WIDTH, ctx.tapFloor, Math.round(measureText(spec.label, fontSize, "cta") + padX * 2));
      const height = Math.max(ctx.tapFloor, Math.round(fontSize * CTA_HEIGHT_RATIO));
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

function compose(states: Map<string, ElementState>, ctx: Ctx): Composition {
  const { box, template, gap } = ctx;
  const visible = [...states.values()].filter((s) => s.visible);
  const hero = visible.find((s) => s.spec.role === "hero-image");
  const heroAspect = hero && hero.spec.type === "image" ? hero.spec.aspectRatio : 1;
  const cta = visible.find((s) => s.spec.role === "cta");

  const align: "left" | "center" = template === "stack" ? "center" : "left";
  const minTextColumn = Math.max(MIN_TEXT_COLUMN_PX, box.width * MIN_TEXT_COLUMN_FRACTION);
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
    if (total > box.height + 0.5) overflow = true;
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
    if (blockHeight > box.height + 0.5) overflow = true;
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
      // what the copy leaves or it earns nothing and goes.
      if (spec.role === "hero-image") return spec.canDrop === true;
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

  const aspect = box.width / box.height;
  const template: Template =
    aspect >= BANNER_MIN_ASPECT ? "banner" : aspect >= SPLIT_MIN_ASPECT ? "split" : "stack";

  const viewingScale = surface.viewingDistance === "far" ? FAR_VIEWING_TYPE_SCALE : 1;
  const base = clamp(
    Math.min((Math.sqrt(box.width * box.height) / TYPE_AREA_DIVISOR) * viewingScale, box.height / TYPE_HEIGHT_DIVISOR),
    TYPE_MIN,
    TYPE_MAX,
  );

  const ctx: Ctx = {
    box,
    template,
    base,
    gap: Math.round(clamp(base * GAP_RATIO, GAP_MIN, GAP_MAX)),
    tapFloor: surface.touchOnly ? surface.minTapTarget : 0,
    textFloor: surface.minTextSize ?? 0,
  };

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
    if (!rect) continue;

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
