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

export function defineSurfaceProfile(s: SurfaceProfile): Validated<SurfaceProfile> {
  const errors: string[] = [];

  if (!(s.width > 0)) errors.push(`width must be > 0, got ${s.width}`);
  if (!(s.height > 0)) errors.push(`height must be > 0, got ${s.height}`);

  const { top, right, bottom, left } = s.safeArea;
  if (top < 0 || right < 0 || bottom < 0 || left < 0) {
    errors.push("safeArea insets must be >= 0");
  }
  if (top + bottom >= s.height) {
    errors.push(`safeArea top+bottom (${top + bottom}) leaves no vertical space in height ${s.height}`);
  }
  if (left + right >= s.width) {
    errors.push(`safeArea left+right (${left + right}) leaves no horizontal space in width ${s.width}`);
  }

  if (s.touchOnly && !(s.minTapTarget > 0)) {
    errors.push(`touchOnly surface must have minTapTarget > 0, got ${s.minTapTarget}`);
  }

  if (errors.length > 0) {
    throw new Error(`Invalid SurfaceProfile "${s.id}":\n  - ${errors.join("\n  - ")}`);
  }

  return s as Validated<SurfaceProfile>;
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
