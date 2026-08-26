import type { ModRule, ModTrigger } from './ModLogicParser';

export interface ModCommandContext {
  modName: string;
  notify: (message: string) => void;
  /** Optional: play a named AnimationClip (wired by ModRuntime / editor). */
  playAnim?: (clipName: string) => boolean;
  /** Optional: spawn workshop particle FX. */
  spawnParticles?: (style: string, colorName?: string) => void;
}

export type ModCommandHandler = (ctx: ModCommandContext, args: string[]) => void;

export interface ModCommandDef {
  id: string;
  label: string;
  icon: string;
  description: string;
  quickPrompt: string;
  handler: ModCommandHandler;
}

function msg(ctx: ModCommandContext, text: string): void {
  ctx.notify(text);
}

/** Whitelisted commands — no arbitrary code execution. */
export const MOD_COMMAND_REGISTRY: Record<string, ModCommandDef> = {
  shoot_fireball: {
    id: 'shoot_fireball',
    label: 'Shoot fireball',
    icon: '🔥',
    description: 'Launch a fireball projectile forward (optional color).',
    quickPrompt: 'Shoot a blue fireball when clicked',
    handler: (ctx, args) => {
      const color = args[0];
      ctx.spawnParticles?.('fire', color);
      msg(ctx, `${ctx.modName} shoots a ${color ? color + ' ' : ''}fireball!`);
    },
  },
  glow: {
    id: 'glow',
    label: 'Glow',
    icon: '💡',
    description: 'Emit a soft glow around the mod.',
    quickPrompt: 'Glow when spawned',
    handler: (ctx) => msg(ctx, `${ctx.modName} glows.`),
  },
  sparkle: {
    id: 'sparkle',
    label: 'Sparkle',
    icon: '✨',
    description: 'Spawn sparkle particles.',
    quickPrompt: 'Sparkle when used',
    handler: (ctx, args) => {
      ctx.spawnParticles?.('sparkle', args[0]);
      msg(ctx, `${ctx.modName} sparkles.`);
    },
  },
  particles: {
    id: 'particles',
    label: 'Particles',
    icon: '🎆',
    description: 'Spawn a particle burst (fire, smoke, magic, snow…).',
    quickPrompt: 'Particles when clicked',
    handler: (ctx, args) => {
      const style = args[0] ?? 'sparkle';
      ctx.spawnParticles?.(style, args[1]);
      msg(ctx, `${ctx.modName} spawns ${style} particles.`);
    },
  },
  bounce: {
    id: 'bounce',
    label: 'Bounce',
    icon: '🦘',
    description: 'Play a small hop animation.',
    quickPrompt: 'Bounce when clicked',
    handler: (ctx) => msg(ctx, `${ctx.modName} bounces.`),
  },
  explode: {
    id: 'explode',
    label: 'Explode',
    icon: '💥',
    description: 'Burst into particles.',
    quickPrompt: 'Explode when clicked',
    handler: (ctx) => {
      ctx.spawnParticles?.('burst');
      msg(ctx, `${ctx.modName} explodes!`);
    },
  },
  teleport: {
    id: 'teleport',
    label: 'Teleport',
    icon: '🌀',
    description: 'Blink a short distance.',
    quickPrompt: 'Teleport when used',
    handler: (ctx) => msg(ctx, `${ctx.modName} teleports.`),
  },
  spin: {
    id: 'spin',
    label: 'Spin',
    icon: '🔄',
    description: 'Spin rapidly.',
    quickPrompt: 'Spin when clicked',
    handler: (ctx) => msg(ctx, `${ctx.modName} spins!`),
  },
  grow: {
    id: 'grow',
    label: 'Grow',
    icon: '📈',
    description: 'Scale up briefly.',
    quickPrompt: 'Grow when spawned',
    handler: (ctx) => msg(ctx, `${ctx.modName} grows bigger.`),
  },
  shrink: {
    id: 'shrink',
    label: 'Shrink',
    icon: '📉',
    description: 'Scale down briefly.',
    quickPrompt: 'Shrink when used',
    handler: (ctx) => msg(ctx, `${ctx.modName} shrinks.`),
  },
  trail: {
    id: 'trail',
    label: 'Trail',
    icon: '🌈',
    description: 'Leave a colorful particle trail.',
    quickPrompt: 'Leave a trail constantly',
    handler: (ctx, args) => {
      ctx.spawnParticles?.('trail', args[0]);
      msg(ctx, `${ctx.modName} leaves a trail.`);
    },
  },
  damage: {
    id: 'damage',
    label: 'Damage',
    icon: '⚔️',
    description: 'Deal damage nearby.',
    quickPrompt: 'Damage 3 when clicked',
    handler: (ctx, args) => msg(ctx, `${ctx.modName} deals ${args[0] ?? '1'} damage.`),
  },
  speed_boost: {
    id: 'speed_boost',
    label: 'Speed boost',
    icon: '⚡',
    description: 'Move faster for a moment.',
    quickPrompt: 'Speed boost when used',
    handler: (ctx) => msg(ctx, `${ctx.modName} gets a speed boost!`),
  },
  play_anim: {
    id: 'play_anim',
    label: 'Play animation',
    icon: '🎬',
    description: 'Play a named clip.',
    quickPrompt: 'Play animation when clicked',
    handler: (ctx, args) => {
      const name = args[0] ?? 'default';
      if (ctx.playAnim?.(name)) {
        msg(ctx, `${ctx.modName} plays “${name}”.`);
      } else {
        msg(ctx, `${ctx.modName} plays “${name}” (clip player not bound).`);
      }
    },
  },
  say: {
    id: 'say',
    label: 'Say message',
    icon: '💬',
    description: 'Show chat-style text.',
    quickPrompt: 'Say hello when clicked',
    handler: (ctx, args) => msg(ctx, args.length ? args.join(' ') : `${ctx.modName} says hello!`),
  },
  heal: {
    id: 'heal',
    label: 'Heal',
    icon: '💚',
    description: 'Restore health nearby.',
    quickPrompt: 'Heal 5 hp when used',
    handler: (ctx, args) => msg(ctx, `${ctx.modName} heals ${args[0] ?? '1'} HP nearby.`),
  },
  summon: {
    id: 'summon',
    label: 'Summon',
    icon: '👻',
    description: 'Spawn a helper companion.',
    quickPrompt: 'Summon a helper when spawned',
    handler: (ctx) => msg(ctx, `${ctx.modName} summons a helper.`),
  },
  shake: {
    id: 'shake',
    label: 'Shake',
    icon: '🫨',
    description: 'Shake violently.',
    quickPrompt: 'Shake when clicked',
    handler: (ctx) => msg(ctx, `${ctx.modName} shakes!`),
  },
};

export function listModCommands(): ModCommandDef[] {
  return Object.values(MOD_COMMAND_REGISTRY);
}

export function isKnownCommand(id: string): boolean {
  return id in MOD_COMMAND_REGISTRY;
}

export class ModCommandBinder {
  private rules: ModRule[] = [];

  loadRules(rules: ModRule[]): void {
    this.rules = rules.filter((r) => isKnownCommand(r.command));
  }

  get ruleCount(): number {
    return this.rules.length;
  }

  rulesForTrigger(trigger: ModTrigger): ModRule[] {
    return this.rules.filter((r) => r.trigger === trigger);
  }

  dispatch(trigger: ModTrigger, ctx: ModCommandContext): number {
    let ran = 0;
    for (const rule of this.rulesForTrigger(trigger)) {
      const def = MOD_COMMAND_REGISTRY[rule.command];
      if (!def) continue;
      def.handler(ctx, rule.args);
      ran++;
    }
    return ran;
  }

  dispatchAll(ctx: ModCommandContext): number {
    let ran = 0;
    for (const rule of this.rules) {
      const def = MOD_COMMAND_REGISTRY[rule.command];
      if (!def) continue;
      def.handler(ctx, rule.args);
      ran++;
    }
    return ran;
  }
}
