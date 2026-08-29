export type ViewMode = 'first' | 'third' | 'front';
export type AvatarStyle = 'classic' | 'stocky' | 'tall' | 'slim';
export type HatStyle =
  | 'none'
  | 'cap'
  | 'band'
  | 'hood'
  | 'beanie'
  | 'visor'
  | 'crown'
  | 'helm';
export type HairStyle =
  | 'none'
  | 'short'
  | 'long'
  | 'spiky'
  | 'curly'
  | 'mohawk'
  | 'bun'
  | 'afro'
  | 'bangs';
export type FaceStyle =
  | 'neutral'
  | 'smile'
  | 'frown'
  | 'scar'
  | 'wink'
  | 'cool'
  | 'blush'
  | 'freckles'
  | 'kawaii';
export type GlassesStyle = 'none' | 'round' | 'square' | 'shades';
export type FacialStyle = 'none' | 'stubble' | 'beard' | 'mustache';
export type SleeveStyle = 'bare' | 'short' | 'long';
export type CapeStyle = 'none' | 'short' | 'long';
export type BackpackStyle = 'none' | 'pack' | 'satchel';
export type BeltStyle = 'none' | 'leather' | 'utility';

export type ChestPropStyle = 'teddy' | 'frog' | 'none';

export interface Profile {
  name: string;
  accent: string;
  skin: string;
  outfit: string;
  pants: string;
  hair: string;
  eyes: string;
  shoes: string;
  style: AvatarStyle;
  hat: HatStyle;
  hairStyle: HairStyle;
  face: FaceStyle;
  glasses: GlassesStyle;
  facial: FacialStyle;
  sleeves: SleeveStyle;
  cape: CapeStyle;
  backpack: BackpackStyle;
  belt: BeltStyle;
  /** 3D chest accessory (girl teddy / boy frog pouch). */
  chestProp?: ChestPropStyle;
  /** Aesthetic skin builder variant (girl lolita / boy streetwear). */
  aestheticVariant?: 'girl' | 'boy';
  aestheticBoyStyle?: 'hoodie' | 'overalls';
  /** Minecraft-style 64×64 PNG data URL (pixel skin). */
  skinData?: string;
}

export type TexturePack = 'default' | 'goodvibes';

export interface Settings {
  mouseSensitivity: number;
  fov: number;
  viewMode: ViewMode;
  renderDistance: number;
  invertY: boolean;
  showFps: boolean;
  clouds: number;
  underwaterFx: boolean;
  brightness: number;
  texturePack: TexturePack;
}

const PROFILE_KEY = 'wildreach.profile';
const PROFILE_EPOCH_KEY = 'wildreach.profileEpoch';
const PROFILE_EPOCH = 6;
const SETTINGS_KEY = 'wildreach.settings';

const DEFAULT_PROFILE: Profile = {
  name: 'Wanderer',
  accent: '#C9A8A8',
  skin: '#C4B4A8',
  outfit: '#3A383C',
  pants: '#E8E4DE',
  hair: '#8B8178',
  eyes: '#252528',
  shoes: '#3D3835',
  style: 'classic',
  hat: 'none',
  hairStyle: 'short',
  face: 'neutral',
  glasses: 'none',
  facial: 'none',
  sleeves: 'long',
  cape: 'none',
  backpack: 'none',
  belt: 'none',
  chestProp: 'none',
};

const DEFAULT_SETTINGS: Settings = {
  mouseSensitivity: 0.04,
  fov: 75,
  viewMode: 'first',
  renderDistance: 7,
  invertY: false,
  showFps: false,
  clouds: 0.7,
  underwaterFx: true,
  brightness: 1,
  texturePack: 'default',
};

