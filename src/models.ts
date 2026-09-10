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
}

export const jacketModels: JacketModel[] = [
  { id: "shell", label: "Shell", url: "/models/jacket.glb", aspectRatio: 1.314 },
  { id: "coat", label: "Coat", url: "/models/jacket-coat.glb", aspectRatio: 0.88 },
  { id: "1875", label: "1875", url: "/models/jacket-1875.glb", aspectRatio: 1.042 },
  { id: "ninja", label: "Ninja", url: "/models/jacket-ninja.glb", aspectRatio: 1.505 },
];

export const defaultJacketModel = jacketModels[0];
