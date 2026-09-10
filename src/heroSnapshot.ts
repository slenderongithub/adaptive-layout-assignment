/**
 * Stills of the WebGL hero, handed from the DOM renderer to the Canvas one,
 * keyed by model URL so switching jackets never shows the previous product.
 *
 * The Canvas renderer is pure 2D, so it cannot mount the GLB itself — which is
 * why it used to paint a flat grey rectangle where the product should be. The
 * 3D path snapshots its own framebuffer once the model has loaded and settled,
 * and Canvas draws that. If no snapshot exists yet (Canvas opened first, a
 * model not viewed in 3D, context lost) the renderer falls back to a styled
 * product plate rather than failing.
 */
const snapshots = new Map<string, HTMLImageElement>();

export function captureHeroSnapshot(url: string, source: HTMLCanvasElement): void {
  try {
    const image = new Image();
    image.onload = () => {
      snapshots.set(url, image);
    };
    image.src = source.toDataURL("image/png");
  } catch {
    // Tainted or lost context — Canvas mode keeps its fallback plate.
  }
}

export function getHeroSnapshot(url: string | undefined): HTMLImageElement | null {
  return (url && snapshots.get(url)) || null;
}