const HATS: HatStyle[] = ['none', 'cap', 'band', 'hood', 'beanie', 'visor', 'crown', 'helm'];
const STYLES: AvatarStyle[] = ['classic', 'stocky', 'tall', 'slim'];
const HAIR_STYLES: HairStyle[] = [
  'none',
  'short',
  'long',
  'spiky',
  'curly',
  'mohawk',
  'bun',
  'afro',
  'bangs',
];
const FACES: FaceStyle[] = [
  'neutral',
  'smile',
  'frown',
  'scar',
  'wink',
  'cool',
  'blush',
  'freckles',
  'kawaii',
];
const GLASSES: GlassesStyle[] = ['none', 'round', 'square', 'shades'];
const FACIALS: FacialStyle[] = ['none', 'stubble', 'beard', 'mustache'];
const SLEEVES: SleeveStyle[] = ['bare', 'short', 'long'];
const CAPES: CapeStyle[] = ['none', 'short', 'long'];
const BACKPACKS: BackpackStyle[] = ['none', 'pack', 'satchel'];
const BELTS: BeltStyle[] = ['none', 'leather', 'utility'];

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...fallback };
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return { ...fallback };
  }
}


export function loadProfile(): Profile {
  let epoch = 0;
  try {
    epoch = Number(localStorage.getItem(PROFILE_EPOCH_KEY)) || 0;
  } catch {
    epoch = 0;
  }

  const p = readJson(PROFILE_KEY, DEFAULT_PROFILE);
  p.name = (p.name || DEFAULT_PROFILE.name).slice(0, 20);
  p.accent = p.accent || DEFAULT_PROFILE.accent;
  p.skin = p.skin || DEFAULT_PROFILE.skin;
  p.outfit = p.outfit || DEFAULT_PROFILE.outfit;
  p.pants = p.pants || DEFAULT_PROFILE.pants;
  p.hair = p.hair || DEFAULT_PROFILE.hair;
  p.eyes = p.eyes || DEFAULT_PROFILE.eyes;
  p.shoes = p.shoes || DEFAULT_PROFILE.shoes;
  p.style = STYLES.includes(p.style) ? p.style : 'classic';
  p.hat = HATS.includes(p.hat) ? p.hat : 'none';
  p.hairStyle = HAIR_STYLES.includes(p.hairStyle) ? p.hairStyle : 'short';
  p.face = FACES.includes(p.face) ? p.face : 'neutral';
  p.glasses = GLASSES.includes(p.glasses) ? p.glasses : 'none';
  p.facial = FACIALS.includes(p.facial) ? p.facial : 'none';
  p.sleeves = SLEEVES.includes(p.sleeves) ? p.sleeves : 'long';
  p.cape = CAPES.includes(p.cape) ? p.cape : 'none';
  p.backpack = BACKPACKS.includes(p.backpack) ? p.backpack : 'none';
  p.belt = BELTS.includes(p.belt) ? p.belt : 'none';
  if (typeof p.skinData === 'string' && p.skinData.startsWith('data:image')) {
    // keep
  } else {
    delete p.skinData;
  }

  if (epoch < PROFILE_EPOCH) {
    const name = p.name;
    Object.assign(p, { ...DEFAULT_PROFILE, name });
    delete p.skinData;
    try {
      localStorage.setItem(PROFILE_EPOCH_KEY, String(PROFILE_EPOCH));
      saveProfile(p);
    } catch {
      /* ignore */
    }
  }

  return p;
}

