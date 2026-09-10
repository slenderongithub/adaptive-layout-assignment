import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { readAdPalette } from "./adPalette";
import { buildAdSpec } from "./adSpec";
import { AnimatedThemeToggler } from "./components/ui/animated-theme-toggler";
import { SilkBackground } from "./components/SilkBackground";
import { DebugPanel } from "./DebugPanel";
import { defaultJacketModel, jacketModels } from "./models";
import { drawLayout } from "./render-canvas";
import { LayoutRenderer } from "./render-dom";
import { resolve } from "./resolver";
import type { Validated } from "./spec";
import { SurfacePicker } from "./SurfacePicker";
import { mobilePortrait, type SurfaceProfile } from "./surfaces";
import type { ResolvedLayout } from "./types";

const PREVIEW_WIDTH = 860;
const PREVIEW_HEIGHT = 520;
/**
 * Cap on preview magnification. At 2x a 300x100 widget was blown up larger
 * than the 1920px broadcast strip beside it, which made the set read as
 * inconsistent rather than as one spec across five surfaces.
 */
const PREVIEW_MAX_SCALE = 1.6;
const THEME_KEY = "theme";

function usePersistedTheme(): ["light" | "dark", (t: "light" | "dark") => void] {
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (localStorage.getItem(THEME_KEY) as "light" | "dark" | null) ?? "dark",
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  return [theme, setTheme];
}

function CanvasStage({ layout, theme }: { layout: ResolvedLayout; theme: "light" | "dark" }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    // `theme` is not read here — it is the dependency that re-reads the
    // --ad-* custom properties after the root class flips.
    if (ctx) drawLayout(ctx, layout, readAdPalette());
  }, [layout, theme]);

  return <canvas ref={ref} width={layout.surfaceWidth} height={layout.surfaceHeight} />;
}

function App() {
  const [surface, setSurface] = useState<Validated<SurfaceProfile>>(mobilePortrait);
  const [model, setModel] = useState(defaultJacketModel);
  const [renderer, setRenderer] = useState<"dom" | "canvas">("dom");
  const [theme, setTheme] = usePersistedTheme();

  const spec = useMemo(() => buildAdSpec(model), [model]);

  const result = useMemo(() => {
    try {
      return { layout: resolve(spec, surface), error: null as string | null };
    } catch (err) {
      return { layout: null, error: err instanceof Error ? err.message : String(err) };
    }
  }, [spec, surface]);

  const scale = Math.min(
    PREVIEW_WIDTH / surface.width,
    PREVIEW_HEIGHT / surface.height,
    PREVIEW_MAX_SCALE,
  );

  return (
    <div className="page">
      <SilkBackground dark={theme === "dark"} />

      <header className="navbar glass">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true">
            ◆
          </span>
          Adaptive Layout Engine
        </span>

        <div className="segmented" role="group" aria-label="Renderer">
          <button type="button" className={renderer === "dom" ? "active" : ""} onClick={() => setRenderer("dom")}>
            DOM + 3D
          </button>
          <button
            type="button"
            className={renderer === "canvas" ? "active" : ""}
            onClick={() => setRenderer("canvas")}
          >
            Canvas
          </button>
        </div>

        <AnimatedThemeToggler
          className="icon-button"
          variant="diamond"
          duration={1100}
          theme={theme}
          onThemeChange={setTheme}
        />
      </header>

      <div className="dashboard">
        <div className="column">
          <div className="panel glass">
            <SurfacePicker selectedId={surface.id} onSelect={setSurface} />
          </div>

          {result.layout && (
            <div className="panel glass debug-panel">
              <DebugPanel layout={result.layout} />
            </div>
          )}
        </div>

        <div className="column">
          <div className="stage-window glass">
            <div className="titlebar">
              <div className="titlebar-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <span className="titlebar-label">
                {surface.id} · {surface.width}×{surface.height}
                {result.layout ? ` · ${result.layout.template}` : ""}
              </span>
            </div>
            <div className="stage-body" style={{ "--preview-h": `${PREVIEW_HEIGHT}px` } as CSSProperties}>
              {result.layout ? (
                <div className="stage" style={{ width: surface.width * scale, height: surface.height * scale }}>
                  <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
                    {renderer === "dom" ? (
                      <LayoutRenderer layout={result.layout} />
                    ) : (
                      <CanvasStage layout={result.layout} theme={theme} />
                    )}
                  </div>
                </div>
              ) : (
                <p className="error">{result.error}</p>
              )}
            </div>
          </div>

          <div className="panel glass">
            <div className="segmented" role="group" aria-label="Product model">
              {jacketModels.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={m.id === model.id ? "active" : ""}
                  aria-pressed={m.id === model.id}
                  onClick={() => setModel(m)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
