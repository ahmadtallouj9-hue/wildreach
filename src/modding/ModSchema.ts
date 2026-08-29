/**
 * VYTHERA Mod Data Schema & Definitions (Strict Data-Driven Modding).
 * No eval(), no new Function(), no fetch(), no WebSocket.
 */

export interface ModFaceTextures {
  top?: string;    // data URL or texture name or hex color
  bottom?: string;
  north?: string;  // +Z
  south?: string;  // -Z
  east?: string;   // +X
  west?: string;   // -X
  all?: string;    // fallback for all faces
}

export type ModToolType = 'none' | 'pickaxe' | 'axe' | 'shovel' | 'sword' | 'hand';

export interface ModBlockDef {
  id: string; // e.g. "ruby_block"
  displayName: string;
  hardness?: number; // default 1.0 (break time multiplier)
  toolType?: ModToolType; // required tool type to harvest
  minToolTier?: 'wood' | 'stone' | 'iron' | 'diamond' | 'none';
  dropItemId?: string; // item/block id dropped when broken (defaults to self)
  dropCount?: number; // count dropped (default 1)
  opaque?: boolean; // default true
  transparent?: boolean; // default false
  lightLevel?: number; // 0..15
  collision?: boolean; // default true
  slipperiness?: number;
  textures?: ModFaceTextures;
  modelVoxel?: number[]; // optional 16^3 voxel model data
  color?: [number, number, number]; // fallback RGB (0..1)
  soundBreak?: string;
  soundPlace?: string;
}

export type ModItemCategory = 'tools' | 'combat' | 'food' | 'materials' | 'misc';

export interface ModItemDef {
  id: string; // e.g. "ruby_pickaxe"
  displayName: string;
  category?: ModItemCategory;
  maxStack?: number; // default 64, tools default 1
  isTool?: boolean;
  toolType?: ModToolType;
  toolTier?: 'wood' | 'stone' | 'iron' | 'custom';
  durability?: number; // max uses
  miningSpeed?: number; // multiplier against matched blocks
  attackDamage?: number; // damage dealt to mobs
  attackCooldown?: number; // in seconds
  isFood?: boolean;
  hungerRestore?: number; // points restored (1..20)
  saturation?: number;
  icon?: string; // data URL or 16x16 pixel array
  color?: [number, number, number]; // fallback swatch color
}

export interface ModRecipeDef {
  id: string;
  type: 'crafting_shaped' | 'crafting_shapeless' | 'smelting';
  grid: '2x2' | '3x3';
  pattern?: string[]; // e.g. ["RRR", " S ", " S "]
  key?: Record<string, string>; // e.g. {"R": "mod:ruby", "S": "stick"}
  ingredients?: string[]; // for shapeless
  result: {
    id: string; // "mod:ruby_pickaxe" or vanilla id
    count: number;
  };
}

export interface ModEntityDef {
  id: string;
  name: string;
  maxHp: number;
  speed: number;
  hostile: boolean;
  meleeDmg?: number;
  attackCooldown?: number;
  spawnWeight?: number;
  size?: [number, number, number];
  dropItemId?: string;
  dropCount?: number;
  color?: [number, number, number];
}

export interface ModLootTableDef {
  id: string;
  entries: Array<{
    itemId: string;
    weight: number;
    minCount: number;
    maxCount: number;
  }>;
}

export interface ModManifestJson {
  id: string; // lowercase slug e.g. "ruby_expansion"
  name: string;
  displayName: string;
  description: string;
  version: string;
  author: string;
  license?: string;
  changelog?: string;
  icon?: string;
  packFormat: 1;
  blocks?: ModBlockDef[];
  items?: ModItemDef[];
  recipes?: ModRecipeDef[];
  entities?: ModEntityDef[];
  loot?: ModLootTableDef[];
  lang?: Record<string, Record<string, string>>; // e.g. en: { "block.ruby": "Ruby Block" }
  createdAt: number;
  updatedAt: number;
}
