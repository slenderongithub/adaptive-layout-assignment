export interface JacketModel {
  id: string;
  label: string;
  url: string;
  /**
   * hypot(bboxX, bboxZ) / bboxY — the box the *spinning* product needs, not the
   * silhouette of one pose. Hero3D normalises each model's own scale at runtime
   * (these files range from 0.69 to 775 units tall), so this ratio is the only
   * per-model number the layout engine needs in order to shape the plate.
   *
   * Measured from each GLB's accessor bounds through its node transforms; see
   * the swept-volume note in Hero3D for why it is hypot(x, z) and not x.
   */
  aspectRatio: number;
  /** Ad copy — distinct per model so the switcher demo isn't the same five
   * words behind four different products. */
  headline: string;
  price: string;
  description: string;
}

export const jacketModels: JacketModel[] = [
  {
    id: "shell",
    label: "Shell",
    url: "/models/jacket.glb",
    aspectRatio: 1.314,
    headline: "Leather Jacket",
    price: "$199.00",
    description: "A classic leather jacket built for rugged durability. Features a timeless design and premium zippers.",
  },
  {
    id: "coat",
    label: "Coat",
    url: "/models/jacket-coat.glb",
    aspectRatio: 0.88,
    headline: "Winter Coat",
    price: "$349.00",
    description: "A sophisticated winter coat tailored for deep cold. Provides exceptional warmth and elegant styling.",
  },
  {
    id: "1875",
    label: "1875",
    url: "/models/jacket-1875.glb",
    aspectRatio: 1.042,
    headline: "Evening Dress",
    price: "$129.00",
    description: "A versatile evening dress designed for graceful movement. Features a flattering cut and soft fabric.",
  },
  {
    id: "ninja",
    label: "Ninja",
    url: "/models/jacket-ninja.glb",
    aspectRatio: 1.505,
    headline: "Biker Jacket",
    price: "$289.00",
    description: "An edgy biker jacket crafted for the modern road. Provides maximum protection and a rebellious vibe.",
  },
];

export const defaultJacketModel = jacketModels[0];
