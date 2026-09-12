import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { readAdPalette } from "./adPalette";
import { buildAdSpec } from "./adSpec";
import { AnimatedThemeToggler } from "./components/ui/animated-theme-toggler";
import { Segmented } from "./components/Segmented";
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
const PREVIEW_HEIGHT = 640;
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

/**
 * Tracks an element's rendered height so a sibling column can be pinned to
 * it — the controls column's content length varies with the surface (trace
 * steps, dropped-element count), the stage column's doesn't, so the stage
 * column is the one to measure and the other is the one to pin.
 */
function useMeasuredHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState<number>();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, height] as const;
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
  const [stageColumnRef, stageColumnHeight] = useMeasuredHeight<HTMLDivElement>();

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

        <Segmented
          ariaLabel="Renderer"
          activeKey={renderer}
          options={[
            { key: "dom", label: "DOM + 3D" },
            { key: "canvas", label: "Canvas" },
          ]}
          onSelect={(key) => setRenderer(key as "dom" | "canvas")}
        />

        <AnimatedThemeToggler
          className="icon-button"
          variant="circle"
          duration={1100}
          theme={theme}
          onThemeChange={setTheme}
        />
      </header>

      <div className="dashboard">
        <div
          className="column column-controls"
          style={{ "--stage-col-h": stageColumnHeight ? `${stageColumnHeight}px` : undefined } as CSSProperties}
        >
          <div className="panel glass">
            <SurfacePicker selectedId={surface.id} onSelect={setSurface} />
          </div>

          {result.layout && (
            <div className="panel glass debug-panel">
              <DebugPanel layout={result.layout} />
            </div>
          )}
        </div>

        <div className="column" ref={stageColumnRef}>
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
            <Segmented
              ariaLabel="Product model"
              activeKey={model.id}
              options={jacketModels.map((m) => ({ key: m.id, label: m.label }))}
              onSelect={(key) => setModel(jacketModels.find((m) => m.id === key) ?? model)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
