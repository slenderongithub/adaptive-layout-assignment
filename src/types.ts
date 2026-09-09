import type { ElementRole, ElementType } from "./spec";

/**
 * How the resolver composed this surface.
 *  - stack:  one vertical column, hero above the copy (portrait-ish)
 *  - split:  hero in one column, copy + CTA in the other (squarish / landscape)
 *  - banner: hero | copy | CTA, three columns side by side (very wide strips)
 */
export type Template = "stack" | "split" | "banner";

export interface ResolvedElement {
  id: string;
  role: ElementRole;
  type: ElementType;
  /** absolute px, origin = surface top-left */
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  /** image only — carried through so renderers draw what the spec resolved to */
  src?: string;
  /**
   * text only — the resolver wraps copy itself so height is known before
   * placement, and so both renderers draw byte-identical line breaks.
   */
  lines?: string[];
  content?: string;
  truncated?: boolean;
  /** how `lines` sit inside the element box */
  align?: "left" | "center";
}

export interface ResolvedLayout {
  surfaceId: string;
  specId: string;
  surfaceWidth: number;
  surfaceHeight: number;
  template: Template;
  /** visible only */
  elements: ResolvedElement[];
  droppedElementIds: string[];
  /** plain-English decision trace, one line per degradation step */
  warnings: string[];
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
