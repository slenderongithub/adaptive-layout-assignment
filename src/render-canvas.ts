import type { ResolvedLayout } from "./types";

const COLORS = {
  bg: "#111318",
  image: "#3a3f4b",
  button: "#4d7cfe",
  text: "#f5f5f7",
};

/** Draws a resolved layout directly with the Canvas 2D API — same ResolvedElement[]
 * input as render-dom.tsx, zero resolver changes needed. */
export function drawLayout(ctx: CanvasRenderingContext2D, layout: ResolvedLayout): void {
  ctx.clearRect(0, 0, layout.surfaceWidth, layout.surfaceHeight);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, layout.surfaceWidth, layout.surfaceHeight);

  for (const el of layout.elements) {
    if (el.type === "image") {
      ctx.fillStyle = COLORS.image;
      ctx.fillRect(el.x, el.y, el.width, el.height);
      continue;
    }
    if (el.type === "button") {
      ctx.fillStyle = COLORS.button;
      ctx.fillRect(el.x, el.y, el.width, el.height);
      ctx.fillStyle = COLORS.text;
      ctx.font = "600 16px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(el.content ?? "", el.x + el.width / 2, el.y + el.height / 2, el.width - 16);
      continue;
    }
    // text
    ctx.fillStyle = COLORS.text;
    ctx.font = `${el.role === "headline" ? 700 : el.role === "price" ? 600 : 400} ${el.fontSize ?? 16}px system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(el.content ?? "", el.x, el.y + el.height / 2, el.width);
  }
}
