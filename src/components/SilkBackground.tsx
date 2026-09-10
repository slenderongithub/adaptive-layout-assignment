import Silk from "./Silk";

/**
 * Fixed full-viewport Silk shader. Lives at `z-index: -1`, which paints above
 * the canvas background propagated from <html> but below every in-flow
 * element — so nothing in the page may set its own opaque background (see
 * index.css). Legibility comes from the .glass panels sitting on top of it,
 * not from a wash over the background itself.
 */
export function SilkBackground({ dark }: { dark: boolean }) {
  return (
    <div className="backdrop" aria-hidden="true">
      <Silk speed={12.8} scale={1} color={dark ? "#795796" : "#fbf6ff"} noiseIntensity={1.5} rotation={0} />
    </div>
  );
}
