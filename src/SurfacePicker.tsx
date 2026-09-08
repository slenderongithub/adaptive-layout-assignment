import { useState } from "react";
import { defineSurfaceProfile, presetSurfaces, type SurfaceProfile } from "./surfaces";
import type { Validated } from "./spec";

const CUSTOM_PLACEHOLDER = `{
  "id": "custom",
  "width": 800,
  "height": 1200,
  "safeArea": { "top": 16, "right": 16, "bottom": 16, "left": 16 },
  "touchOnly": false,
  "minTextSize": 12
}`;

export function SurfacePicker({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (surface: Validated<SurfaceProfile>) => void;
}) {
  const [tab, setTab] = useState<"presets" | "custom">("presets");
  const [json, setJson] = useState(CUSTOM_PLACEHOLDER);
  const [error, setError] = useState<string | null>(null);

  function applyCustom() {
    try {
      const parsed = JSON.parse(json);
      const surface = defineSurfaceProfile(parsed);
      setError(null);
      onSelect(surface);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="surface-picker">
      <div className="tabs">
        <button type="button" className={tab === "presets" ? "active" : ""} onClick={() => setTab("presets")}>
          Presets
        </button>
        <button type="button" className={tab === "custom" ? "active" : ""} onClick={() => setTab("custom")}>
          Custom Surface
        </button>
      </div>

      {tab === "presets" ? (
        <div className="preset-buttons">
          {presetSurfaces.map((s) => (
            <button
              key={s.id}
              type="button"
              className={s.id === selectedId ? "active" : ""}
              onClick={() => onSelect(s)}
            >
              {s.id}
              <span className="dims">
                {s.width}×{s.height}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="custom-tab">
          <textarea value={json} onChange={(e) => setJson(e.target.value)} rows={10} spellCheck={false} />
          <button type="button" onClick={applyCustom}>
            Resolve
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </div>
  );
}
