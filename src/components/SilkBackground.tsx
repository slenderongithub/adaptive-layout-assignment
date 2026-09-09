import Silk from "./Silk";

/**
 * Fixed full-viewport Silk shader plus the single static scrim that keeps type
 * legible over it. Both live at `z-index: -1`, which paints above the canvas
 * background propagated from <html> but below every in-flow element — so
 * nothing in the page may set its own opaque background (see index.css).
 *
 * Colors and the shader's own light/dark shading branch (`lightMode`) are keyed
 * off the `dark` param rather than reading `document.documentElement` directly,
 * so it re-renders in lockstep with React state instead of drifting a frame
 * behind the class toggle.
 */
export function SilkBackground({ dark }: { dark: boolean }) {
  return (
    <div className="backdrop" aria-hidden="true">
      <Silk
        speed={5}
        scale={1}
        color={dark ? "#6f6873" : "#e0d3c0"}
        noiseIntensity={1.5}
        rotation={0}
        lightMode={!dark}
      />
      <div className="backdrop-scrim" />
    </div>
  );
}
