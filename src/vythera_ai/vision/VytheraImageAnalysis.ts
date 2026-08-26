/** Structured VYTHERA image analysis — primary vision result (validated). */

export type VytheraImageCategory =
  | 'creature'
  | 'character'
  | 'weapon'
  | 'item'
  | 'environment'
  | 'structure'
  | 'tree'
  | 'rock'
  | 'terrain'
  | 'building'
  | 'prop'
  | 'biome'
  | 'decoration'
  | 'texture'
  | 'ui'
  | 'unknown';

export interface VytheraImageAnalysis {
  type: 'vythera_image_analysis';
  subject: {
    category: VytheraImageCategory;
    name: string | null;
  };
  shape: {
    silhouette: string;
    proportions: Record<string, number>;
    symmetry: string;
  };
  palette: {
    colors: [number, number, number, number][];
  };
  materials: string[];
  features: string[];
  style: {
    voxelLike: boolean;
    chunkiness: number;
    detailLevel: number;
    styleNotes: string[];
    pixelArt?: boolean;
    textureNotes?: string[];
  };
  components: { name: string; role: string }[];
  animationHints: string[];
  behaviorHints: string[];
  confidence: number;
  /** Extended scene understanding — optional, validated when present. */
  scene?: {
    description: string;
    objects: { name: string; type: string; relation?: string }[];
    terrain: string;
    vegetation: string;
    architecture: string;
    lighting: string;
    composition: string;
    depthLayout: string;
    voxelSuitability: number;
    possibleAssets: string[];
  };
}

const CATEGORIES = new Set<string>([
  'creature',
  'character',
  'weapon',
  'item',
  'environment',
  'structure',
  'tree',
  'rock',
  'terrain',
  'building',
  'prop',
  'biome',
  'decoration',
  'texture',
  'ui',
  'unknown',
]);

function fin(n: unknown): boolean {
  return typeof n === 'number' && Number.isFinite(n);
}

function rgba(c: unknown): [number, number, number, number] | null {
  if (!Array.isArray(c) || c.length < 3) return null;
  const r = Number(c[0]),
    g = Number(c[1]),
    b = Number(c[2]),
    a = c.length >= 4 ? Number(c[3]) : 255;
  if (![r, g, b, a].every(fin) || [r, g, b, a].some((v) => v < 0 || v > 255)) return null;
  return [Math.round(r), Math.round(g), Math.round(b), Math.round(a)];
}

export function validateImageAnalysis(data: unknown): VytheraImageAnalysis {
  if (!data || typeof data !== 'object') throw new Error('analysis root must be object');
  const o = data as Record<string, unknown>;
  if (o.type !== 'vythera_image_analysis') throw new Error('type must be vythera_image_analysis');

  const subjectRaw = (o.subject && typeof o.subject === 'object' ? o.subject : {}) as Record<
    string,
    unknown
  >;
  const category = String(subjectRaw.category ?? 'unknown');
  if (!CATEGORIES.has(category)) throw new Error(`invalid category ${category}`);

  const shapeRaw = (o.shape && typeof o.shape === 'object' ? o.shape : {}) as Record<string, unknown>;
  const proportions: Record<string, number> = {};
  if (shapeRaw.proportions && typeof shapeRaw.proportions === 'object') {
    for (const [k, v] of Object.entries(shapeRaw.proportions as Record<string, unknown>)) {
      const n = Number(v);
      if (fin(n) && n >= 0 && n <= 1) proportions[k.slice(0, 32)] = n;
    }
  }

  const paletteRaw = (o.palette && typeof o.palette === 'object' ? o.palette : {}) as Record<
    string,
    unknown
  >;
  const colorsIn = Array.isArray(paletteRaw.colors) ? paletteRaw.colors : [];
  const colors: [number, number, number, number][] = [];
  for (const c of colorsIn.slice(0, 16)) {
    const rgbaC = rgba(c);
    if (!rgbaC) throw new Error('invalid palette color in analysis');
    colors.push(rgbaC);
  }

  const styleRaw = (o.style && typeof o.style === 'object' ? o.style : {}) as Record<string, unknown>;
  const chunkiness = Number(styleRaw.chunkiness ?? 0.5);
  const detailLevel = Number(styleRaw.detailLevel ?? 0.5);
  if (!fin(chunkiness) || chunkiness < 0 || chunkiness > 1) throw new Error('invalid chunkiness');
  if (!fin(detailLevel) || detailLevel < 0 || detailLevel > 1) throw new Error('invalid detailLevel');

  const confidence = Number(o.confidence ?? 0.5);
  if (!fin(confidence) || confidence < 0 || confidence > 1) throw new Error('invalid confidence');

  const componentsIn = Array.isArray(o.components) ? o.components : [];
  const components: { name: string; role: string }[] = [];
  for (const c of componentsIn.slice(0, 32)) {
    if (!c || typeof c !== 'object') continue;
    const row = c as Record<string, unknown>;
    components.push({
      name: String(row.name ?? 'part').slice(0, 64),
      role: String(row.role ?? 'unknown').slice(0, 64),
    });
  }

  return {
    type: 'vythera_image_analysis',
    subject: {
      category: category as VytheraImageCategory,
      name: typeof subjectRaw.name === 'string' ? subjectRaw.name.slice(0, 64) : null,
    },
    shape: {
      silhouette: String(shapeRaw.silhouette ?? '').slice(0, 200),
      proportions,
      symmetry: String(shapeRaw.symmetry ?? 'unknown').slice(0, 64),
    },
    palette: { colors },
    materials: Array.isArray(o.materials)
      ? o.materials.filter((x): x is string => typeof x === 'string').slice(0, 16)
      : [],
    features: Array.isArray(o.features)
      ? o.features.filter((x): x is string => typeof x === 'string').slice(0, 32)
      : [],
    style: {
      voxelLike: styleRaw.voxelLike !== false,
      chunkiness,
      detailLevel,
      styleNotes: Array.isArray(styleRaw.styleNotes)
        ? styleRaw.styleNotes.filter((x): x is string => typeof x === 'string').slice(0, 16)
        : [],
      pixelArt: styleRaw.pixelArt === true,
      textureNotes: Array.isArray(styleRaw.textureNotes)
        ? styleRaw.textureNotes.filter((x): x is string => typeof x === 'string').slice(0, 16)
        : [],
    },
    components,
    animationHints: Array.isArray(o.animationHints)
      ? o.animationHints.filter((x): x is string => typeof x === 'string').slice(0, 16)
      : [],
    behaviorHints: Array.isArray(o.behaviorHints)
      ? o.behaviorHints.filter((x): x is string => typeof x === 'string').slice(0, 16)
      : [],
    confidence,
    scene: parseScene(o.scene),
  };
}

