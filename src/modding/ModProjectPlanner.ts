import { detectCityTheme, type CityTheme } from './CityGenerator';
import { interpretStudioAi, type StudioAiAction } from './ModStudioAi';

/** Deterministic project actions (no cloud LLM). */
export type ProjectAction =
  | StudioAiAction
  | { kind: 'city'; theme: CityTheme; summary: string }
  | { kind: 'story'; title: string; beats: string[]; summary: string }
  | { kind: 'rename'; name: string; summary: string }
  | { kind: 'note'; text: string; summary: string };

export interface ProjectStep {
  id: string;
  title: string;
  detail: string;
  action: ProjectAction;
  done?: boolean;
}

export interface ProjectPlan {
  title: string;
  pitch: string;
  steps: ProjectStep[];
  source: 'local';
}

export interface ProjectAiReply {
  message: string;
  plan: ProjectPlan | null;
  quick: ProjectAction[];
}

let stepSeq = 0;
function sid(prefix: string): string {
  return `${prefix}-${++stepSeq}-${Date.now().toString(36)}`;
}

function cityPlan(prompt: string, theme: CityTheme): ProjectPlan {
  const title =
    theme === 'neon'
      ? 'Neon City'
      : theme === 'desert'
        ? 'Desert Citadel'
        : theme === 'harbor'
          ? 'Harbor Town'
          : theme === 'fantasy'
            ? 'Fantasy Capital'
            : 'Medieval City';
  return {
    title,
    pitch: `I'll co-build a high-detail ${theme} city: avenues, sidewalks, shops, manors, towers, plaza fountain, lamps & trees — then atmosphere, story, and powers.`,
    source: 'local',
    steps: [
      {
        id: sid('rename'),
        title: 'Name the project',
        detail: title,
        action: { kind: 'rename', name: title, summary: `Rename → ${title}` },
      },
      {
        id: sid('city'),
        title: 'Generate the city',
        detail: `Stamp a dense ${theme} city: roads, varied buildings, fountain plaza, street lamps, parks.`,
        action: { kind: 'city', theme, summary: `Build high-end ${theme} city` },
      },
      {
        id: sid('tex'),
        title: 'Accent color',
        detail: 'Tint accents for windows / neon.',
        action: {
          kind: 'texture_color',
          name: theme === 'neon' ? 'cyan' : theme === 'desert' ? 'gold' : 'teal',
          rgb:
            theme === 'neon'
              ? [0.28, 0.82, 0.88]
              : theme === 'desert'
                ? [0.9, 0.74, 0.28]
                : [0.22, 0.72, 0.68],
          summary: 'Paint accents',
        },
      },
      {
        id: sid('fx'),
        title: 'City atmosphere',
        detail: 'Particle mood for the plaza.',
        action: {
          kind: 'particles',
          style: theme === 'neon' ? 'magic' : theme === 'desert' ? 'smoke' : 'sparkle',
          color: theme === 'neon' ? [0.4, 0.9, 1] : [0.9, 0.75, 0.4],
          summary: 'Atmosphere particles',
        },
      },
      {
        id: sid('story'),
        title: 'City story',
        detail: 'Short lore the mod can say on spawn / click.',
        action: {
          kind: 'story',
          title: `${title} Chronicle`,
          beats: [
            `Welcome to ${title}.`,
            'The plaza fountain remembers every traveler.',
            'Climb a tower at dusk — the lights answer.',
            prompt.slice(0, 80) || 'Your adventure starts at the gate.',
          ],
          summary: 'Write city story',
        },
      },
      {
        id: sid('beh'),
        title: 'Interactive powers',
        detail: 'Click to sparkle.',
        action: {
          kind: 'behavior',
          rule: {
            trigger: 'on_click',
            command: 'sparkle',
            args: theme === 'neon' ? ['cyan'] : ['blue'],
            source: 'Sparkle when clicked',
          },
          summary: 'Click power',
        },
      },
    ],
  };
}

