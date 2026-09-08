import type { ElementRole, ElementType } from "./spec";

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
  content?: string;
  truncated?: boolean;
}

export interface ResolvedLayout {
  surfaceId: string;
  specId: string;
  surfaceWidth: number;
  surfaceHeight: number;
  /** visible only */
  elements: ResolvedElement[];
  droppedElementIds: string[];
  /** plain-English decision trace */
  warnings: string[];
}

export type AxisMode = "row" | "column" | "grid2col";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
