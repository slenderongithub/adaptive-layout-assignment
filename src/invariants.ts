import type { AdSpec, Validated } from "./spec";
import type { SurfaceProfile } from "./surfaces";
import type { ResolvedLayout } from "./types";

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function checkInvariants(
  layout: ResolvedLayout,
  surface: Validated<SurfaceProfile>,
  spec: Validated<AdSpec>,
): string[] {
  const violations: string[] = [];
  const contentBox = {
    x: surface.safeArea.left,
    y: surface.safeArea.top,
    width: surface.width - surface.safeArea.left - surface.safeArea.right,
    height: surface.height - surface.safeArea.top - surface.safeArea.bottom,
  };

  for (let i = 0; i < layout.elements.length; i++) {
    for (let j = i + 1; j < layout.elements.length; j++) {
      const a = layout.elements[i];
      const b = layout.elements[j];
      if (overlaps(a, b)) violations.push(`"${a.id}" overlaps "${b.id}"`);
    }
  }

  for (const el of layout.elements) {
    const withinX = el.x >= contentBox.x - 0.01 && el.x + el.width <= contentBox.x + contentBox.width + 0.01;
    const withinY = el.y >= contentBox.y - 0.01 && el.y + el.height <= contentBox.y + contentBox.height + 0.01;
    if (!withinX || !withinY) violations.push(`"${el.id}" is outside the content box`);
  }

  if (surface.touchOnly) {
    for (const el of layout.elements) {
      if (el.type !== "button") continue;
      if (el.width < surface.minTapTarget || el.height < surface.minTapTarget) {
        violations.push(`"${el.id}" (${el.width}x${el.height}px) is below minTapTarget ${surface.minTapTarget}px`);
      }
    }
  }

  const minTextSize = surface.minTextSize ?? 0;
  for (const el of layout.elements) {
    if (el.type !== "text") continue;
    if ((el.fontSize ?? 0) < minTextSize) {
      violations.push(`"${el.id}" fontSize ${el.fontSize} is below surface minTextSize ${minTextSize}`);
    }
  }

  const visibleIds = new Set(layout.elements.map((el) => el.id));
  for (const id of layout.droppedElementIds) {
    if (visibleIds.has(id)) violations.push(`"${id}" appears in both elements and droppedElementIds`);
  }

  const priorityById = new Map(spec.elements.map((el) => [el.id, el.priority]));
  const survivingPriorities = layout.elements.map((el) => priorityById.get(el.id) ?? Infinity);
  const minSurvivingPriority = Math.min(...survivingPriorities, Infinity);
  for (const id of layout.droppedElementIds) {
    const droppedPriority = priorityById.get(id);
    if (droppedPriority !== undefined && droppedPriority < minSurvivingPriority) {
      violations.push(`"${id}" (priority ${droppedPriority}) was dropped while a less important element survived`);
    }
  }

  return violations;
}
