import type { WorldGen } from '../WorldGen';

export type GenDebugMode =
  | 'off'
  | 'biome'
  | 'temperature'
  | 'humidity'
  | 'continentalness'
  | 'erosion'
  | 'height'
  | 'seed';

/** Optional URL/query debug overlays for worldgen. Disabled in normal play. */
export function parseGenDebugMode(search = typeof location !== 'undefined' ? location.search : ''): GenDebugMode {
  const q = new URLSearchParams(search).get('genDebug');
  if (!q) return 'off';
  const allowed: GenDebugMode[] = [
    'biome',
    'temperature',
    'humidity',
    'continentalness',
    'erosion',
    'height',
    'seed',
  ];
  return (allowed.includes(q as GenDebugMode) ? q : 'off') as GenDebugMode;
}

export function formatGenDebug(world: WorldGen, wx: number, wz: number, mode: GenDebugMode): string {
  if (mode === 'off') return '';
  const col = world.sampleClimate(wx, wz);
  const c = col.climate;
  switch (mode) {
    case 'biome':
      return `biome=${col.biome} h=${col.height}`;
    case 'temperature':
      return `temp=${c.temperature.toFixed(3)}`;
    case 'humidity':
      return `humid=${c.humidity.toFixed(3)}`;
    case 'continentalness':
      return `cont=${c.continentalness.toFixed(3)}`;
    case 'erosion':
      return `erosion=${c.erosion.toFixed(3)} peaks=${c.peaksValleys.toFixed(3)}`;
    case 'height':
      return `height=${col.height} river=${c.river.toFixed(2)}`;
    case 'seed':
      return `seed=${world.seed} v=${world.generationVersion}`;
    default:
      return '';
  }
}