function storyPlan(prompt: string): ProjectPlan {
  const titleMatch = /(?:story|tale|quest|adventure)\s+(?:about|of|called)?\s*["']?([^"'.!?]+)/i.exec(prompt);
  const title = (titleMatch?.[1] ?? 'Wildreach Tale').trim().slice(0, 40);
  return {
    title,
    pitch: `I'll outline a playable story: characters, chapters as say-lines, and a click power.`,
    source: 'local',
    steps: [
      {
        id: sid('rename'),
        title: 'Title the tale',
        detail: title,
        action: { kind: 'rename', name: title, summary: `Rename → ${title}` },
      },
      {
        id: sid('hero'),
        title: 'Hero model',
        detail: 'Stamp a character silhouette as the hero.',
        action: { kind: 'starter', id: 'character', summary: 'Hero character' },
      },
      {
        id: sid('story'),
        title: 'Story beats',
        detail: 'Chapter lines for spawn / use.',
        action: {
          kind: 'story',
          title,
          beats: [
            `Chapter 1 — ${title} begins.`,
            'Chapter 2 — A shadow crosses the road.',
            'Chapter 3 — You find a glowing relic.',
            'Finale — Choose: fight, flee, or forgive.',
            prompt.slice(0, 100),
          ],
          summary: 'Story chapters',
        },
      },
      {
        id: sid('anim'),
        title: 'Idle motion',
        detail: 'Breathing / float idle on the hero.',
        action: { kind: 'anim_preset', preset: 'idle', summary: 'Idle animation' },
      },
      {
        id: sid('boss'),
        title: 'Climax power',
        detail: 'Click unleashes sparkle.',
        action: {
          kind: 'behavior',
          rule: {
            trigger: 'on_click',
            command: 'glow',
            args: [],
            source: 'Glow when clicked',
          },
          summary: 'Finale glow',
        },
      },
      {
        id: sid('fx'),
        title: 'Magic particles',
        detail: 'Story sparkle.',
        action: {
          kind: 'particles',
          style: 'magic',
          color: [0.7, 0.45, 1],
          summary: 'Magic particles',
        },
      },
    ],
  };
}

function megaPlan(prompt: string): ProjectPlan {
  const theme = detectCityTheme(prompt);
  const city = cityPlan(prompt, theme);
  const story = storyPlan(prompt);
  return {
    title: 'Epic Project',
    pitch: `Huge build: city + story + powers from “${prompt.slice(0, 60)}”. We'll go step by step — you can run all or pick steps.`,
    source: 'local',
    steps: [...city.steps, ...story.steps.filter((s) => s.action.kind !== 'rename')].map((s, i) => ({
      ...s,
      id: sid(`mega${i}`),
    })),
  };
}

/** Local-only project planner (deterministic, no network). */
export function localPlanFromPrompt(prompt: string): ProjectAiReply {
  const t = prompt.toLowerCase();
  const wantsCity = /\b(city|town|village|kingdom|capital|metropolis|settlement)\b/.test(t);
  const wantsStory = /\b(story|tale|quest|adventure|campaign|lore|narrative)\b/.test(t);
  const wantsHuge = /\b(huge|everything|entire|whole|epic|massive|complete project|world)\b/.test(t);

  if (wantsHuge || (wantsCity && wantsStory)) {
    const plan = megaPlan(prompt);
    return { message: plan.pitch, plan, quick: [] };
  }
  if (wantsCity) {
    const plan = cityPlan(prompt, detectCityTheme(prompt));
    return { message: plan.pitch, plan, quick: [] };
  }
  if (wantsStory) {
    const plan = storyPlan(prompt);
    return { message: plan.pitch, plan, quick: [] };
  }

  const quick = interpretStudioAi(prompt);
  if (quick.actions.length) {
    return {
      message: `Got it — ${quick.summary}. I can also plan a full city or story if you ask.`,
      plan: null,
      quick: quick.actions,
    };
  }

  const plan = megaPlan(prompt);
  return {
    message: `I can treat that as a big collaborative project. Here's a starter plan — tweak it or say what to change.`,
    plan,
    quick: [],
  };
}

/** @deprecated Use localPlanFromPrompt — kept for call sites; never contacts cloud. */
export async function collaborateOnPrompt(prompt: string): Promise<ProjectAiReply> {
  return localPlanFromPrompt(prompt);
}
