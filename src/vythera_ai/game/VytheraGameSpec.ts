/** VYTHERA permanent game identity — structured context, not a chatbot prompt dump. */

import { LOCAL_GRID_SIZE } from '../../modding/constants';
import { listModCommands } from '../../modding/ModCommandBinder';

export interface VytheraGameSpec {
  gameName: 'VYTHERA';
  projectType: 'voxel_game_editor';
  engine: 'typescript_threejs';
  editor: 'vythera_mod_studio';
  voxel: {
    gridSize: number;
    coordinateSystem: 'x_right_y_up_z_forward';
    indexLayout: 'x + z*S + y*S*S';
    sparsePreferred: true;
  };
  styleRules: string[];
  behaviorTriggers: string[];
  behaviorActions: string[];
  defaultBones: string[];
  animation: {
    rotationSpace: 'euler_xyz_degrees';
    engineInternal: 'quaternion';
  };
  world: {
    generationModules: string[];
  };
  terminology: Record<string, string>;
}

export function buildVytheraGameSpec(): VytheraGameSpec {
  const commands = listModCommands().map((c) => c.id);
  return {
    gameName: 'VYTHERA',
    projectType: 'voxel_game_editor',
    engine: 'typescript_threejs',
    editor: 'vythera_mod_studio',
    voxel: {
      gridSize: LOCAL_GRID_SIZE,
      coordinateSystem: 'x_right_y_up_z_forward',
      indexLayout: 'x + z*S + y*S*S',
      sparsePreferred: true,
    },
    styleRules: [
      'VYTHERA creatures prefer chunky silhouettes and readable shapes at distance.',
      'Sparse voxel output only — never emit a full nested 32³ JSON array.',
      'Coordinates are integers 0..31 inclusive.',
      'Colors are RGBA 0..255.',
      'Never emit executable JavaScript/TypeScript/shell.',
      'Control the editor only through registered VYTHERA tools.',
    ],
    behaviorTriggers: ['Click', 'Spawn', 'Use', 'Touch'],
    behaviorActions: ['Glow', 'Sparkle', 'Bounce', 'PlayAnimation', 'SetColor', 'Move', 'EmitParticles'],
    defaultBones: ['Body', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR'],
    animation: {
      rotationSpace: 'euler_xyz_degrees',
      engineInternal: 'quaternion',
    },
    world: {
      generationModules: [
        'BiomeTable',
        'CaveGenerator',
        'Climate',
        'OreGenerator',
        'StructureGenerator',
        'TerrainShape',
        'VegetationGenerator',
        'WorldGen',
      ],
    },
    terminology: {
      mod: 'A VYTHERA voxel asset with shape, parts, animation, and behaviors.',
      part: 'A named bone/group with pivot for animation.',
      behavior: 'Allowlisted trigger→action rule; never free code.',
      palette: 'Named set of RGBA materials for recoloring.',
      grid: `${LOCAL_GRID_SIZE}³ local voxel workspace.`,
      knownCommands: commands.join(', '),
    },
  };
}

export function gameSpecSystemPreamble(spec: VytheraGameSpec = buildVytheraGameSpec()): string {
  return [
    `You are VYTHERA AI — the intelligence layer of the ${spec.gameName} voxel game and editor.`,
    `Engine: ${spec.engine}. Editor: ${spec.editor}.`,
    `Voxel grid: ${spec.voxel.gridSize}³. ${spec.voxel.coordinateSystem}.`,
    ...spec.styleRules.map((r) => `- ${r}`),
    `Allowed behavior triggers: ${spec.behaviorTriggers.join(', ')}.`,
    `Allowed behavior actions: ${spec.behaviorActions.join(', ')}.`,
    `Bones: ${spec.defaultBones.join(', ')}. Euler XYZ degrees for AI output.`,
    'Output structured JSON for tool arguments only when asked. No markdown essays.',
  ].join('\n');
}
