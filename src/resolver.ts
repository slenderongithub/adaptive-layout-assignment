import { checkInvariants } from "./invariants";
import type { AdSpec, ElementRole, ElementSpec, Validated } from "./spec";
import type { SurfaceProfile } from "./surfaces";
import type { AxisMode, Rect, ResolvedElement, ResolvedLayout } from "./types";

const GAP = 8;
const CTA_MIN_WIDTH = 120;
const CTA_DEFAULT_HEIGHT = 44;
const HERO_MAX_FRACTION_ROW = 0.35;
const HERO_MAX_FRACTION_COLUMN = 0.45;
const GRID_LEFT_COLUMN_FRACTION = 0.55;
const AXIS_ROW_THRESHOLD = 1.35;
const AXIS_COLUMN_THRESHOLD = 0.75;
const SHRINK_STEP_PX = 2;
const IMAGE_SHRINK_FACTOR = 0.85;
const MIN_USABLE_TEXT_PX = 10;
const MIN_USABLE_IMAGE_PX = 20;
const FONT_SIZE_BY_ROLE: Partial<Record<ElementRole, number>> = {
  headline: 28,
  price: 22,
  secondary: 16,
};
const FAR_VIEWING_FONT_SCALE = 1.6;
const AVG_CHAR_WIDTH_FACTOR = 0.55;
const CORNER_ORDER: Array<"br" | "tr" | "bl" | "tl"> = ["br", "tr", "bl", "tl"];

