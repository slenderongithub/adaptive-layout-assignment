import { useEffect, useMemo, useRef, useState } from "react";
import { earbudsAdSpec } from "./adSpec";
import { DebugPanel } from "./DebugPanel";
import { drawLayout } from "./render-canvas";
import { LayoutRenderer } from "./render-dom";
import { resolve } from "./resolver";
import type { Validated } from "./spec";
import { SurfacePicker } from "./SurfacePicker";
import { mobilePortrait, type SurfaceProfile } from "./surfaces";
import type { ResolvedLayout } from "./types";

const PREVIEW_WIDTH = 640;
const PREVIEW_HEIGHT = 520;

function CanvasStage({ layout }: { layout: ResolvedLayout }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (ctx) drawLayout(ctx, layout);
  }, [layout]);

  return <canvas ref={ref} width={layout.surfaceWidth} height={layout.surfaceHeight} />;
}

function App() {
  const [surface, setSurface] = useState<Validated<SurfaceProfile>>(mobilePortrait);
  const [renderer, setRenderer] = useState<"dom" | "canvas">("dom");

  const result = useMemo(() => {
    try {
      return { layout: resolve(earbudsAdSpec, surface), error: null as string | null };
    } catch (err) {
      return { layout: null, error: err instanceof Error ? err.message : String(err) };
    }
  }, [surface]);

  const scale = Math.min(PREVIEW_WIDTH / surface.width, PREVIEW_HEIGHT / surface.height, 2);

  return (
    <div className="app">
      <header>
        <h1>Adaptive Layout Engine</h1>
        <p className="muted">One resolver, one ad spec, five surfaces — zero surface-specific branches.</p>
      </header>

      <SurfacePicker selectedId={surface.id} onSelect={setSurface} />

      <div className="renderer-toggle">
        <button type="button" className={renderer === "dom" ? "active" : ""} onClick={() => setRenderer("dom")}>
          DOM renderer
        </button>
        <button
          type="button"
          className={renderer === "canvas" ? "active" : ""}
          onClick={() => setRenderer("canvas")}
        >
          Canvas renderer
        </button>
      </div>

      <div className="stage-wrap">
        <div className="stage" style={{ width: surface.width * scale, height: surface.height * scale }}>
          {result.layout ? (
            <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
              {renderer === "dom" ? (
                <LayoutRenderer layout={result.layout} />
              ) : (
                <CanvasStage layout={result.layout} />
              )}
            </div>
          ) : (
            <p className="error">{result.error}</p>
          )}
        </div>
      </div>

      {result.layout && <DebugPanel layout={result.layout} />}
    </div>
  );
}

export default App;
