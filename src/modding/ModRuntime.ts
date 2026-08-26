import type { ModAsset } from './ModAsset';
import { ModCommandBinder, type ModCommandContext } from './ModCommandBinder';
import { interpretModScripts } from './ModAiInterpreter';
import type { ModRule } from './ModLogicParser';

/** Runtime bundle: parsed rules + binder (workshop test or in-world spawn). */
export class ModRuntime {
  readonly asset: ModAsset;
  readonly binder = new ModCommandBinder();
  readonly parseErrors: string[];

  constructor(asset: ModAsset) {
    this.asset = asset;
    const rules = loadRulesFromAsset(asset);
    const { errors } = interpretModScripts(asset.scripts);
    this.parseErrors = asset.logic?.rules ? [] : errors;
    this.binder.loadRules(rules);
  }

  dispatch(trigger: Parameters<ModCommandBinder['dispatch']>[0], ctx: ModCommandContext): number {
    return this.binder.dispatch(trigger, ctx);
  }
}

function loadRulesFromAsset(asset: ModAsset): ModRule[] {
  if (asset.logic?.rules?.length) {
    return asset.logic.rules.map((r) => ({
      trigger: r.trigger as ModRule['trigger'],
      command: r.command,
      args: [...r.args],
      source: `${r.trigger}: ${r.command}`,
    }));
  }
  return interpretModScripts(asset.scripts).rules;
}

export function createModRuntime(asset: ModAsset): ModRuntime {
  return new ModRuntime(asset);
}
