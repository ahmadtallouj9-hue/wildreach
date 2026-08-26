/** VYTHERA mod hub types — local-first package + catalog. */

export type ModVisibility = 'private' | 'unlisted' | 'public';
export type ModLifecycle = 'draft' | 'published' | 'unpublished' | 'archived';
export type ModCategory =
  | 'gameplay'
  | 'world'
  | 'blocks'
  | 'items'
  | 'creatures'
  | 'characters'
  | 'ui'
  | 'tools'
  | 'audio'
  | 'visual'
  | 'ai'
  | 'other';

export const MOD_CATEGORIES: { id: ModCategory; label: string }[] = [
  { id: 'gameplay', label: 'Gameplay' },
  { id: 'world', label: 'World' },
  { id: 'blocks', label: 'Blocks' },
  { id: 'items', label: 'Items' },
  { id: 'creatures', label: 'Creatures' },
  { id: 'characters', label: 'Characters' },
  { id: 'ui', label: 'UI' },
  { id: 'tools', label: 'Tools' },
  { id: 'audio', label: 'Audio' },
  { id: 'visual', label: 'Visual' },
  { id: 'ai', label: 'AI' },
  { id: 'other', label: 'Other' },
];

export interface ModDependency {
  id: string;
  version: string;
}

export interface ModManifest {
  id: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  author: string;
  category: ModCategory;
  tags: string[];
  gameVersion: string;
  dependencies: ModDependency[];
  permissions: string[];
  visibility: ModVisibility;
  lifecycle: ModLifecycle;
  iconDataUrl?: string;
  screenshots: string[];
  features: string[];
  changelog: string;
  createdAt: number;
  updatedAt: number;
  shareId?: string;
}

export interface ModPackage {
  format: 'vythera-mod/1';
  manifest: ModManifest;
  /** Opaque ModAsset JSON from the existing editor schema. */
  assetJson: string;
  integrity: string;
}

export interface InstalledMod {
  package: ModPackage;
  enabled: boolean;
  installedAt: number;
  source: 'local-publish' | 'import' | 'hub';
}

export interface CatalogEntry {
  package: ModPackage;
  downloads: number;
  ratingSum: number;
  ratingCount: number;
  listedAt: number;
}

export interface ModReport {
  id: string;
  modId: string;
  version: string;
  category: 'broken' | 'inappropriate' | 'malicious' | 'spam' | 'copyright' | 'other';
  note: string;
  createdAt: number;
}

export interface ValidationIssue {
  level: 'error' | 'warn';
  code: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export const VYTHERA_GAME_VERSION = '0.1.0';
export const MOD_PACKAGE_FORMAT = 'vythera-mod/1' as const;
export const MAX_PACKAGE_CHARS = 4_000_000;
export const MAX_ICON_CHARS = 200_000;
export const MAX_SCREENSHOTS = 8;
export const MAX_SCREENSHOT_CHARS = 400_000;
