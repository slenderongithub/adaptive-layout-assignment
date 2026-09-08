import { useState } from "react";
import type { ResolvedLayout } from "./types";

export function DebugPanel({ layout }: { layout: ResolvedLayout }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="debug-panel">
      <button type="button" className="debug-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? "▾" : "▸"} Debug trace ({layout.warnings.length} step{layout.warnings.length === 1 ? "" : "s"},{" "}
        {layout.droppedElementIds.length} dropped)
      </button>
      {open && (
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
          <section>
            <h3>Raw ResolvedLayout</h3>
            <pre>{JSON.stringify(layout, null, 2)}</pre>
          </section>
        </div>
      )}
    </div>
  );
}
