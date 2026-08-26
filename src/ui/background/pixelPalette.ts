/** VYTHERA pixel-art palette — original, limited colors. */
export const PAL = {
  skyTop: '#3a7ec8',
  skyMid: '#5ca8e8',
  skyHorizon: '#8ec8f0',
  skyWarm: '#f0b878',
  skyDusk: '#c87858',
  sunCore: '#ffe8a0',
  sunGlow: '#ffd060',
  cloudLight: '#f4f8fc',
  cloudMid: '#d8e8f4',
  cloudShadow: '#a8c0d8',
  mountainFar: '#4a6888',
  mountainMid: '#3a5870',
  hill: '#3d6a48',
  hillDark: '#2d5038',
  trunk: '#4a3828',
  trunkDark: '#362818',
  leaf: '#3a8848',
  leafLight: '#58a858',
  leafDark: '#286838',
  grass: '#4a9848',
  grassDark: '#387838',
  flower: '#e878a0',
  water: '#3888b0',
  waterLight: '#58a8d0',
  waterDark: '#286890',
  bird: '#2a3848',
  haze: 'rgba(180, 210, 240, 0.35)',
} as const;

export type TimePhase = 'morning' | 'day' | 'sunset' | 'night';

/** Extremely slow day cycle (~8 minutes full loop at normal speed). */
export function phaseFromTime(t: number): TimePhase {
  const cycle = (t * 0.002) % 1;
  if (cycle < 0.2) return 'morning';
  if (cycle < 0.55) return 'day';
  if (cycle < 0.75) return 'sunset';
  return 'night';
}

export function skyColors(phase: TimePhase): { top: string; mid: string; horizon: string; warm: number } {
  switch (phase) {
    case 'morning':
      return { top: '#4888c0', mid: '#70b0e0', horizon: '#b8d8f0', warm: 0.35 };
    case 'sunset':
      return { top: '#486898', mid: '#c88868', horizon: '#f0c090', warm: 0.85 };
    case 'night':
      return { top: '#182040', mid: '#283858', horizon: '#384868', warm: 0 };
    default:
      return { top: PAL.skyTop, mid: PAL.skyMid, horizon: PAL.skyHorizon, warm: 0.15 };
  }
}
