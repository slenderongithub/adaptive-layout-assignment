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

const ELEMENT_TYPES: ElementType[] = ["text", "image", "button"];
const ELEMENT_ROLES: ElementRole[] = ["headline", "price", "secondary", "hero-image", "branding", "cta"];
const ROLE_TYPE: Record<ElementRole, ElementType> = {
  headline: "text",
  price: "text",
  secondary: "text",
  "hero-image": "image",
  branding: "image",
  cta: "button",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasRole(value: unknown): value is ElementRole {
  return typeof value === "string" && (ELEMENT_ROLES as string[]).includes(value);
}

function hasType(value: unknown): value is ElementType {
  return typeof value === "string" && (ELEMENT_TYPES as string[]).includes(value);
}

function invalidSpecMessage(spec: unknown, errors: string[]): Error {
  const id = isRecord(spec) && typeof spec.id === "string" && spec.id.trim() ? spec.id : "<unknown>";
  return new Error(`Invalid AdSpec "${id}":\n  - ${errors.join("\n  - ")}`);
}

function defaultCanDrop(role: ElementRole): boolean {
  return role !== "headline" && role !== "cta";
}

export function defineAdSpec(spec: AdSpec): Validated<AdSpec> {
  const errors: string[] = [];

  if (!isRecord(spec)) {
    throw invalidSpecMessage(spec, ["spec must be an object"]);
  }

  if (typeof spec.id !== "string" || spec.id.trim().length === 0) {
    errors.push("spec id must be a non-empty string");
  }

  if (!Array.isArray(spec.elements)) {
    throw invalidSpecMessage(spec, [...errors, "elements must be an array"]);
  }

  const seenIds = new Set<string>();
  const seenRoles = new Map<ElementRole, string>();

  for (const [index, el] of spec.elements.entries()) {
    if (!isRecord(el)) {
      errors.push(`element at index ${index}: must be an object`);
      continue;
    }

    const label = typeof el.id === "string" && el.id.trim() ? `"${el.id}"` : `at index ${index}`;

    if (typeof el.id !== "string" || el.id.trim().length === 0) {
      errors.push(`element ${label}: id must be a non-empty string`);
    }
    if (seenIds.has(el.id)) {
      errors.push(`duplicate element id "${el.id}"`);
    }
    if (typeof el.id === "string") seenIds.add(el.id);

    if (!Number.isInteger(el.priority) || !Number.isFinite(el.priority) || el.priority < 1) {
      errors.push(`element ${label}: priority must be a positive integer, got ${el.priority}`);
    }

    if (!hasType(el.type)) {
      errors.push(`element ${label}: type must be one of ${ELEMENT_TYPES.join(", ")}`);
    }

    if (!hasRole(el.role)) {
      errors.push(`element ${label}: role must be one of ${ELEMENT_ROLES.join(", ")}`);
    }

    if (hasRole(el.role) && hasType(el.type) && ROLE_TYPE[el.role] !== el.type) {
      errors.push(`element ${label}: role "${el.role}" must use type "${ROLE_TYPE[el.role]}", got "${el.type}"`);
    }

    if (hasRole(el.role)) {
      const previous = seenRoles.get(el.role);
      if (previous) errors.push(`duplicate element role "${el.role}" used by "${previous}" and "${el.id}"`);
      else if (typeof el.id === "string") seenRoles.set(el.role, el.id);
    }

    if (el.canDrop !== undefined && typeof el.canDrop !== "boolean") {
      errors.push(`element ${label}: canDrop must be a boolean when provided`);
    }
    if (el.canTruncate !== undefined && typeof el.canTruncate !== "boolean") {
      errors.push(`element ${label}: canTruncate must be a boolean when provided`);
    }

    if (el.type === "text") {
      if (typeof el.content !== "string" || el.content.trim().length === 0) {
        errors.push(`element ${label}: text content must be a non-empty string`);
      }
      if (
        el.minFontSize !== undefined &&
        (!(typeof el.minFontSize === "number") || !Number.isFinite(el.minFontSize) || el.minFontSize <= 0)
      ) {
        errors.push(`element ${label}: minFontSize must be a finite number > 0 when provided`);
      }
    }

    if (el.type === "image") {
      if (typeof el.src !== "string" || el.src.trim().length === 0) {
        errors.push(`element ${label}: image src must be a non-empty string`);
      }
      if (!(typeof el.aspectRatio === "number") || !Number.isFinite(el.aspectRatio) || !(el.aspectRatio > 0)) {
        errors.push(`element ${label}: image aspectRatio must be > 0, got ${el.aspectRatio}`);
      }
    }

    if (el.type === "button" && (typeof el.label !== "string" || el.label.trim().length === 0)) {
      errors.push(`element ${label}: button label must be a non-empty string`);
    }
  }

  if (!spec.elements.some((el) => el.role === "headline")) {
    errors.push('spec is missing a required element with role "headline"');
  }
  if (!spec.elements.some((el) => el.role === "cta")) {
    errors.push('spec is missing a required element with role "cta"');
  }

  if (errors.length > 0) {
    throw invalidSpecMessage(spec, errors);
  }

  const elements = spec.elements.map((el) => ({
    ...el,
    canDrop: el.canDrop ?? defaultCanDrop(el.role),
  }));

  return { ...spec, elements } as Validated<AdSpec>;
}
