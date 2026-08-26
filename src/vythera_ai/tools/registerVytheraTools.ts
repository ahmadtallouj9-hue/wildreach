import { Block } from '../../world/blocks';
import { LOCAL_GRID_SIZE } from '../../modding/constants';
import { isKnownCommand } from '../../modding/ModCommandBinder';
import { identityQuat, type ModKeyframe, type ModPart, type Quat, type Vec3 } from '../../modding/ModAsset';
import type { CustomMaterialPalette } from '../../modding/CustomMaterials';
import type { VytheraEditorHost } from '../host/VytheraEditorHost';
import { vytheraContext } from '../context/VytheraContextEngine';
import { vytheraKnowledge } from '../knowledge/VytheraKnowledgeBase';
import { vytheraMemory } from '../memory/VytheraMemory';
import { vytheraTools, type VytheraToolContext } from './VytheraAIToolRegistry';

const S = LOCAL_GRID_SIZE;

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

function coord(n: unknown): number {
  const v = Number(n);
  if (!fin(v)) throw new Error('non-finite coordinate');
  const i = Math.floor(v);
  if (i < 0 || i >= S) throw new Error(`coord ${i} outside 0..${S - 1}`);
  return i;
}

function hex(c: [number, number, number, number]): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
}

function ensureMat(palette: CustomMaterialPalette, c: [number, number, number, number], cache: Map<string, number>): number {
  const key = hex(c);
  const hit = cache.get(key);
  if (hit != null) return hit;
  const rgb: [number, number, number] = [c[0] / 255, c[1] / 255, c[2] / 255];
  const name = `VY ${key}`;
  const existing = palette.list().find((m) => m.name.toLowerCase() === name.toLowerCase());
  const id = existing?.id ?? palette.addMaterial(name, rgb, undefined, true, 'AI')?.id ?? palette.defaultBrush();
  cache.set(key, id);
  return id;
}

function eulerToQuat(x: number, y: number, z: number): Quat {
  const r = (d: number) => (d * Math.PI) / 180;
  const cx = Math.cos(r(x) / 2),
    sx = Math.sin(r(x) / 2);
  const cy = Math.cos(r(y) / 2),
    sy = Math.sin(r(y) / 2);
  const cz = Math.cos(r(z) / 2),
    sz = Math.sin(r(z) / 2);
  return {
    w: cx * cy * cz + sx * sy * sz,
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
  };
}

function boneToPart(name: string, parts: ModPart[]): string {
  const n = name.toLowerCase();
  const hit = parts.find((p) => p.name.toLowerCase() === n || p.id.toLowerCase() === n);
  if (hit) return hit.id;
  if (/head/.test(n)) return parts.find((p) => /head/i.test(p.name))?.id ?? parts[0]!.id;
  if (/arm.*l|arml|left/.test(n)) return parts.find((p) => /arm.*l|left/i.test(p.name))?.id ?? parts[0]!.id;
  if (/arm.*r|armr|right/.test(n)) return parts.find((p) => /arm.*r|right/i.test(p.name))?.id ?? parts[0]!.id;
  if (/leg.*l|legl/.test(n)) return parts.find((p) => /leg.*l|left/i.test(p.name))?.id ?? parts[0]!.id;
  if (/leg.*r|legr/.test(n)) return parts.find((p) => /leg.*r|right/i.test(p.name))?.id ?? parts[0]!.id;
  return parts[0]?.id ?? 'root';
}

const TRIG: Record<string, string> = {
  Click: 'on_click',
  Spawn: 'on_spawn',
  Use: 'on_use',
  Touch: 'on_collision',
};
const ACT: Record<string, string> = {
  Glow: 'glow',
  Sparkle: 'sparkle',
  Bounce: 'bounce',
  PlayAnimation: 'play_anim',
  SetColor: 'glow',
  Move: 'teleport',
  EmitParticles: 'particles',
};

