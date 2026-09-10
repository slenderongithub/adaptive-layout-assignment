import { AD_FONT, type AdPalette } from "./adPalette";
import { getHeroSnapshot } from "./heroSnapshot";
import type { ResolvedElement, ResolvedLayout } from "./types";

/** Matches the resolver's LINE_HEIGHT and the DOM renderer's. */
const LINE_HEIGHT = 1.25;

/**
 * Draws a resolved layout with the Canvas 2D API — same ResolvedElement[] the
 * DOM renderer consumes, same `--ad-*` palette, same resolver-computed line
 * breaks. The point of this path is to prove the layout is renderer-agnostic,
 * so it deliberately reproduces the same design rather than inventing its own.
 *
 * The one thing 2D canvas cannot do is mount the GLB, so the hero draws the
 * still the 3D path snapshots (see heroSnapshot.ts), falling back to a styled
 * product plate before that arrives.
 */
export function drawLayout(ctx: CanvasRenderingContext2D, layout: ResolvedLayout, palette: AdPalette): void {
  const { surfaceWidth: w, surfaceHeight: h } = layout;

  ctx.clearRect(0, 0, w, h);
  const bg = ctx.createRadialGradient(w * 0.15, 0, 0, w * 0.15, 0, Math.hypot(w, h) * 1.2);
  bg.addColorStop(0, palette.bg1);
  bg.addColorStop(0.62, palette.bg2);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  for (const el of layout.elements) {
    if (el.type === "button") drawButton(ctx, el, palette);
    else if (el.role === "hero-image") drawHero(ctx, el, palette);
    else if (el.type === "image") drawMark(ctx, el, palette);
    else drawText(ctx, el, palette);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, el: ResolvedElement, radius: number): void {
  ctx.beginPath();
  ctx.roundRect(el.x, el.y, el.width, el.height, radius);
}

function drawButton(ctx: CanvasRenderingContext2D, el: ResolvedElement, palette: AdPalette): void {
  roundRect(ctx, el, el.height / 2);
  ctx.fillStyle = palette.ctaBg;
  ctx.fill();

  ctx.fillStyle = palette.ctaInk;
  ctx.font = `500 ${el.fontSize ?? 14}px ${AD_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(el.content ?? "", el.x + el.width / 2, el.y + el.height / 2 + 1);
}

function drawHero(ctx: CanvasRenderingContext2D, el: ResolvedElement, palette: AdPalette): void {
  ctx.save();
  roundRect(ctx, el, Math.min(24, el.width * 0.1));
  ctx.fillStyle = palette.frame;
  ctx.fill();
  ctx.clip();

  const snapshot = getHeroSnapshot(el.src);
  if (snapshot?.complete && snapshot.naturalWidth > 0) {
    // contain-fit, matching how Bounds frames the model in the 3D path
    const scale = Math.min(el.width / snapshot.naturalWidth, el.height / snapshot.naturalHeight);
    const dw = snapshot.naturalWidth * scale;
    const dh = snapshot.naturalHeight * scale;
    ctx.drawImage(snapshot, el.x + (el.width - dw) / 2, el.y + (el.height - dh) / 2, dw, dh);
  } else {
    const plate = ctx.createLinearGradient(el.x, el.y, el.x, el.y + el.height);
    plate.addColorStop(0, palette.markB);
    plate.addColorStop(1, palette.frame);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = plate;
    ctx.fillRect(el.x, el.y, el.width, el.height);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawMark(ctx: CanvasRenderingContext2D, el: ResolvedElement, palette: AdPalette): void {
  const gradient = ctx.createLinearGradient(el.x, el.y + el.height, el.x + el.width, el.y);
  gradient.addColorStop(0, palette.markA);
  gradient.addColorStop(1, palette.markB);

  ctx.beginPath();
  ctx.arc(el.x + el.width / 2, el.y + el.height / 2, Math.min(el.width, el.height) / 2, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.fillStyle = palette.markInk;
  ctx.font = `700 ${Math.max(9, el.height * 0.46)}px ${AD_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", el.x + el.width / 2, el.y + el.height / 2 + 1);
}

function drawText(ctx: CanvasRenderingContext2D, el: ResolvedElement, palette: AdPalette): void {
  const fontSize = el.fontSize ?? 16;
  const weight = el.role === "headline" ? 600 : el.role === "price" ? 700 : 400;
  ctx.fillStyle = el.role === "price" ? palette.accent : el.role === "secondary" ? palette.inkMuted : palette.ink;
  ctx.font = `${weight} ${fontSize}px ${AD_FONT}`;
  ctx.textBaseline = "middle";

  const centered = el.align === "center";
  ctx.textAlign = centered ? "center" : "left";
  const x = centered ? el.x + el.width / 2 : el.x;

  const lines = el.lines ?? [el.content ?? ""];
  const rowHeight = fontSize * LINE_HEIGHT;
  // The element box is exactly lines.length rows tall, so row centres are the
  // same ones the DOM renderer's flex column produces.
  const top = el.y + (el.height - rowHeight * lines.length) / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, x, top + rowHeight * (i + 0.5), el.width);
  });
}
