import { defaultJacketModel, type JacketModel } from "./models";
import { defineAdSpec } from "./spec";

/**
 * One spec, one product, four bodies. Only the hero element varies per model —
 * its src and the aspect its plate should take — so swapping the jacket
 * re-runs the same resolver against the same copy and priorities.
 *
 * Priority answers one question only: what survives when the surface runs out
 * of room. It is not reading order — the resolver has its own READING_ORDER for
 * that. On a 300x100 widget a shopper needs the price more than a product
 * photo, so price outranks the hero image here.
 */
export function buildAdSpec(model: JacketModel) {
  return defineAdSpec({
    id: "nomad-shell-jacket",
    elements: [
      {
        id: "hero",
        type: "image",
        role: "hero-image",
        priority: 3,
        aspectRatio: model.aspectRatio,
        canDrop: true,
        src: model.url,
      },
      {
        id: "headline",
        type: "text",
        role: "headline",
        priority: 1,
        canDrop: false,
        canTruncate: false,
        content: model.headline,
      },
      {
        id: "price",
        type: "text",
        role: "price",
        priority: 2,
        canDrop: true,
        canTruncate: false,
        content: model.price,
      },
      {
        id: "secondary",
        type: "text",
        role: "secondary",
        priority: 4,
        canDrop: true,
        canTruncate: true,
        content: model.description,
      },
      {
        id: "cta",
        type: "button",
        role: "cta",
        priority: 1,
        canDrop: false,
        label: "Shop Now",
      },
      {
        id: "branding",
        type: "image",
        role: "branding",
        priority: 5,
        canDrop: true,
        aspectRatio: 1,
        src: "nomad-mark",
      },
    ],
  });
}

export const jacketAdSpec = buildAdSpec(defaultJacketModel);
