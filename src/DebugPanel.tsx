import type { ResolvedLayout } from "./types";

export function DebugPanel({ layout }: { layout: ResolvedLayout }) {
  return (
    <>
      <div className="debug-head">
        <h2 className="debug-title">Debug trace</h2>
        <span className="debug-meta">
          {layout.warnings.length} step{layout.warnings.length === 1 ? "" : "s"} · {layout.droppedElementIds.length}{" "}
          dropped
        </span>
      </div>
      <div className="debug-body">
        <section>
          <h3>Decision trace</h3>
          {layout.warnings.length === 0 ? (
            <p className="muted">Everything fit at natural size — no degradation needed.</p>
          ) : (
            <ol>
              {layout.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ol>
          )}
        </section>
        <section className="debug-raw">
          <h3>Raw ResolvedLayout</h3>
          <pre>{JSON.stringify(layout, null, 2)}</pre>
        </section>
      </div>
    </>
  );
}
