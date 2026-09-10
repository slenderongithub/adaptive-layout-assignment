import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { Box3, Matrix4, Vector3, type Group, type Mesh } from "three";
import { captureHeroSnapshot } from "./heroSnapshot";
import { defaultJacketModel } from "./models";

const ROTATION_SPEED = 0.5; // rad/sec
/** Fraction of the frame the product fills once fitted. */
const FILL = 0.92;
/** Let the model load and render a frame, then snapshot for the Canvas path. */
const SNAPSHOT_DELAY_MS = 700;

/**
 * Renders a GLB centred and scaled to fill its frame on any surface.
 *
 * The fit is computed from the model's own bounding box against the live
 * viewport, rather than by `<Bounds fit observe>` + `<Center>`:
 *
 *  - `Center`/`Bounds` measure the model in ONE pose. `Spinner` then rotates it
 *    inside that measured box, so the silhouette sweeps outside the frame and
 *    clips at some angles. The old code papered over this with `margin={1.6}`,
 *    which fixed the clipping by rendering the product at ~62% of its frame —
 *    which is why it read as tiny everywhere.
 *  - The model only spins about Y, so the horizontal extent it *ever* occupies
 *    is the radius of the circle its footprint sweeps: hypot(sizeX, sizeZ)/2.
 *    Fitting that instead of one pose means it cannot clip at any angle, so
 *    FILL can sit at 0.92 rather than 1/1.6.
 *  - Recentring on the true bbox centre (not the file's origin) is what puts it
 *    in the middle of the frame instead of drifting to a corner.
 *
 * The camera is orthographic so the fit is exact — with a perspective camera
 * the near face of a deep model overhangs the computed box.
 */
function FittedModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const viewport = useThree((state) => state.viewport);
  const spinner = useRef<Group>(null);

  const { center, sweptRadius, halfHeight } = useMemo(() => {
    // Measure in the model's OWN space. Box3.setFromObject() works in world
    // space, and useGLTF hands back a cached scene object — so once this
    // component has mounted it once, the scene's matrixWorld carries the
    // <group scale> below, and a naive re-measure on remount reports a box
    // several times too large. Taking each mesh's transform *relative to the
    // scene root* cancels every ancestor exactly.
    scene.updateWorldMatrix(false, true);
    const toLocal = new Matrix4().copy(scene.matrixWorld).invert();
    const relative = new Matrix4();
    const box = new Box3();
    scene.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      relative.multiplyMatrices(toLocal, mesh.matrixWorld);
      box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(relative));
    });

    const size = box.getSize(new Vector3());
    return {
      center: box.getCenter(new Vector3()),
      sweptRadius: Math.hypot(size.x, size.z) / 2,
      halfHeight: size.y / 2,
    };
  }, [scene]);

  const scale =
    Math.min(viewport.width / (sweptRadius * 2), viewport.height / (halfHeight * 2)) * FILL;

  useFrame((_state, delta) => {
    if (spinner.current) spinner.current.rotation.y += delta * ROTATION_SPEED;
  });

  return (
    <group scale={scale}>
      <group ref={spinner}>
        <group position={[-center.x, -center.y, -center.z]}>
          <primitive object={scene} />
        </group>
      </group>
    </group>
  );
}

/**
 * Mounted inside the Suspense boundary, so its effect only runs once the GLB
 * has actually resolved — no timer racing a 3MB download.
 */
function SnapshotBridge({ url }: { url: string }) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const timer = setTimeout(() => captureHeroSnapshot(url, gl.domElement), SNAPSHOT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [gl, url]);
  return null;
}

export function Hero3D({ modelUrl }: { modelUrl: string }) {
  return (
    <Canvas
      dpr={[1, 2]}
      orthographic
      // The model is scaled up to viewport units, so its depth can run to
      // hundreds of units either side of z=0; a default near/far would clip it.
      camera={{ zoom: 1, position: [0, 0, 10], near: -5000, far: 5000 }}
      // preserveDrawingBuffer keeps the framebuffer readable for the snapshot
      // the Canvas renderer draws; without it toDataURL() comes back blank.
      gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
      style={{ width: "100%", height: "100%" }}
    >
      {/* Lower ambient + a hotter key gives the fabric actual shadow contrast
          instead of the flat, everything-lit-equally look a high ambient
          produces. The rim light is what separates the garment's silhouette
          from the backdrop in both light and dark themes. */}
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 5, 2]} intensity={2.6} />
      <directionalLight position={[-3, -2, -4]} intensity={0.9} />
      <directionalLight position={[0, 2, -6]} intensity={1.3} />
      <Suspense fallback={null}>
        <FittedModel url={modelUrl} />
        <SnapshotBridge url={modelUrl} />
      </Suspense>
    </Canvas>
  );
}

useGLTF.preload(defaultJacketModel.url);
