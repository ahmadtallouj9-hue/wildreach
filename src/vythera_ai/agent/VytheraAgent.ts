import { gameSpecSystemPreamble } from '../game/VytheraGameSpec';
import type { VytheraInferenceBackend } from '../inference/VytheraInferenceBackend';
import { loadVytheraAISettings } from '../inference/VytheraAISettings';
import { vytheraContext } from '../context/VytheraContextEngine';
import type { VytheraEditorHost } from '../host/VytheraEditorHost';
import { vytheraTools } from '../tools/VytheraAIToolRegistry';
import { extractVytheraJson } from '../util/extractJson';
import { vytheraDataset } from '../dataset/VytheraDatasetManager';

export interface VytheraAgentProgress {
  phase: string;
  message: string;
  step?: number;
  maxSteps?: number;
}

export interface VytheraAgentResult {
  summary: string;
  toolCalls: { name: string; result: unknown }[];
  raw?: string;
  cancelled: boolean;
}

/**
 * Controlled VYTHERA agent — tool calls only, bounded steps, cancellable.
 * Never executes arbitrary code from the model.
 */
export class VytheraAgent {
  constructor(private backend: VytheraInferenceBackend) {}

  setBackend(b: VytheraInferenceBackend): void {
    this.backend = b;
  }

  async run(
    host: VytheraEditorHost,
    userPrompt: string,
    opts: {
      model: string;
      signal?: AbortSignal;
      onProgress?: (p: VytheraAgentProgress) => void;
      confirmDestructive?: (tool: string, detail: string) => boolean;
      recordCandidate?: boolean;
    },
  ): Promise<VytheraAgentResult> {
    const settings = loadVytheraAISettings();
    const maxSteps = settings.maxAgentSteps;
    const maxTools = settings.maxToolCalls;
    const toolCalls: { name: string; result: unknown }[] = [];
    let toolsUsed = 0;

    const context = vytheraContext.buildPromptContext(host, userPrompt);
    const system = [
      gameSpecSystemPreamble(),
      'You are VYTHERA AI. Control the game ONLY by returning a single JSON object:',
      '{"tool":"<registered_tool_name>","args":{...},"done":false,"message":"optional"}',
      'Or finish with: {"done":true,"message":"summary of what you did"}',
      'Never emit JavaScript, TypeScript, shell, or markdown code fences with code.',
      'Registered tools:',
      vytheraTools.catalogForPrompt(),
      'Current VYTHERA context:',
      context,
    ].join('\n');

    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: system },
      { role: 'user', content: userPrompt },
    ];

    opts.onProgress?.({ phase: 'planning', message: 'Planning…', step: 0, maxSteps });

    for (let step = 0; step < maxSteps; step++) {
      if (opts.signal?.aborted) return { summary: 'Cancelled', toolCalls, cancelled: true };

      opts.onProgress?.({
        phase: 'generating',
        message: `Reasoning step ${step + 1}/${maxSteps}…`,
        step: step + 1,
        maxSteps,
      });

      let raw = '';
      try {
        raw = await this.backend.generate({
          model: opts.model,
          messages,
          jsonMode: true,
          temperature: settings.temperature,
          stream: true,
          signal: opts.signal,
          requestId: `agent_${Date.now()}_${step}`,
          onToken: () => opts.onProgress?.({ phase: 'receiving', message: 'Receiving…', step: step + 1, maxSteps }),
        });
      } catch (e) {
        if (e instanceof Error && e.message === 'CANCELLED') {
          return { summary: 'Cancelled', toolCalls, cancelled: true };
        }
        throw e;
      }

      if (opts.signal?.aborted) return { summary: 'Cancelled', toolCalls, cancelled: true, raw };

      let parsed: Record<string, unknown>;
      try {
        parsed = extractVytheraJson(raw) as Record<string, unknown>;
      } catch (e) {
        messages.push({ role: 'assistant', content: raw.slice(0, 2000) });
        messages.push({
          role: 'user',
          content: `Previous output failed JSON parse: ${e instanceof Error ? e.message : e}. Return corrected JSON only.`,
        });
        continue;
      }

      if (parsed.done === true) {
        const summary = String(parsed.message ?? 'Done');
        if (opts.recordCandidate !== false && toolCalls.length) {
          vytheraDataset.addCandidate({
            instruction: userPrompt,
            context,
            toolCalls,
            output: summary,
            taskType: detectTask(userPrompt),
            validationOk: true,
            model: opts.model,
          });
        }
        opts.onProgress?.({ phase: 'complete', message: summary, step: step + 1, maxSteps });
        return { summary, toolCalls, raw, cancelled: false };
      }

      const toolName = String(parsed.tool ?? '');
      if (!toolName || !vytheraTools.has(toolName)) {
        messages.push({ role: 'assistant', content: JSON.stringify(parsed) });
        messages.push({
          role: 'user',
          content: `Unknown or missing tool "${toolName}". Choose a registered tool or set done:true.`,
        });
        continue;
      }

      if (toolsUsed >= maxTools) {
        return { summary: 'Tool call limit reached', toolCalls, cancelled: false, raw };
      }

      opts.onProgress?.({
        phase: 'tool',
        message: `Calling ${toolName}…`,
        step: step + 1,
        maxSteps,
      });

      try {
        if (opts.signal?.aborted) return { summary: 'Cancelled', toolCalls, cancelled: true, raw };
        const args = (typeof parsed.args === 'object' && parsed.args && !Array.isArray(parsed.args)
          ? parsed.args
          : {}) as Record<string, unknown>;
        const result = await vytheraTools.invoke(toolName, args, {
          host,
          confirmDestructive: opts.confirmDestructive,
        });
        toolsUsed++;
        toolCalls.push({ name: toolName, result });
        messages.push({ role: 'assistant', content: JSON.stringify(parsed) });
        messages.push({
          role: 'user',
          content: `Tool ${toolName} result: ${JSON.stringify(result).slice(0, 1500)}\nContinue or {"done":true,"message":"..."}.`,
        });
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        messages.push({ role: 'assistant', content: JSON.stringify(parsed) });
        messages.push({
          role: 'user',
          content: `Tool ${toolName} failed: ${err}. Fix args or choose another tool. JSON only.`,
        });
      }
    }

    return {
      summary: toolCalls.length ? `Completed ${toolCalls.length} tool call(s)` : 'Agent step limit reached',
      toolCalls,
      cancelled: false,
    };
  }
}

function detectTask(prompt: string): string {
  const t = prompt.toLowerCase();
  if (/\banim|walk|run|idle|jump\b/.test(t)) return 'ANIMATION';
  if (/\bbehavior|click|glow|bounce\b/.test(t)) return 'BEHAVIOR';
  if (/\bpalette|skin|color|moss\b/.test(t)) return 'SKIN';
  if (/\bworld|biome|terrain\b/.test(t)) return 'WORLD';
  if (/\bremember|forget\b/.test(t)) return 'MEMORY';
  return 'VOXEL';
}
