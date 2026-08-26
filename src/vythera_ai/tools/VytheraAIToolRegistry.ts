/** VYTHERA AI tool security — AI may only call registered tools. */

export type VytheraToolPermission = 'READ' | 'EDIT' | 'DESTRUCTIVE';

export interface VytheraToolDef<TArgs = Record<string, unknown>, TResult = unknown> {
  name: string;
  description: string;
  permission: VytheraToolPermission;
  inputSchema: string;
  outputSchema: string;
  execute: (args: TArgs, ctx: VytheraToolContext) => Promise<TResult> | TResult;
}

export interface VytheraToolContext {
  host: import('../host/VytheraEditorHost').VytheraEditorHost;
  confirmDestructive?: (tool: string, detail: string) => boolean;
}

export class VytheraAIToolRegistry {
  private tools = new Map<string, VytheraToolDef>();

  register(tool: VytheraToolDef): void {
    this.tools.set(tool.name, tool);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  get(name: string): VytheraToolDef | undefined {
    return this.tools.get(name);
  }

  list(): VytheraToolDef[] {
    return [...this.tools.values()];
  }

  catalogForPrompt(): string {
    return this.list()
      .map((t) => `- ${t.name} [${t.permission}]: ${t.description}\n  args: ${t.inputSchema}`)
      .join('\n');
  }

  async invoke(name: string, args: Record<string, unknown>, ctx: VytheraToolContext): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown VYTHERA tool: ${name}`);
    if (tool.permission === 'DESTRUCTIVE') {
      const ok = ctx.confirmDestructive?.(name, JSON.stringify(args).slice(0, 120)) ?? false;
      if (!ok) throw new Error(`Destructive tool ${name} requires confirmation`);
    }
    return tool.execute(args, ctx);
  }
}

export const vytheraTools = new VytheraAIToolRegistry();