function parseScene(raw: unknown): VytheraImageAnalysis['scene'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const s = raw as Record<string, unknown>;
  const objectsIn = Array.isArray(s.objects) ? s.objects : [];
  const objects: { name: string; type: string; relation?: string }[] = [];
  for (const obj of objectsIn.slice(0, 32)) {
    if (!obj || typeof obj !== 'object') continue;
    const row = obj as Record<string, unknown>;
    objects.push({
      name: String(row.name ?? 'object').slice(0, 64),
      type: String(row.type ?? 'unknown').slice(0, 64),
      relation: typeof row.relation === 'string' ? row.relation.slice(0, 128) : undefined,
    });
  }
  const voxelSuitability = Number(s.voxelSuitability ?? 0.5);
  if (!fin(voxelSuitability) || voxelSuitability < 0 || voxelSuitability > 1) {
    throw new Error('invalid scene.voxelSuitability');
  }
  return {
    description: String(s.description ?? '').slice(0, 400),
    objects,
    terrain: String(s.terrain ?? '').slice(0, 128),
    vegetation: String(s.vegetation ?? '').slice(0, 128),
    architecture: String(s.architecture ?? '').slice(0, 128),
    lighting: String(s.lighting ?? '').slice(0, 128),
    composition: String(s.composition ?? '').slice(0, 128),
    depthLayout: String(s.depthLayout ?? '').slice(0, 128),
    voxelSuitability,
    possibleAssets: Array.isArray(s.possibleAssets)
      ? s.possibleAssets.filter((x): x is string => typeof x === 'string').slice(0, 24)
      : [],
  };
}

export const VISION_ANALYSIS_SYSTEM = `You are VYTHERA Vision. Analyze the image for the VYTHERA voxel game.
Output ONLY JSON matching:
{"type":"vythera_image_analysis","subject":{"category":"creature|character|weapon|item|environment|structure|tree|rock|terrain|building|prop|biome|decoration|texture|ui|unknown","name":null},"shape":{"silhouette":"...","proportions":{},"symmetry":"..."},"palette":{"colors":[[r,g,b,a]]},"materials":[],"features":[],"style":{"voxelLike":true,"chunkiness":0.0,"detailLevel":0.0,"styleNotes":[],"pixelArt":false,"textureNotes":[]},"components":[{"name":"...","role":"..."}],"animationHints":[],"behaviorHints":[],"confidence":0.0,"scene":{"description":"...","objects":[{"name":"...","type":"...","relation":"..."}],"terrain":"...","vegetation":"...","architecture":"...","lighting":"...","composition":"...","depthLayout":"...","voxelSuitability":0.0,"possibleAssets":[]}}
Colors RGBA 0..255. chunkiness/detailLevel/confidence/voxelSuitability in 0..1. Map visuals to VYTHERA game concepts. No executable code.`;
