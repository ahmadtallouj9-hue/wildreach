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
export type HairStyle = 'none' | 'short' | 'long' | 'spiky' | 'curly' | 'mohawk';
export type FaceStyle = 'neutral' | 'smile' | 'frown' | 'scar';
export type GlassesStyle = 'none' | 'round' | 'square' | 'shades';
export type FacialStyle = 'none' | 'stubble' | 'beard' | 'mustache';
export type SleeveStyle = 'bare' | 'short' | 'long';
export type CapeStyle = 'none' | 'short' | 'long';

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
  /** Minecraft-style 64×64 PNG data URL (pixel skin). */
  skinData?: string;
}

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
}

const PROFILE_KEY = 'wildreach.profile';
const SETTINGS_KEY = 'wildreach.settings';

const DEFAULT_PROFILE: Profile = {
  name: 'Wanderer',
  accent: '#e8c56a',
  skin: '#e8c4a8',
  outfit: '#5ec4b0',
  pants: '#3d5a80',
  hair: '#4a3728',
  eyes: '#2e6b9e',
  shoes: '#2f3e46',
  style: 'classic',
  hat: 'none',
  hairStyle: 'short',
  face: 'neutral',
  glasses: 'none',
  facial: 'none',
  sleeves: 'bare',
  cape: 'none',
};

const DEFAULT_SETTINGS: Settings = {
  mouseSensitivity: 1,
  fov: 75,
  viewMode: 'first',
  renderDistance: 6,
  invertY: false,
  showFps: false,
  clouds: 0.7,
  underwaterFx: true,
  brightness: 1,
};

const HATS: HatStyle[] = ['none', 'cap', 'band', 'hood', 'beanie', 'visor', 'crown', 'helm'];
const STYLES: AvatarStyle[] = ['classic', 'stocky', 'tall', 'slim'];
const HAIR_STYLES: HairStyle[] = ['none', 'short', 'long', 'spiky', 'curly', 'mohawk'];
const FACES: FaceStyle[] = ['neutral', 'smile', 'frown', 'scar'];
const GLASSES: GlassesStyle[] = ['none', 'round', 'square', 'shades'];
const FACIALS: FacialStyle[] = ['none', 'stubble', 'beard', 'mustache'];
const SLEEVES: SleeveStyle[] = ['bare', 'short', 'long'];
const CAPES: CapeStyle[] = ['none', 'short', 'long'];

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
  p.sleeves = SLEEVES.includes(p.sleeves) ? p.sleeves : 'bare';
  p.cape = CAPES.includes(p.cape) ? p.cape : 'none';
  if (typeof p.skinData === 'string' && p.skinData.startsWith('data:image')) {
    // keep
  } else {
    delete p.skinData;
  }
  return p;
}

export function saveProfile(profile: Profile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function loadSettings(): Settings {
  const s = readJson(SETTINGS_KEY, DEFAULT_SETTINGS);
  s.mouseSensitivity = Math.min(2.5, Math.max(0.35, Number(s.mouseSensitivity) || 1));
  s.fov = Math.min(100, Math.max(55, Number(s.fov) || 75));
  s.viewMode =
    s.viewMode === 'third' || s.viewMode === 'front' ? s.viewMode : 'first';
  s.renderDistance = Math.min(8, Math.max(3, Math.round(Number(s.renderDistance) || 6)));
  s.invertY = !!s.invertY;
  s.showFps = !!s.showFps;
  s.clouds = Math.min(1, Math.max(0, Number(s.clouds) || 0.7));
  s.underwaterFx = s.underwaterFx !== false;
  s.brightness = Math.min(1.4, Math.max(0.6, Number(s.brightness) || 1));
  return s;
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/** Random quick-look (clears custom pixel skin). */
export function randomizeProfile(name = DEFAULT_PROFILE.name): Profile {
  return {
    name: name.slice(0, 20) || DEFAULT_PROFILE.name,
    skin: pick(SKIN_SWATCHES),
    outfit: pick(OUTFIT_SWATCHES),
    pants: pick(PANTS_SWATCHES),
    accent: pick(ACCENT_SWATCHES),
    hair: pick(HAIR_SWATCHES),
    eyes: pick(EYE_SWATCHES),
    shoes: pick(SHOE_SWATCHES),
    style: pick(STYLES),
    hat: pick(HATS),
    hairStyle: pick(HAIR_STYLES),
    face: pick(FACES),
    glasses: pick(GLASSES),
    facial: pick(FACIALS),
    sleeves: pick(SLEEVES),
    cape: pick(CAPES),
  };
}

export const SKIN_SWATCHES = [
  '#f5e0d0', '#e8c4a8', '#f0d5b8', '#c48a6a', '#8d5524', '#5c3a2e', '#4a3728', '#e07a5f', '#ffb4b4', '#d1bd85',
  '#2f3e46', '#ffffff',
];
export const OUTFIT_SWATCHES = [
  '#5ec4b0', '#4a7c6f', '#3d5a80', '#2f3e46', '#e07a5f', '#7b6b8a', '#27ae60', '#737a85', '#c0392b', '#9b59b6',
  '#e8c56a', '#1a1a1a',
];
export const PANTS_SWATCHES = [
  '#3d5a80', '#2f3e46', '#4a7c6f', '#5c3a2e', '#737a85', '#1a1a1a', '#c0392b', '#7b6b8a', '#27ae60', '#e8c56a',
  '#5ec4b0', '#ffffff',
];
export const ACCENT_SWATCHES = [
  '#e8c56a', '#5ec4b0', '#7aa2ff', '#e07a5f', '#b8e0d2', '#c9a0dc', '#ff9500', '#ffffff', '#f1c40f', '#73d9e6',
  '#c0392b', '#1a1a1a',
];
export const HAIR_SWATCHES = [
  '#1a1a1a', '#4a3728', '#6b4423', '#8b6914', '#a0522d', '#c0392b', '#e8c56a', '#f5e0d0', '#7aa2ff', '#c9a0dc',
  '#ffffff', '#27ae60',
];
export const EYE_SWATCHES = [
  '#1a1a1a', '#4a3728', '#2e6b9e', '#27ae60', '#8b6914', '#7aa2ff', '#9b59b6', '#e07a5f', '#5ec4b0', '#ffffff',
  '#c0392b', '#f1c40f',
];
export const SHOE_SWATCHES = [
  '#1a1a1a', '#4a3728', '#3d5a80', '#2f3e46', '#6b4c33', '#8b0000', '#5ec4b0', '#e8c56a', '#ffffff', '#737a85',
  '#c0392b', '#9b59b6',
];
