import type { CSSProperties } from "react";
import type { ResolvedElement, ResolvedLayout } from "./types";

const TRANSITION = "left 0.25s ease, top 0.25s ease, width 0.25s ease, height 0.25s ease, font-size 0.25s ease";

function boxStyle(el: ResolvedElement): CSSProperties {
  return {
    position: "absolute",
    left: el.x,
    top: el.y,
    width: el.width,
    height: el.height,
    display: "flex",
    alignItems: "center",
    justifyContent: el.type === "text" ? "flex-start" : "center",
    boxSizing: "border-box",
    fontSize: el.fontSize,
    lineHeight: 1.2,
    color: "#f5f5f7",
    fontFamily: "system-ui, sans-serif",
    fontWeight: el.role === "headline" ? 700 : el.role === "price" ? 600 : 400,
    background: el.type === "image" ? "#3a3f4b" : el.type === "button" ? "#4d7cfe" : "transparent",
    border: el.type === "button" ? "none" : undefined,
    borderRadius: el.type === "button" ? 6 : el.type === "image" ? 4 : 0,
    overflow: "hidden",
    transition: TRANSITION,
  };
}

function ellipsisStyle(textAlign: CSSProperties["textAlign"]): CSSProperties {
  return {
    minWidth: 0,
    width: "100%",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    textAlign,
  };
}

export function LayoutRenderer({ layout }: { layout: ResolvedLayout }) {
  return (
    <div
      style={{
        position: "relative",
        width: layout.surfaceWidth,
        height: layout.surfaceHeight,
        background: "#111318",
        overflow: "hidden",
      }}
    >
      {layout.elements.map((el) => {
        if (el.type === "button") {
          return (
            <button key={el.id} type="button" style={boxStyle(el)}>
              <span style={ellipsisStyle("center")}>{el.content}</span>
            </button>
          );
        }
        if (el.type === "image") {
          return <div key={el.id} role="img" aria-label={el.role} style={boxStyle(el)} />;
        }
        return (
          <div key={el.id} style={boxStyle(el)} title={el.truncated ? el.content : undefined}>
            <span style={ellipsisStyle("left")}>{el.content}</span>
          </div>
        );
      })}
    </div>
  );
}
