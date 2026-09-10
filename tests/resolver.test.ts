import { describe, expect, it } from "vitest";
import { buildAdSpec, jacketAdSpec } from "../src/adSpec";
import { checkInvariants } from "../src/invariants";
import { jacketModels } from "../src/models";
import { resolve } from "../src/resolver";
import { defineAdSpec } from "../src/spec";
import { defineSurfaceProfile, presetSurfaces } from "../src/surfaces";

const surfaceById = (id: string) => presetSurfaces.find((s) => s.id === id)!;

const contentBox = (s: (typeof presetSurfaces)[number]) => ({
  x: s.safeArea.left,
  y: s.safeArea.top,
  width: s.width - s.safeArea.left - s.safeArea.right,
  height: s.height - s.safeArea.top - s.safeArea.bottom,
});

describe("resolve() across the 5 preset surfaces", () => {
  for (const surface of presetSurfaces) {
    it(`produces a fully valid layout for "${surface.id}"`, () => {
      const layout = resolve(jacketAdSpec, surface);
      expect(checkInvariants(layout, surface, jacketAdSpec)).toEqual([]);
    });

    it(`never drops the undroppable headline/cta on "${surface.id}"`, () => {
      const layout = resolve(jacketAdSpec, surface);
      expect(layout.droppedElementIds).not.toContain("headline");
      expect(layout.droppedElementIds).not.toContain("cta");
    });

    it(`centres the composition in the content box on "${surface.id}"`, () => {
      // The old engine packed from the top-left and let all slack fall out of
      // the bottom/right. Slack must now be split evenly instead.
      const layout = resolve(jacketAdSpec, surface);
      const box = contentBox(surface);
      const top = Math.min(...layout.elements.map((e) => e.y));
      const bottom = Math.max(...layout.elements.map((e) => e.y + e.height));
      const leading = top - box.y;
      const trailing = box.y + box.height - bottom;
      expect(Math.abs(leading - trailing)).toBeLessThan(1);
    });

    it(`leaves no unused column on "${surface.id}"`, () => {
      // Something must reach both the left and the right edge of the content
      // box: a lockup hugging one side is the "empty space" failure mode.
      const layout = resolve(jacketAdSpec, surface);
      const box = contentBox(surface);
      const left = Math.min(...layout.elements.map((e) => e.x));
      const right = Math.max(...layout.elements.map((e) => e.x + e.width));
      expect(left - box.x).toBeLessThan(1);
      expect(box.x + box.width - right).toBeLessThan(1);
    });
  }
});

describe("composition", () => {
  it("picks a template per surface from the content-box aspect ratio alone", () => {
    expect(resolve(jacketAdSpec, surfaceById("mobilePortrait")).template).toBe("stack");
    expect(resolve(jacketAdSpec, surfaceById("mobileLandscape")).template).toBe("split");
    expect(resolve(jacketAdSpec, surfaceById("retailKiosk")).template).toBe("split");
    expect(resolve(jacketAdSpec, surfaceById("broadcastLowerThird")).template).toBe("banner");
    expect(resolve(jacketAdSpec, surfaceById("compactWidget")).template).toBe("banner");
  });

  it("orders the copy by reading order, not by priority", () => {
    // cta shares priority 1 with the headline; sorting the stack by priority
    // is what used to put "Shop Now" above the price.
    const layout = resolve(jacketAdSpec, surfaceById("mobilePortrait"));
    const y = (id: string) => layout.elements.find((e) => e.id === id)!.y;
    expect(y("headline")).toBeLessThan(y("price"));
    expect(y("price")).toBeLessThan(y("secondary"));
    expect(y("secondary")).toBeLessThan(y("cta"));
  });

  it("gives the hero the space the copy leaves over, not a fixed fraction", () => {
    const layout = resolve(jacketAdSpec, surfaceById("mobilePortrait"));
    const box = contentBox(surfaceById("mobilePortrait"));
    const hero = layout.elements.find((e) => e.id === "hero")!;
    expect(hero.height / box.height).toBeGreaterThan(0.35);
  });

  it("makes the hero plate share both edges with the copy block", () => {
    // The plate is an image well, not a crop of the product: side by side, the
    // two columns must start and end on the same lines. Sizing the plate to the
    // product instead leaves it visibly short against the copy.
    for (const surface of presetSurfaces) {
      const layout = resolve(jacketAdSpec, surface);
      if (layout.template === "stack") continue;
      const hero = layout.elements.find((e) => e.id === "hero");
      if (!hero) continue;
      const copy = layout.elements.filter(
        (e) => e.id !== "hero" && !(layout.template === "banner" && e.role === "cta"),
      );
      const top = Math.min(...copy.map((e) => e.y));
      const bottom = Math.max(...copy.map((e) => e.y + e.height));
      expect(Math.abs(hero.y - top)).toBeLessThan(0.5);
      expect(Math.abs(hero.y + hero.height - bottom)).toBeLessThan(0.5);
    }
  });

  it("keeps the branding mark's aspect ratio instead of stretching it", () => {
    const layout = resolve(jacketAdSpec, surfaceById("mobilePortrait"));
    const mark = layout.elements.find((e) => e.id === "branding")!;
    expect(mark.width).toBeCloseTo(mark.height, 5);
  });

  it("scales type to the surface rather than using one fixed ladder", () => {
    const size = (id: string) =>
      resolve(jacketAdSpec, surfaceById(id)).elements.find((e) => e.role === "headline")!.fontSize!;
    expect(size("retailKiosk")).toBeGreaterThan(size("mobilePortrait"));
    expect(size("mobilePortrait")).toBeGreaterThan(size("compactWidget"));
  });

  it("auto-fits the headline to at most two lines on every preset", () => {
    // A 120px column at the natural size stacked "Built for / Every / Element."
    // into a tower; the headline steps down instead of dropping the copy below
    // it to make room.
    for (const surface of presetSurfaces) {
      const headline = resolve(jacketAdSpec, surface).elements.find((e) => e.role === "headline")!;
      expect(headline.lines!.length).toBeLessThanOrEqual(2);
    }
  });

  it("never hands a renderer a line too wide for its own box", () => {
    // The renderers keep nowrap + ellipsis as a guard. If it ever fires on copy
    // the resolver did NOT mark truncated, the reader loses words the engine
    // believed it had placed — which is what put "Packs int…" on the kiosk.
    for (const surface of presetSurfaces) {
      for (const el of resolve(jacketAdSpec, surface).elements) {
        if (el.type !== "text" || el.truncated) continue;
        for (const line of el.lines!) {
          const estimate = line.length * el.fontSize! * 0.62; // widest plausible advance
          expect(estimate).toBeLessThanOrEqual(el.width * 1.35);
        }
      }
    }
  });

  it("wraps copy to the column it was given, so nothing is silently clipped", () => {
    const layout = resolve(jacketAdSpec, surfaceById("mobilePortrait"));
    const headline = layout.elements.find((e) => e.id === "headline")!;
    expect(headline.lines!.length).toBeGreaterThan(1);
    expect(headline.lines!.join(" ")).toBe("Built for Every Element.");
    expect(headline.truncated).toBe(false);
  });
});