function assertNever(x: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(x)}`);
}

interface ElementState {
  spec: ElementSpec;
  visible: boolean;
  // text
  fontSize?: number;
  truncated?: boolean;
  displayContent?: string;
  // image (hero + branding) — current box size, aspect-ratio preserved
  width?: number;
  height?: number;
  // branding placement
  corner?: "br" | "tr" | "bl" | "tl";
}

interface ResolveContext {
  contentBox: Rect;
  axisMode: AxisMode;
  tapFloor: number;
  textFloor: number;
  baseFontScale: number;
}

function textFontFloor(spec: Extract<ElementSpec, { type: "text" }>, ctx: ResolveContext): number {
  return Math.max(ctx.textFloor, MIN_USABLE_TEXT_PX, spec.minFontSize ?? 0);
}

function naturalFontSize(spec: Extract<ElementSpec, { type: "text" }>, ctx: ResolveContext): number {
  const base = FONT_SIZE_BY_ROLE[spec.role] ?? 16;
  return Math.max(base * ctx.baseFontScale, textFontFloor(spec, ctx), spec.minFontSize ?? 0);
}

function fitAspectInBox(aspectRatio: number, box: { width: number; height: number }): { width: number; height: number } {
  if (box.width / box.height > aspectRatio) {
    const height = box.height;
    return { width: height * aspectRatio, height };
  }
  const width = box.width;
  return { width, height: width / aspectRatio };
}

function heroNaturalSize(
  spec: Extract<ElementSpec, { type: "image" }>,
  ctx: ResolveContext,
): { width: number; height: number } {
  const { contentBox, axisMode } = ctx;
  if (axisMode === "column") {
    const cap = contentBox.height * HERO_MAX_FRACTION_COLUMN;
    return fitAspectInBox(spec.aspectRatio, { width: contentBox.width, height: cap });
  }
  if (axisMode === "row") {
    const cap = contentBox.width * HERO_MAX_FRACTION_ROW;
    return fitAspectInBox(spec.aspectRatio, { width: cap, height: contentBox.height });
  }
  const colWidth = contentBox.width * GRID_LEFT_COLUMN_FRACTION;
  return fitAspectInBox(spec.aspectRatio, { width: colWidth, height: contentBox.height });
}

function brandingNaturalSize(ctx: ResolveContext): { width: number; height: number } {
  return {
    width: Math.max(60, ctx.contentBox.width * 0.12),
    height: Math.max(24, ctx.contentBox.height * 0.1),
  };
}

function truncateToWidth(content: string, fontSize: number, width: number): string {
  const maxChars = Math.floor(width / (fontSize * AVG_CHAR_WIDTH_FACTOR));
  if (content.length <= maxChars) return content;
  return `${content.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

function createState(spec: ElementSpec, ctx: ResolveContext): ElementState {
  if (spec.type === "text") {
    const fontSize = naturalFontSize(spec, ctx);
    return { spec, visible: true, fontSize, truncated: false, displayContent: spec.content };
  }
  if (spec.type === "image") {
    const size = spec.role === "branding" ? brandingNaturalSize(ctx) : heroNaturalSize(spec, ctx);
    return { spec, visible: true, width: size.width, height: size.height, corner: "br" };
  }
  // button (cta)
  const width = Math.max(CTA_MIN_WIDTH, ctx.tapFloor);
  const height = Math.max(CTA_DEFAULT_HEIGHT, ctx.tapFloor);
  return { spec, visible: true, width, height };
}

/** height contribution of a text element to a vertical stack, given its current state */
function textHeight(state: ElementState): number {
  // ponytail: truncated single-line text is given a tighter line-height (1.0x
  // instead of 1.3x) so truncation genuinely frees vertical budget in the
  // degradation loop — a simplification, not a real text-metrics model.
  const lineHeight = state.truncated ? 1.0 : 1.3;
  return (state.fontSize ?? 0) * lineHeight;
}

function elementHeight(state: ElementState): number {
  if (state.spec.type === "text") return textHeight(state);
  return state.height ?? 0;
}

function hasMoreStages(state: ElementState, ctx: ResolveContext): boolean {
  if (!state.visible) return false;
  const spec = state.spec;
  switch (spec.type) {
    case "text": {
      const floor = textFontFloor(spec, ctx);
      if ((state.fontSize ?? floor) > floor) return true;
      if (spec.canTruncate && !state.truncated) return true;
      return spec.canDrop === true;
    }
    case "image": {
      const w = state.width ?? 0;
      const h = state.height ?? 0;
      if (w > MIN_USABLE_IMAGE_PX && h > MIN_USABLE_IMAGE_PX) return true;
      return spec.canDrop === true;
    }
    case "button":
      return spec.canDrop === true;
    default:
      return assertNever(spec);
  }
}

function degradeOneStep(state: ElementState, ctx: ResolveContext, regionWidth: number, warnings: string[]): void {
  const spec = state.spec;
  switch (spec.type) {
    case "text": {
      const floor = textFontFloor(spec, ctx);
      const fontSize = state.fontSize ?? floor;
      if (fontSize > floor) {
        state.fontSize = Math.max(floor, fontSize - SHRINK_STEP_PX);
        warnings.push(`${spec.id}: font shrunk to ${state.fontSize}px`);
        return;
      }
      if (spec.canTruncate && !state.truncated) {
        state.truncated = true;
        state.displayContent = truncateToWidth(spec.content, fontSize, regionWidth);
        warnings.push(`${spec.id}: truncated to fit ${Math.round(regionWidth)}px width`);
        return;
      }
      if (spec.canDrop) {
        state.visible = false;
        warnings.push(`${spec.id}: dropped (still overflows at floor size)`);
      }
      return;
    }
    case "image": {
      const w = state.width ?? 0;
      const h = state.height ?? 0;
      if (w > MIN_USABLE_IMAGE_PX && h > MIN_USABLE_IMAGE_PX) {
        state.width = Math.max(MIN_USABLE_IMAGE_PX, w * IMAGE_SHRINK_FACTOR);
        state.height = Math.max(MIN_USABLE_IMAGE_PX, h * IMAGE_SHRINK_FACTOR);
        warnings.push(`${spec.id}: shrunk to ${Math.round(state.width)}x${Math.round(state.height)}px`);
        return;
      }
      if (spec.canDrop) {
        state.visible = false;
        warnings.push(`${spec.id}: dropped (still overflows at floor size)`);
      }
      return;
    }
    case "button": {
      if (spec.canDrop) {
        state.visible = false;
        warnings.push(`${spec.id}: dropped (no room for button)`);
      }
      return;
    }
    default:
      assertNever(spec);
  }
}

interface LayoutResult {
  placed: Map<string, Rect>;
  regionOverflow: boolean;
  brandingOverflow: boolean;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function cornerRect(corner: "br" | "tr" | "bl" | "tl", size: { width: number; height: number }, box: Rect): Rect {
  const x = corner === "tr" || corner === "br" ? box.x + box.width - size.width : box.x;
  const y = corner === "tl" || corner === "tr" ? box.y : box.y + box.height - size.height;
  return { x, y, width: size.width, height: size.height };
}

/** Phase B (natural sizes) + Phase C (region packing), recomputed fresh each iteration. */
function layout(states: Map<string, ElementState>, ctx: ResolveContext): LayoutResult {
  const { contentBox, axisMode } = ctx;
  const placed = new Map<string, Rect>();

  const brandingState = [...states.values()].find((s) => s.spec.role === "branding" && s.visible);
  const heroState = [...states.values()].find((s) => s.spec.role === "hero-image" && s.visible);
  const stackStates = [...states.values()]
    .filter((s) => s.visible && s.spec.role !== "branding" && s.spec.role !== "hero-image")
    .sort((a, b) => a.spec.priority - b.spec.priority);

  function packStack(list: ElementState[], rect: Rect): boolean {
    let cursorY = rect.y;
    let widthOverflow = false;
    for (const s of list) {
      const height = elementHeight(s);
      // text fills the region width (block-level); image/button keep their own
      // intrinsic size (already aspect-fit for images) and are centered so a
      // capped-width hero doesn't stretch and distort.
      const naturalWidth = s.spec.type === "text" ? rect.width : (s.width ?? rect.width);
      if (naturalWidth > rect.width) widthOverflow = true;
      const width = Math.min(naturalWidth, rect.width);
      const x = s.spec.type === "text" ? rect.x : rect.x + (rect.width - width) / 2;
      placed.set(s.spec.id, { x, y: cursorY, width, height });
      cursorY += height + GAP;
    }
    const usedExtent = list.length > 0 ? cursorY - GAP - rect.y : 0;
    return usedExtent > rect.height || widthOverflow;
  }

  let regionOverflow = false;

  if (axisMode === "column") {
    const all = heroState ? [heroState, ...stackStates] : stackStates;
    all.sort((a, b) => a.spec.priority - b.spec.priority);
    regionOverflow = packStack(all, contentBox);
  } else if (axisMode === "row") {
    let stackRect = contentBox;
    if (heroState) {
      const heroWidth = heroState.width ?? 0;
      const heroHeight = heroState.height ?? 0;
      const heroRect: Rect = {
        x: contentBox.x,
        y: contentBox.y + (contentBox.height - heroHeight) / 2,
        width: heroWidth,
        height: heroHeight,
      };
      placed.set(heroState.spec.id, heroRect);
      stackRect = {
        x: contentBox.x + heroWidth + GAP,
        y: contentBox.y,
        width: Math.max(0, contentBox.width - heroWidth - GAP),
        height: contentBox.height,
      };
    }
    regionOverflow = packStack(stackStates, stackRect);
  } else {
    const leftRect: Rect = {
      x: contentBox.x,
      y: contentBox.y,
      width: contentBox.width * GRID_LEFT_COLUMN_FRACTION,
      height: contentBox.height,
    };
    const rightRect: Rect = {
      x: leftRect.x + leftRect.width + GAP,
      y: contentBox.y,
      width: contentBox.width - leftRect.width - GAP,
      height: contentBox.height,
    };
    if (heroState) {
      const size = { width: heroState.width ?? 0, height: heroState.height ?? 0 };
      const x = leftRect.x + (leftRect.width - size.width) / 2;
      const y = leftRect.y + (leftRect.height - size.height) / 2;
      placed.set(heroState.spec.id, { x, y, width: size.width, height: size.height });
    }
    regionOverflow = packStack(stackStates, rightRect);
  }

  let brandingOverflow = false;
  if (brandingState) {
    const size = { width: brandingState.width ?? 0, height: brandingState.height ?? 0 };
    const others = [...placed.values()];
    let placedCorner: "br" | "tr" | "bl" | "tl" | undefined;
    for (const corner of CORNER_ORDER) {
      const rect = cornerRect(corner, size, contentBox);
      const contained =
        rect.x >= contentBox.x &&
        rect.x + rect.width <= contentBox.x + contentBox.width &&
        rect.y >= contentBox.y &&
        rect.y + rect.height <= contentBox.y + contentBox.height;
      if (contained && !others.some((o) => rectsOverlap(rect, o))) {
        placedCorner = corner;
        placed.set(brandingState.spec.id, rect);
        break;
      }
    }
    if (placedCorner) {
      brandingState.corner = placedCorner;
    } else {
      brandingOverflow = true;
      placed.set(brandingState.spec.id, cornerRect(brandingState.corner ?? "br", size, contentBox));
    }
  }

  return { placed, regionOverflow, brandingOverflow };
}

export function resolve(spec: Validated<AdSpec>, surface: Validated<SurfaceProfile>): ResolvedLayout {
  const contentBox: Rect = {
    x: surface.safeArea.left,
    y: surface.safeArea.top,
    width: surface.width - surface.safeArea.left - surface.safeArea.right,
    height: surface.height - surface.safeArea.top - surface.safeArea.bottom,
  };
  const aspect = contentBox.width / contentBox.height;
  const axisMode: AxisMode = aspect >= AXIS_ROW_THRESHOLD ? "row" : aspect <= AXIS_COLUMN_THRESHOLD ? "column" : "grid2col";

  const ctx: ResolveContext = {
    contentBox,
    axisMode,
    tapFloor: surface.touchOnly ? surface.minTapTarget : 0,
    textFloor: surface.minTextSize ?? 0,
    baseFontScale: surface.viewingDistance === "far" ? FAR_VIEWING_FONT_SCALE : 1,
  };

  const states = new Map<string, ElementState>();
  for (const el of spec.elements) {
    states.set(el.id, createState(el, ctx));
  }

  const warnings: string[] = [];
  const maxIterations = spec.elements.length * 8 + 8;
  let result = layout(states, ctx);
  let iteration = 0;

  while (result.regionOverflow || result.brandingOverflow) {
    iteration += 1;
    if (iteration > maxIterations) {
      throw new Error(`resolve(): degradation loop did not converge for spec "${spec.id}" on surface "${surface.id}"`);
    }

    const candidates = [...states.values()]
      .filter((s) => hasMoreStages(s, ctx))
      .sort((a, b) => b.spec.priority - a.spec.priority);

    if (candidates.length === 0) {
      throw new Error(
        `resolve(): spec "${spec.id}" cannot fit on surface "${surface.id}" — undroppable elements exceed available space`,
      );
    }

    const target = candidates[0];
    const regionWidth = result.placed.get(target.spec.id)?.width ?? contentBox.width;
    warnings.push(`iteration ${iteration}: degrading "${target.spec.id}" (priority ${target.spec.priority})`);
    degradeOneStep(target, ctx, regionWidth, warnings);

    result = layout(states, ctx);
  }

  const elements: ResolvedElement[] = [];
  const droppedElementIds: string[] = [];
  for (const state of states.values()) {
    if (!state.visible) {
      droppedElementIds.push(state.spec.id);
      continue;
    }
    const rect = result.placed.get(state.spec.id);
    if (!rect) continue;
    const spec2 = state.spec;
    const round = (n: number) => Math.round(n * 100) / 100;
    const resolved: ResolvedElement = {
      id: spec2.id,
      role: spec2.role,
      type: spec2.type,
      x: round(rect.x),
      y: round(rect.y),
      width: round(rect.width),
      height: round(rect.height),
    };
    if (spec2.type === "text") {
      resolved.fontSize = state.fontSize;
      resolved.content = state.displayContent;
      resolved.truncated = state.truncated ?? false;
    } else if (spec2.type === "button") {
      resolved.content = spec2.label;
    }
    elements.push(resolved);
  }

  const resolved: ResolvedLayout = {
    surfaceId: surface.id,
    specId: spec.id,
    surfaceWidth: surface.width,
    surfaceHeight: surface.height,
    elements,
    droppedElementIds,
    warnings,
  };

  const violations = checkInvariants(resolved, surface, spec);
  if (violations.length > 0) {
    throw new Error(`resolve(): invariant violation(s) for spec "${spec.id}" on surface "${surface.id}":\n  - ${violations.join("\n  - ")}`);
  }

  return resolved;
}

export { assertNever };