export function validateVoxelPayload(data: unknown): { x: number; y: number; z: number; color: [number, number, number, number] }[] {
  const o = data as Record<string, unknown>;
  if (o.type !== 'voxel_model' && o.type !== 'voxel_patch') {
    /* allow bare voxels array via type voxel_model required for model */
  }
  const list = Array.isArray(o.voxels) ? o.voxels : [];
  const seen = new Set<string>();
  const out: { x: number; y: number; z: number; color: [number, number, number, number] }[] = [];
  for (const v of list) {
    if (!v || typeof v !== 'object') continue;
    const row = v as Record<string, unknown>;
    const x = coord(row.x),
      y = coord(row.y),
      z = coord(row.z);
    const key = `${x},${y},${z}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const c = rgba(row.color);
    if (!c) throw new Error('invalid voxel color');
    out.push({ x, y, z, color: c });
  }
  if (!out.length) throw new Error('no valid voxels');
  return out;
}

export function validatePatch(data: unknown): { op: 'set' | 'remove'; x: number; y: number; z: number; color?: [number, number, number, number] }[] {
  const o = data as Record<string, unknown>;
  const ops = Array.isArray(o.operations) ? o.operations : [];
  const out: { op: 'set' | 'remove'; x: number; y: number; z: number; color?: [number, number, number, number] }[] = [];
  for (const op of ops) {
    if (!op || typeof op !== 'object') continue;
    const row = op as Record<string, unknown>;
    if (row.op !== 'set' && row.op !== 'remove') throw new Error(`unknown op ${String(row.op)}`);
    const x = coord(row.x),
      y = coord(row.y),
      z = coord(row.z);
    if (row.op === 'remove') out.push({ op: 'remove', x, y, z });
    else {
      const c = rgba(row.color);
      if (!c) throw new Error('set requires color');
      out.push({ op: 'set', x, y, z, color: c });
    }
  }
  if (!out.length) throw new Error('empty patch');
  return out;
}

/** Register all VYTHERA AI tools against the live editor host. */
export function registerVytheraTools(): void {
  if (vytheraTools.list().length) return;

  const read = (name: string, description: string, fn: (args: Record<string, unknown>, ctx: VytheraToolContext) => unknown) => {
    vytheraTools.register({
      name,
      description,
      permission: 'READ',
      inputSchema: '{}',
      outputSchema: 'object',
      execute: fn,
    });
  };

  read('inspect_project', 'Inspect current VYTHERA project snapshot', (_a, ctx) => vytheraContext.snapshot(ctx.host));
  read('inspect_voxels', 'Summarize voxel occupancy and bounds', (_a, ctx) => vytheraContext.snapshot(ctx.host));
  read('inspect_skeleton', 'List animation parts/bones', (_a, ctx) => ({ parts: ctx.host.parts }));
  read('inspect_behavior', 'List behavior scripts', (_a, ctx) => ({ scripts: ctx.host.scripts }));
  read('inspect_animation', 'List parts available for animation', (_a, ctx) => ({
    bones: ctx.host.parts.map((p) => p.name),
  }));
  read('search_knowledge', 'Search local VYTHERA knowledge', (a) =>
    vytheraKnowledge.search(String(a.query ?? ''), Number(a.limit) || 5).map((d) => ({
      id: d.id,
      title: d.title,
      excerpt: d.body.slice(0, 240),
    })),
  );
  read('search_memory', 'Search local VYTHERA memory', (a) =>
    vytheraMemory.search(String(a.query ?? ''), Number(a.limit) || 5),
  );

  vytheraTools.register({
    name: 'remember',
    description: 'Store a VYTHERA memory fact',
    permission: 'EDIT',
    inputSchema: '{ text, category? }',
    outputSchema: '{ id }',
    execute: (a) => {
      const e = vytheraMemory.remember(String(a.text ?? ''), (a.category as never) || 'PROJECT');
      return { id: e.id, text: e.text };
    },
  });

  vytheraTools.register({
    name: 'forget',
    description: 'Remove a memory by id',
    permission: 'EDIT',
    inputSchema: '{ id }',
    outputSchema: '{ ok }',
    execute: (a) => ({ ok: vytheraMemory.forget(String(a.id ?? '')) }),
  });

  vytheraTools.register({
    name: 'create_voxel_asset',
    description: 'Clear grid and place sparse validated voxels (one undo)',
    permission: 'EDIT',
    inputSchema: '{ type:"voxel_model", voxels:[{x,y,z,color}] }',
    outputSchema: '{ placed }',
    execute: async (a, ctx) => {
      const voxels = validateVoxelPayload(a);
      ctx.host.historyPush();
      ctx.host.grid.clear();
      const cache = new Map<string, number>();
      for (const v of voxels) {
        ctx.host.grid.set(v.x, v.y, v.z, ensureMat(ctx.host.palette, v.color, cache));
      }
      ctx.host.rebuildMesh();
      ctx.host.refreshPalette();
      return { placed: voxels.length };
    },
  });

  vytheraTools.register({
    name: 'apply_voxel_patch',
    description: 'Apply set/remove voxel operations (one undo)',
    permission: 'EDIT',
    inputSchema: '{ type:"voxel_patch", operations:[{op,x,y,z,color?}] }',
    outputSchema: '{ applied }',
    execute: async (a, ctx) => {
      // Also accept full model as soft patch without clear
      if ((a as { type?: string }).type === 'voxel_model') {
        const voxels = validateVoxelPayload(a);
        ctx.host.historyPush();
        const cache = new Map<string, number>();
        for (const v of voxels) {
          ctx.host.grid.set(v.x, v.y, v.z, ensureMat(ctx.host.palette, v.color, cache));
        }
        ctx.host.rebuildMesh();
        ctx.host.refreshPalette();
        return { applied: voxels.length, mode: 'model_overlay' };
      }
      const ops = validatePatch(a);
      ctx.host.historyPush();
      const cache = new Map<string, number>();
      for (const op of ops) {
        if (op.op === 'remove') ctx.host.grid.set(op.x, op.y, op.z, Block.Air);
        else if (op.color) ctx.host.grid.set(op.x, op.y, op.z, ensureMat(ctx.host.palette, op.color, cache));
      }
      ctx.host.rebuildMesh();
      ctx.host.refreshPalette();
      return { applied: ops.length, mode: 'patch' };
    },
  });

  vytheraTools.register({
    name: 'create_behavior',
    description: 'Append allowlisted behavior graph as engine script lines',
    permission: 'EDIT',
    inputSchema: '{ type:"behavior_graph", nodes:[{id,trigger,action,parameters}] }',
    outputSchema: '{ lines }',
    execute: (a, ctx) => {
      const o = a as { type?: string; nodes?: unknown[] };
      if (o.type !== 'behavior_graph') throw new Error('type must be behavior_graph');
      const allowedT = new Set(['Click', 'Spawn', 'Use', 'Touch']);
      const allowedA = new Set(Object.keys(ACT));
      const lines: string[] = [];
      const ids = new Set<string>();
      for (const n of o.nodes ?? []) {
        if (!n || typeof n !== 'object') continue;
        const row = n as Record<string, unknown>;
        const id = String(row.id ?? `n${lines.length}`);
        if (ids.has(id)) throw new Error(`duplicate id ${id}`);
        ids.add(id);
        const trigger = String(row.trigger ?? '');
        const action = String(row.action ?? '');
        if (!allowedT.has(trigger)) throw new Error(`invalid trigger ${trigger}`);
        if (!allowedA.has(action)) throw new Error(`invalid action ${action}`);
        const cmd = ACT[action]!;
        if (!isKnownCommand(cmd)) throw new Error(`command not registered ${cmd}`);
        const params = (row.parameters as Record<string, unknown>) || {};
        const args: string[] = [];
        if (Array.isArray(params.color)) {
          const [r, g, b] = params.color as number[];
          args.push(b >= r && b >= g ? 'blue' : g >= r ? 'green' : 'red');
        }
        if (typeof params.style === 'string') args.push(String(params.style));
        if (typeof params.clip === 'string') args.push(String(params.clip).slice(0, 40));
        lines.push(`${TRIG[trigger]}: ${cmd}${args.length ? ' ' + args.join(' ') : ''}`);
      }
      if (!lines.length) throw new Error('no behavior nodes');
      ctx.host.appendBehaviors(lines);
      return { lines };
    },
  });

  vytheraTools.register({
    name: 'create_animation',
    description: 'Apply Euler keyframes converted to VYTHERA quaternions',
    permission: 'EDIT',
    inputSchema: '{ type:"animation", name, duration, keyframes:[{bone,time,rotation,position}] }',
    outputSchema: '{ keys }',
    execute: (a, ctx) => {
      const o = a as Record<string, unknown>;
      if (o.type !== 'animation') throw new Error('type must be animation');
      const duration = Number(o.duration);
      if (!fin(duration) || duration <= 0) throw new Error('invalid duration');
      const name = typeof o.name === 'string' ? o.name : 'anim';
      const bones = new Set(ctx.host.parts.map((p) => p.name.toLowerCase()));
      if (!bones.size) bones.add('body');
      const keysIn = Array.isArray(o.keyframes) ? o.keyframes : [];
      const out: ModKeyframe[] = [];
      for (const k of keysIn) {
        if (!k || typeof k !== 'object') continue;
        const row = k as Record<string, unknown>;
        const bone = String(row.bone ?? '');
        if (!bones.has(bone.toLowerCase())) throw new Error(`invalid bone ${bone}`);
        const time = Number(row.time);
        if (!fin(time) || time < 0 || time > duration) throw new Error('invalid time');
        const rot = Array.isArray(row.rotation) ? row.rotation.map(Number) : null;
        const pos = Array.isArray(row.position) ? row.position.map(Number) : null;
        if (!rot || rot.length < 3 || !pos || pos.length < 3 || ![...rot, ...pos].every(fin)) {
          throw new Error('invalid keyframe arrays');
        }
        const position: Vec3 = { x: pos[0]!, y: pos[1]!, z: pos[2]! };
        out.push({
          frame: Math.round(time * 30),
          partId: boneToPart(bone, ctx.host.parts),
          position,
          rotation: eulerToQuat(rot[0]!, rot[1]!, rot[2]!),
        });
      }
      if (!out.length) {
        out.push({
          frame: 0,
          partId: ctx.host.parts[0]?.id ?? 'root',
          position: { x: 0, y: 0, z: 0 },
          rotation: identityQuat(),
        });
      }
      ctx.host.applyKeyframes(out, name);
      return { keys: out.length, name };
    },
  });

  vytheraTools.register({
    name: 'apply_palette',
    description: 'Add validated palette colors as materials',
    permission: 'EDIT',
    inputSchema: '{ type:"palette", name, colors:[[r,g,b,a]] }',
    outputSchema: '{ count }',
    execute: (a, ctx) => {
      const o = a as Record<string, unknown>;
      if (o.type !== 'palette') throw new Error('type must be palette');
      const name = typeof o.name === 'string' ? o.name : 'Palette';
      const colors = Array.isArray(o.colors) ? o.colors : [];
      if (colors.length > 16) throw new Error('max 16 colors');
      let n = 0;
      const seen = new Set<string>();
      for (const c of colors) {
        const rgbaC = rgba(c);
        if (!rgbaC) throw new Error('invalid palette color');
        const key = rgbaC.join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        ctx.host.palette.addMaterial(
          `${name} ${n + 1}`,
          [rgbaC[0] / 255, rgbaC[1] / 255, rgbaC[2] / 255],
          undefined,
          true,
          'AI',
        );
        n++;
      }
      if (!n) throw new Error('empty palette');
      ctx.host.refreshPalette();
      return { count: n, name };
    },
  });

  vytheraTools.register({
    name: 'undo',
    description: 'Undo last editor change',
    permission: 'EDIT',
    inputSchema: '{}',
    outputSchema: '{ ok }',
    execute: (_a, ctx) => ({ ok: ctx.host.undo?.() ?? false }),
  });

  vytheraTools.register({
    name: 'redo',
    description: 'Redo last undone change',
    permission: 'EDIT',
    inputSchema: '{}',
    outputSchema: '{ ok }',
    execute: (_a, ctx) => ({ ok: ctx.host.redo?.() ?? false }),
  });

  vytheraTools.register({
    name: 'clear_model',
    description: 'Clear the voxel grid',
    permission: 'DESTRUCTIVE',
    inputSchema: '{}',
    outputSchema: '{ ok }',
    execute: (_a, ctx) => {
      ctx.host.historyPush();
      ctx.host.grid.clear();
      ctx.host.rebuildMesh();
      return { ok: true };
    },
  });
}

export function summarizeHost(host: VytheraEditorHost): string {
  return JSON.stringify(vytheraContext.snapshot(host));
}
