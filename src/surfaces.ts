import type { Validated } from "./spec";

interface SurfaceBase {
  id: string;
  width: number;
  height: number;
  safeArea: { top: number; right: number; bottom: number; left: number };
  minTextSize?: number;
  viewingDistance?: "near" | "far";
}

type TouchSurface = { touchOnly: true; minTapTarget: number };
type NonTouchSurface = { touchOnly?: false; minTapTarget?: number };

// `{ touchOnly: true }` without `minTapTarget` fails to compile.
export type SurfaceProfile = SurfaceBase & (TouchSurface | NonTouchSurface);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function invalidSurfaceMessage(surface: unknown, errors: string[]): Error {
  const id = isRecord(surface) && typeof surface.id === "string" && surface.id.trim() ? surface.id : "<unknown>";
  return new Error(`Invalid SurfaceProfile "${id}":\n  - ${errors.join("\n  - ")}`);
}

export function defineSurfaceProfile(s: SurfaceProfile): Validated<SurfaceProfile> {
  const errors: string[] = [];

  if (!isRecord(s)) {
    throw invalidSurfaceMessage(s, ["surface must be an object"]);
  }

  if (typeof s.id !== "string" || s.id.trim().length === 0) {
    errors.push("id must be a non-empty string");
  }

  if (!isFiniteNumber(s.width) || !(s.width > 0)) errors.push(`width must be a finite number > 0, got ${s.width}`);
  if (!isFiniteNumber(s.height) || !(s.height > 0)) errors.push(`height must be a finite number > 0, got ${s.height}`);

  if (!isRecord(s.safeArea)) {
    throw invalidSurfaceMessage(s, [...errors, "safeArea must be an object with top/right/bottom/left numbers"]);
  }

  const { top, right, bottom, left } = s.safeArea;
  for (const [key, value] of Object.entries({ top, right, bottom, left })) {
    if (!isFiniteNumber(value)) errors.push(`safeArea.${key} must be a finite number, got ${value}`);
  }

  const hasFiniteSize = isFiniteNumber(s.width) && isFiniteNumber(s.height);
  const hasFiniteInsets = [top, right, bottom, left].every(isFiniteNumber);
  if (hasFiniteInsets) {
    if (top < 0 || right < 0 || bottom < 0 || left < 0) {
      errors.push("safeArea insets must be >= 0");
    }
    if (hasFiniteSize && top + bottom >= s.height) {
      errors.push(`safeArea top+bottom (${top + bottom}) leaves no vertical space in height ${s.height}`);
    }
    if (hasFiniteSize && left + right >= s.width) {
      errors.push(`safeArea left+right (${left + right}) leaves no horizontal space in width ${s.width}`);
    }
  }

  if (s.minTextSize !== undefined && (!isFiniteNumber(s.minTextSize) || s.minTextSize <= 0)) {
    errors.push(`minTextSize must be a finite number > 0 when provided, got ${s.minTextSize}`);
  }

  if (s.viewingDistance !== undefined && s.viewingDistance !== "near" && s.viewingDistance !== "far") {
    errors.push(`viewingDistance must be "near" or "far" when provided, got ${s.viewingDistance}`);
  }

  if (s.touchOnly !== undefined && typeof s.touchOnly !== "boolean") {
    errors.push(`touchOnly must be a boolean when provided, got ${s.touchOnly}`);
  }

  if (s.touchOnly && !(s.minTapTarget > 0)) {
    errors.push(`touchOnly surface must have minTapTarget as a finite number > 0, got ${s.minTapTarget}`);
  }
  if (s.minTapTarget !== undefined && (!isFiniteNumber(s.minTapTarget) || s.minTapTarget <= 0)) {
    errors.push(`minTapTarget must be a finite number > 0 when provided, got ${s.minTapTarget}`);
  }

  if (errors.length > 0) {
    throw invalidSurfaceMessage(s, errors);
  }

  return s as unknown as Validated<SurfaceProfile>;
}

export const mobilePortrait: Validated<SurfaceProfile> = defineSurfaceProfile({
  id: "mobilePortrait",
  width: 320,
  height: 480,
  safeArea: { top: 24, right: 12, bottom: 24, left: 12 },
  touchOnly: true,
  minTapTarget: 44,
  minTextSize: 12,
  viewingDistance: "near",
});

export const mobileLandscape: Validated<SurfaceProfile> = defineSurfaceProfile({
  id: "mobileLandscape",
  width: 480,
  height: 320,
  safeArea: { top: 12, right: 24, bottom: 12, left: 24 },
  touchOnly: true,
  minTapTarget: 44,
  minTextSize: 12,
  viewingDistance: "near",
});

export const broadcastLowerThird: Validated<SurfaceProfile> = defineSurfaceProfile({
  id: "broadcastLowerThird",
  width: 1920,
  height: 250,
  safeArea: { top: 8, right: 60, bottom: 8, left: 60 },
  touchOnly: false,
  minTextSize: 32,
  viewingDistance: "far",
});

// Bottom inset reserves the kiosk's own instruction/QR chrome bar; the rest is
// an even bezel. (These were previously 445px top and bottom, which left a
// 1000x190 strip inside a 1080x1080 screen purely to force a degradation step
// in the demo — the engine now earns that step on compactWidget instead.)
export const retailKiosk: Validated<SurfaceProfile> = defineSurfaceProfile({
  id: "retailKiosk",
  width: 1080,
  height: 1080,
  safeArea: { top: 72, right: 72, bottom: 200, left: 72 },
  touchOnly: true,
  minTapTarget: 60,
  minTextSize: 18,
  viewingDistance: "near",
});

export const compactWidget: Validated<SurfaceProfile> = defineSurfaceProfile({
  id: "compactWidget",
  width: 300,
  height: 100,
  safeArea: { top: 4, right: 4, bottom: 4, left: 4 },
  touchOnly: true,
  minTapTarget: 44,
  minTextSize: 11,
  viewingDistance: "near",
});

export const presetSurfaces: Validated<SurfaceProfile>[] = [
  mobilePortrait,
  mobileLandscape,
  broadcastLowerThird,
  retailKiosk,
  compactWidget,
];