export function saveProfile(profile: Profile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function loadSettings(): Settings {
  const s = readJson(SETTINGS_KEY, DEFAULT_SETTINGS);
  s.mouseSensitivity = Math.min(0.20, Math.max(0.01, Number(s.mouseSensitivity) || 0.04));
  s.fov = Math.min(100, Math.max(55, Number(s.fov) || 75));
  s.viewMode =
    s.viewMode === 'third' || s.viewMode === 'front' ? s.viewMode : 'first';
  s.renderDistance = Math.min(8, Math.max(3, Math.round(Number(s.renderDistance) || 6)));
  s.invertY = !!s.invertY;
  s.showFps = !!s.showFps;
  s.clouds = Math.min(1, Math.max(0, Number(s.clouds) || 0.7));
  s.underwaterFx = s.underwaterFx !== false;
  s.brightness = Math.min(1.4, Math.max(0.6, Number(s.brightness) || 1));
  s.texturePack = s.texturePack === 'goodvibes' ? 'goodvibes' : 'default';
  return s;
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/** Random quick-look using muted block palette. */
export function randomizeProfile(name = DEFAULT_PROFILE.name): Profile {
  return {
    name: name.slice(0, 20) || DEFAULT_PROFILE.name,
    skin: pick(['#C4B4A8', '#B8A898', '#D0C4B8']),
    outfit: pick(['#3A383C', '#2A282C', '#4A484C']),
    pants: pick(['#E8E4DE', '#D8D4CE', '#F0ECE6']),
    accent: pick(['#C9A8A8', '#B89898', '#A88888']),
    hair: pick(['#8B8178', '#7A716A', '#6E665E']),
    eyes: pick(['#252528', '#1A1A1C', '#3A383C']),
    shoes: pick(['#3D3835', '#2A2826', '#4A4038']),
    style: pick(['classic', 'classic', 'stocky']),
    hat: 'none',
    hairStyle: pick(['short', 'long', 'bangs']),
    face: pick(['neutral', 'smile']),
    glasses: 'none',
    facial: 'none',
    sleeves: 'long',
    cape: 'none',
    backpack: 'none',
    belt: 'none',
    chestProp: 'none',
  };
}

export interface WardrobeSlot {
  id: string;
  name: string;
  savedAt: number;
  profile: Profile;
}

const WARDROBE_KEY = 'wildreach.wardrobe';
const WARDROBE_MAX = 12;

export function loadWardrobe(): WardrobeSlot[] {
  try {
    const raw = localStorage.getItem(WARDROBE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as WardrobeSlot[];
    return Array.isArray(list) ? list.slice(0, WARDROBE_MAX) : [];
  } catch {
    return [];
  }
}

export function saveWardrobeSlot(profile: Profile, name?: string): WardrobeSlot[] {
  const list = loadWardrobe();
  const slot: WardrobeSlot = {
    id: `look-${Date.now().toString(36)}`,
    name: (name || profile.name || 'Look').slice(0, 24),
    savedAt: Date.now(),
    profile: JSON.parse(JSON.stringify(profile)) as Profile,
  };
  list.unshift(slot);
  const next = list.slice(0, WARDROBE_MAX);
  localStorage.setItem(WARDROBE_KEY, JSON.stringify(next));
  return next;
}

export function deleteWardrobeSlot(id: string): WardrobeSlot[] {
  const next = loadWardrobe().filter((s) => s.id !== id);
  localStorage.setItem(WARDROBE_KEY, JSON.stringify(next));
  return next;
}

export const SKIN_SWATCHES = [
  '#fff5f5', '#fff8f8', '#fff5f0', '#ffffff', '#f5e0d0', '#ffb4b4', '#e8c4a8', '#f0d5b8', '#c48a6a', '#8d5524',
  '#5c3a2e', '#4a3728',
];
export const OUTFIT_SWATCHES = [
  '#f4b8c8', '#f0b0c0', '#b8cce8', '#4a4850', '#c8bcc8', '#5ec4b0', '#4a7c6f', '#3d5a80', '#7b6b8a', '#9b59b6',
  '#e8c56a', '#1a1a1a',
];
export const PANTS_SWATCHES = [
  '#ffffff', '#e8e8f0', '#f8f8ff', '#5a5860', '#3d5a80', '#2f3e46', '#4a7c6f', '#737a85', '#1a1a1a', '#5ec4b0',
  '#e8c56a', '#c0392b',
];
export const ACCENT_SWATCHES = [
  '#ffb6c8', '#ffc8d8', '#f4b8c8', '#c8d8f0', '#ffffff', '#e8c56a', '#5ec4b0', '#7aa2ff', '#c9a0dc', '#73d9e6',
  '#f1c40f', '#1a1a1a',
];
export const HAIR_SWATCHES = [
  '#c8bcc8', '#c4b8c8', '#b8a898', '#b0a898', '#a89888', '#ce93d8', '#4a3728', '#6b4423', '#1a1a1a', '#f5e0d0',
  '#ffffff', '#27ae60',
];
export const EYE_SWATCHES = [
  '#3a3a48', '#404050', '#2a2a30', '#1a1a1a', '#2e6b9e', '#27ae60', '#7aa2ff', '#9b59b6', '#5ec4b0', '#ffffff',
  '#c0392b', '#f1c40f',
];
export const SHOE_SWATCHES = [
  '#9898a8', '#a0a0b0', '#888898', '#787880', '#1a1a1a', '#4a3728', '#3d5a80', '#2f3e46', '#ffffff', '#737a85',
  '#c0392b', '#9b59b6',
];
