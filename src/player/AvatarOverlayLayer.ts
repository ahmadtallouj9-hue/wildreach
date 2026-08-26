import * as THREE from 'three';
import {
  BOX_FACE_SYNC,
  BOX_FACES,
  copyRectToCanvas,
  type SkinFace,
} from './SkinAtlas';
import { OVERLAY_PART_UV, OVERLAY_SHELL, type OverlayPart } from './SkinOverlayUV';

type PartMats = THREE.MeshLambertMaterial[];

const OVERLAY_PARTS: OverlayPart[] = ['bodyOL', 'armROL', 'armLOL', 'legROL', 'legLOL'];

/** Base cuboid sizes — must match PlayerAvatar part dimensions. */
const OVERLAY_BASE: Record<OverlayPart, [number, number, number]> = {
  bodyOL: [0.52, 0.68, 0.3],
  armROL: [0.18, 0.64, 0.18],
  armLOL: [0.18, 0.64, 0.18],
  legROL: [0.22, 0.8, 0.22],
  legLOL: [0.22, 0.8, 0.22],
};

function shellScale(w: number, h: number, d: number): THREE.Vector3 {
  return new THREE.Vector3(
    1 + (2 * OVERLAY_SHELL) / w,
    1 + (2 * OVERLAY_SHELL) / h,
    1 + (2 * OVERLAY_SHELL) / d,
  );
}

export interface OverlayMeshes {
  bodyOL: THREE.Mesh;
  armROL: THREE.Mesh;
  armLOL: THREE.Mesh;
  legROL: THREE.Mesh;
  legLOL: THREE.Mesh;
}

export function createAvatarOverlayMeshes(
  makeMats: (part: OverlayPart, transparent: boolean) => PartMats,
): OverlayMeshes {
  const mk = (part: OverlayPart, pivotTop = false) => {
    const [w, h, d] = OVERLAY_BASE[part];
    const g = new THREE.BoxGeometry(w, h, d);
    if (pivotTop) g.translate(0, -h * 0.5, 0);
    const mesh = new THREE.Mesh(g, makeMats(part, true));
    mesh.scale.copy(shellScale(w, h, d));
    mesh.castShadow = true;
    mesh.visible = false;
    mesh.renderOrder = 2;
    return mesh;
  };

  return {
    bodyOL: mk('bodyOL', false),
    armROL: mk('armROL', true),
    armLOL: mk('armLOL', true),
    legROL: mk('legROL', true),
    legLOL: mk('legLOL', true),
  };
}

export function syncOverlayTextures(
  pixels: Uint8ClampedArray,
  canvases: Map<string, HTMLCanvasElement>,
  textures: Map<string, THREE.CanvasTexture>,
  setVisible: (part: OverlayPart, visible: boolean) => void,
): void {
  for (const part of OVERLAY_PARTS) {
    let painted = 0;
    for (const face of BOX_FACES) {
      const key = `${part}:${face}`;
      const canvas = canvases.get(key);
      const tex = textures.get(key);
      if (!canvas || !tex) continue;
      const rect = OVERLAY_PART_UV[part][face];
      copyRectToCanvas(pixels, rect, canvas, BOX_FACE_SYNC[face as SkinFace]);
      tex.needsUpdate = true;
      for (let y = rect.y; y < rect.y + rect.h; y++) {
        for (let x = rect.x; x < rect.x + rect.w; x++) {
          const i = (y * 64 + x) * 4;
          const a = pixels[i + 3]!;
          // Ignore opaque black filler (common unused atlas padding).
          if (a > 16 && pixels[i]! + pixels[i + 1]! + pixels[i + 2]! > 0) painted++;
        }
      }
    }
    setVisible(part, painted > 4);
  }
}

export function makeOverlayPartMats(
  part: OverlayPart,
  canvases: Map<string, HTMLCanvasElement>,
  textures: Map<string, THREE.CanvasTexture>,
): PartMats {
  return BOX_FACES.map((face) => {
    const key = `${part}:${face}`;
    const rect = OVERLAY_PART_UV[part][face];
    const canvas = document.createElement('canvas');
    canvas.width = rect.w;
    canvas.height = rect.h;
    canvases.set(key, canvas);
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    textures.set(key, tex);
    return new THREE.MeshLambertMaterial({
      map: tex,
      color: 0xffffff,
      emissive: 0x000000,
      emissiveIntensity: 0,
      transparent: true,
      alphaTest: 0.12,
      side: THREE.FrontSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      depthWrite: true,
    });
  });
}
