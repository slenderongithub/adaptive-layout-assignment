import { describe, expect, it } from "vitest";
import { earbudsAdSpec } from "../src/adSpec";
import { checkInvariants } from "../src/invariants";
import { resolve } from "../src/resolver";
import { defineAdSpec } from "../src/spec";
import { defineSurfaceProfile, presetSurfaces } from "../src/surfaces";

describe("resolve() across the 5 preset surfaces", () => {
  for (const surface of presetSurfaces) {
    it(`produces a fully valid layout for "${surface.id}"`, () => {
      const layout = resolve(earbudsAdSpec, surface);
      expect(checkInvariants(layout, surface, earbudsAdSpec)).toEqual([]);
    });

    it(`never drops the undroppable headline/cta on "${surface.id}"`, () => {
      const layout = resolve(earbudsAdSpec, surface);
      expect(layout.droppedElementIds).not.toContain("headline");
      expect(layout.droppedElementIds).not.toContain("cta");
    });
  }
});

it("degrades branding on the cramped retail kiosk, matching the assignment's worked example", () => {
  const kiosk = presetSurfaces.find((s) => s.id === "retailKiosk")!;
  const layout = resolve(earbudsAdSpec, kiosk);
  const brandingTouched =
    layout.droppedElementIds.includes("branding") || layout.warnings.some((w) => w.includes("branding"));
  expect(brandingTouched).toBe(true);
});

it("degrades in global priority order — branding before secondary before price", () => {
  const kiosk = presetSurfaces.find((s) => s.id === "retailKiosk")!;
  const layout = resolve(earbudsAdSpec, kiosk);
  const firstTouch = (id: string) => layout.warnings.findIndex((w) => w.includes(id));
  const brandingIdx = firstTouch("branding");
  const secondaryIdx = firstTouch("secondary");
  const priceIdx = firstTouch("price");
  if (brandingIdx !== -1 && secondaryIdx !== -1) expect(brandingIdx).toBeLessThan(secondaryIdx);
  if (secondaryIdx !== -1 && priceIdx !== -1) expect(secondaryIdx).toBeLessThan(priceIdx);
});

describe("unseen surfaces (fuzzing the axis thresholds)", () => {
  const tallNarrow = defineSurfaceProfile({
    id: "tallNarrow",
    width: 200,
    height: 900,
    safeArea: { top: 16, right: 8, bottom: 16, left: 8 },
    touchOnly: false,
    minTextSize: 10,
  });
  const ultraWide = defineSurfaceProfile({
    id: "ultraWide",
    width: 2400,
    height: 150,
    safeArea: { top: 8, right: 20, bottom: 8, left: 20 },
    touchOnly: false,
    minTextSize: 12,
  });

  for (const surface of [tallNarrow, ultraWide]) {
    it(`resolves "${surface.id}" with zero code changes and passes invariants`, () => {
      const layout = resolve(earbudsAdSpec, surface);
      expect(checkInvariants(layout, surface, earbudsAdSpec)).toEqual([]);
    });
  }
});

it("throws a documented pathological error when undroppable elements cannot fit", () => {
  const tiny = defineSurfaceProfile({
    id: "tiny",
    width: 50,
    height: 50,
    safeArea: { top: 2, right: 2, bottom: 2, left: 2 },
    touchOnly: false,
  });
  expect(() => resolve(earbudsAdSpec, tiny)).toThrow();
});

describe("runtime validators report clear errors on invalid specs", () => {
  it("defineAdSpec rejects a spec missing a required cta", () => {
    expect(() =>
      defineAdSpec({
        id: "broken",
        elements: [{ id: "h", type: "text", role: "headline", priority: 1, content: "Hi" }],
      }),
    ).toThrow(/cta/);
  });

  it("defineSurfaceProfile rejects a surface whose safe area consumes the whole surface", () => {
    expect(() =>
      defineSurfaceProfile({
        id: "broken",
        width: 100,
        height: 100,
        safeArea: { top: 60, right: 0, bottom: 60, left: 0 },
        touchOnly: false,
      }),
    ).toThrow(/safeArea/);
  });
});
