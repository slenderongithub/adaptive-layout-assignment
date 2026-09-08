export type ElementType = "text" | "image" | "button";
export type ElementRole =
  | "headline"
  | "price"
  | "secondary"
  | "hero-image"
  | "branding"
  | "cta";

interface BaseElementSpec {
  id: string;
  role: ElementRole;
  /** 1 = most important. Lower numbers survive degradation longer. */
  priority: number;
  /** default: false for headline/cta, true otherwise */
  canDrop?: boolean;
  /** text only */
  canTruncate?: boolean;
}

export interface TextElementSpec extends BaseElementSpec {
  type: "text";
  content: string;
  minFontSize?: number;
}

export interface ImageElementSpec extends BaseElementSpec {
  type: "image";
  src: string;
  /** required — avoids distortion on resize */
  aspectRatio: number;
}

export interface ButtonElementSpec extends BaseElementSpec {
  type: "button";
  label: string;
}

export type ElementSpec = TextElementSpec | ImageElementSpec | ButtonElementSpec;

export interface AdSpec {
  id: string;
  elements: ElementSpec[];
}

declare const validated: unique symbol;
export type Validated<T> = T & { readonly [validated]: true };

function defaultCanDrop(role: ElementRole): boolean {
  return role !== "headline" && role !== "cta";
}

export function defineAdSpec(spec: AdSpec): Validated<AdSpec> {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  for (const el of spec.elements) {
    if (seenIds.has(el.id)) {
      errors.push(`duplicate element id "${el.id}"`);
    }
    seenIds.add(el.id);

    if (!Number.isInteger(el.priority) || el.priority < 1) {
      errors.push(`element "${el.id}": priority must be a positive integer, got ${el.priority}`);
    }

    if (el.type === "image" && !(el.aspectRatio > 0)) {
      errors.push(`element "${el.id}": image aspectRatio must be > 0, got ${el.aspectRatio}`);
    }
  }

  if (!spec.elements.some((el) => el.role === "headline")) {
    errors.push('spec is missing a required element with role "headline"');
  }
  if (!spec.elements.some((el) => el.role === "cta")) {
    errors.push('spec is missing a required element with role "cta"');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid AdSpec "${spec.id}":\n  - ${errors.join("\n  - ")}`);
  }

  const elements = spec.elements.map((el) => ({
    ...el,
    canDrop: el.canDrop ?? defaultCanDrop(el.role),
  }));

  return { ...spec, elements } as Validated<AdSpec>;
}