describe("degradation", () => {
  it("degrades on compactWidget, the one preset genuinely short of room", () => {
    const layout = resolve(jacketAdSpec, surfaceById("compactWidget"));
    expect(layout.warnings.length).toBeGreaterThan(0);
    expect(layout.warnings.some((w) => w.includes("branding"))).toBe(true);
  });

  it("still shows the price on the smallest surface", () => {
    // price outranks the hero image in the spec precisely so a 300x100 widget
    // keeps the number a shopper needs.
    const layout = resolve(jacketAdSpec, surfaceById("compactWidget"));
    expect(layout.droppedElementIds).not.toContain("price");
  });

  it("degrades in global priority order — branding, then secondary, then hero", () => {
    const layout = resolve(jacketAdSpec, surfaceById("compactWidget"));
    const firstTouch = (id: string) => layout.warnings.findIndex((w) => w.includes(id));
    const [branding, secondary, hero] = ["branding", "secondary", "hero"].map(firstTouch);
    if (branding !== -1 && secondary !== -1) expect(branding).toBeLessThan(secondary);
    if (secondary !== -1 && hero !== -1) expect(secondary).toBeLessThan(hero);
  });

  it("leaves the roomy presets untouched", () => {
    for (const id of ["mobilePortrait", "mobileLandscape", "retailKiosk", "broadcastLowerThird"]) {
      const layout = resolve(jacketAdSpec, surfaceById(id));
      expect(layout.droppedElementIds).toEqual([]);
      expect(layout.warnings).toEqual([]);
    }
  });
});

describe("every product model, on every surface", () => {
  // Each jacket has its own swept aspect (0.88 to 1.51), so the plate reshapes
  // per model. All 20 combinations must still be valid layouts.
  for (const model of jacketModels) {
    for (const surface of presetSurfaces) {
      it(`resolves "${model.id}" on "${surface.id}"`, () => {
        const spec = buildAdSpec(model);
        const layout = resolve(spec, surface);
        expect(checkInvariants(layout, surface, spec)).toEqual([]);
        expect(layout.droppedElementIds).not.toContain("headline");
        expect(layout.elements.find((e) => e.id === "hero")?.src ?? model.url).toBe(model.url);
      });
    }
  }

  it("shapes the hero plate from the selected model, not a fixed ratio", () => {
    // stack sizes the plate off the product aspect, so a 0.88 coat and a 1.51
    // ninja must not produce the same plate.
    const widthFor = (id: string) =>
      resolve(buildAdSpec(jacketModels.find((m) => m.id === id)!), surfaceById("mobilePortrait")).elements.find(
        (e) => e.id === "hero",
      )!.width;
    expect(widthFor("ninja")).toBeGreaterThan(widthFor("coat"));
  });
});

describe("unseen surfaces (fuzzing the template thresholds)", () => {
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
  const square = defineSurfaceProfile({
    id: "square",
    width: 600,
    height: 600,
    safeArea: { top: 24, right: 24, bottom: 24, left: 24 },
    touchOnly: true,
    minTapTarget: 44,
    minTextSize: 12,
  });

  for (const surface of [tallNarrow, ultraWide, square]) {
    it(`resolves "${surface.id}" with zero code changes and passes invariants`, () => {
      const layout = resolve(jacketAdSpec, surface);
      expect(checkInvariants(layout, surface, jacketAdSpec)).toEqual([]);
    });
  }

  it("sweeps a range of aspect ratios without producing an invalid layout", () => {
    for (let width = 240; width <= 1920; width += 120) {
      for (let height = 120; height <= 1200; height += 120) {
        const surface = defineSurfaceProfile({
          id: `sweep-${width}x${height}`,
          width,
          height,
          safeArea: { top: 8, right: 8, bottom: 8, left: 8 },
          touchOnly: false,
          minTextSize: 10,
        });
        const layout = resolve(jacketAdSpec, surface);
        expect(checkInvariants(layout, surface, jacketAdSpec)).toEqual([]);
      }
    }
  });
});

it("throws a documented pathological error when undroppable elements cannot fit", () => {
  const tiny = defineSurfaceProfile({
    id: "tiny",
    width: 50,
    height: 50,
    safeArea: { top: 2, right: 2, bottom: 2, left: 2 },
    touchOnly: false,
  });
  expect(() => resolve(jacketAdSpec, tiny)).toThrow();
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
