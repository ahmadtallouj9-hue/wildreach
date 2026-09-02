# VYTHERA — Unity 6.6 Migration Plan & Architecture Specification

## 1. Executive Summary & Migration Strategy

VYTHERA is transitioning from a TypeScript / Three.js / Vite web game to a high-performance **Unity 6.6 (C#)** voxel exploration game targeting **PC + Android** across a wide spectrum of device performance tiers (low-end mobile to high-end PC).

### Core Migration Principles
1. **Preserve Gameplay, Rules, and Data**: All deterministic generation math, Java-accurate player physics, crafting recipes, combat formulas, block properties, and survival systems are preserved.
2. **Rebuild Cleanly in Unity / C#**: No naive line-for-line porting of Web/DOM concepts. Utilize clean Unity 6 architecture, ScriptableObjects for data definitions, Native Collections / Jobs / Burst where computationally intensive (voxel meshing/noise), and Universal Render Pipeline (URP).
3. **Engine / Game Separation**: Core engine capabilities (`VYTHERA.Core`, `VYTHERA.Voxel`, `VYTHERA.WorldGeneration`, `VYTHERA.Rendering`) remain modular and decoupled from game-specific rules (`VYTHERA.Gameplay`, `VYTHERA.UI`).
4. **Strict Safety**: The old TypeScript repository remains untouched as an authoritative reference.

---

## 2. Comprehensive Subsystem Migration Matrix

| Old TypeScript Subsystem | Unity C# Subsystem | Classification | Implementation Architecture | Migration Status | Verification / Test Method |
|---|---|---|---|---|---|
| **Engine Loop & Timing** (`FixedTimestep.ts`, `Game.ts`) | `VYTHERA.Core.Time` | Reimplement (C#) | `FixedUpdate` (20 Hz fixed tick, `0.05s`) + `Update` render interpolation | 📋 Planned | 20 Hz timing regression tests, interpolation smoothing tests |
| **Event Bus & Logging** (`EventBus.ts`, `Logger.ts`, `Profiler.ts`) | `VYTHERA.Core.Events` / `Logging` / `Profiling` | Reimplement (C#) | Struct-based zero-alloc generic event broker, Unity Profiler markers, runtime telemetry counters | 📋 Planned | Event dispatch unit tests, GC allocation profiling (0 alloc per frame) |
| **Quality & Device Scaling** (`QualityConfig.ts`, `gfxPrefs.ts`, `device.ts`) | `VYTHERA.Core.Quality` | Reimplement (C#) + Data Assets | `QualityManager`, `QualityConfigSO` tier presets (Very Low, Low, Medium, High, Ultra), URP render scale, dynamic chunk budget | 📋 Planned | Dynamic tier switching unit tests, frame budget enforcement tests |
| **Block & Material Definitions** (`blocks.ts`, `materialPalette.ts`) | `VYTHERA.Voxel.Data` | Migrate as Data + C# Registry | `BlockType` enum, `BlockDefinition` ScriptableObjects / JSON registry, URP Texture 2D Array / Atlas | 📋 Planned | Block property lookup unit tests (`isSolid`, `isOpaque`, `lightEmission`, `isFluid`) |
| **Chunk Storage & Voxel Data** (`Chunk.ts`, `ColumnInfo.ts`) | `VYTHERA.Voxel.Storage` | Reimplement (C#) | Flat `byte[]` / `NativeArray<byte>` per chunk (16×144×16), nibble sky/block light arrays, fluid level arrays, dirty flags | 📋 Planned | Voxel indexing tests, chunk boundary coordinate hashing tests |
| **World Seed & PRNG** (`SeedSystem.ts`, `NoiseKit.ts`, `version.ts`) | `VYTHERA.WorldGeneration.Noise` | Reimplement (Exact C#) | `WorldSeed`, `Mulberry32`, `Hash32`, `NoiseKit` (Simplex 2D/3D, fbm, ridged) strictly matching TS math | 📋 Planned | Bit-exact hash and noise value regression tests against TS reference outputs |
| **Climate & Biomes** (`Climate.ts`, `BiomeTable.ts`, `BiomeBlend.ts`, `Biomes.ts`) | `VYTHERA.WorldGeneration.Biomes` | Reimplement (C#) + Data Tables | `ClimateSampler`, `BiomeRegistry`, `BiomeDef` data assets, `selectBiome` Euclidean climate matching | 📋 Planned | Biome distribution test across coordinate grid `(seed, wx, wz)` |
| **Terrain Shaping & Carving** (`TerrainShape.ts`, `terrainResolution.ts`) | `VYTHERA.WorldGeneration.Terrain` | Reimplement (C#) | Multi-scale height generation (macro/meso/detail octaves), cliff softening, overhang 3D density carving | 📋 Planned | Heightmap determinism tests across sample coordinates `(seed, wx, wz)` |
| **Caves & Ores** (`CaveGenerator.ts`, `OreGenerator.ts`) | `VYTHERA.WorldGeneration.Features` | Reimplement (C#) | `CaveGenerator` (worm tunnels + 3D room pockets), `OreGenerator` (deterministic 3D ore veins) | 📋 Planned | 3D cave carve bounds and ore distribution regression tests |
| **Vegetation & Structures** (`VegetationGenerator.ts`, `VegetationPlacement.ts`) | `VYTHERA.WorldGeneration.Decoration` | Reimplement (C#) | Deterministic global lattice plant stamping (oak, pine, birch, willow, jungle, cactus, boulders), ruins | 📋 Planned | Tree canopy chunk boundary seamlessness tests |
| **Chunk Pipeline & Streaming** (`ChunkPipeline.ts`, `ChunkManager.ts`) | `VYTHERA.World.Streaming` | Reimplement (C# / Jobs) | Multi-stage staged chunk pipeline (`Climate` → `Terrain` → `Biomes` → `Caves` → `Ores` → `Vegetation`), background streaming queue | 📋 Planned | Asynchronous streaming benchmarks, memory footprint tracking |
| **Lighting Engine** (`LightEngine.ts`) | `VYTHERA.Voxel.Lighting` | Reimplement (C#) | Column sky daylight propagation + local emitter BFS falloff | 📋 Planned | Sky light occlusion and torch/crystal/lava emission accuracy tests |
| **Fluid Simulation** (`FluidSim.ts`) | `VYTHERA.Voxel.Fluids` | Reimplement (C#) | Cellular automata fluid tick, BFS drop-off pathfinding, drying and vertical fall mechanics | 📋 Planned | Fluid spread velocity and volume conservation tests |
| **Voxel Meshing & Vertex AO** (`VoxelMesher.ts`) | `VYTHERA.Voxel.Meshing` | Reimplement (C# / Jobs / Burst) | Face culling, vertex AO calculation, sub-voxel terrain stepping, submesh separation (Solid, Cutout, Water, Lava) | 📋 Planned | Vertex/triangle count benchmarks, seam checks at chunk borders |
| **Player Physics & Collision** (`PlayerPhysics.ts`, `PlayerCollision.ts`, `PlayerConfig.ts`) | `VYTHERA.Player.Physics` | Reimplement (C#) | Java-accurate 20Hz swept AABB, step-up (0.6m), sneak edge drop prevention, auto-jump, fluid buoyancy | 📋 Planned | Velocity decay, jump apex, step-up clearance, and fall damage regression tests |
| **Player Camera & Rig** (`PlayerCamera.ts`) | `VYTHERA.Player.Camera` | Reimplement (C#) | 1st person / 3rd person / front camera rig, spring landing dip, view bobbing, FOV speed transitions | 📋 Planned | Pitch clamping and third-person obstacle raycast tests |
| **Input & Mobile Controls** (`PlayerInput.ts`, touch listeners) | `VYTHERA.Player.Input` | Reimplement (C#) | Unity Input System (Keyboard/Mouse, Gamepad, Touch controls with virtual dual-stick overlay) | 📋 Planned | Input event dispatch and multi-touch response tests |
| **Inventory & Items** (`InventorySystem.ts`, `ItemStack.ts`, `ItemDefinition.ts`) | `VYTHERA.Gameplay.Inventory` | Reimplement (C#) + Data Assets | `Inventory`, `ItemStack`, `ItemRegistry`, hotbar selection, slot transfer, splitting, stack limits | 📋 Planned | Inventory slot operations unit tests |
| **Crafting System** (`CraftingSystem.ts`, `RecipeRegistry.ts`) | `VYTHERA.Gameplay.Crafting` | Reimplement (C#) + Data Assets | 2×2 player inventory grid & 3×3 crafting table grid recipes (shaped and shapeless matching) | 📋 Planned | Recipe matrix matching and item deduction unit tests |
| **Equipment & Armor Calc** (`EquipmentSystem.ts`, `ArmorDamageCalculator.ts`) | `VYTHERA.Gameplay.Equipment` | Reimplement (C#) | `EquipmentSystem`, `ArmorDamageCalculator` exact Java reduction formula `clamp(armor - damage / (2 + toughness/4), ...)` | 📋 Planned | Armor damage reduction formula tests against reference table |
| **Combat & Damage** (`CombatSystem.ts`, `PlayerDamage.ts`) | `VYTHERA.Gameplay.Combat` | Reimplement (C#) | Attack reach, cooldowns, critical hits while falling, knockback vectors, damage immunity ticks | 📋 Planned | Combat cooldown and critical strike multiplier tests |
| **Survival & Hunger** (`PlayerHunger.ts`, `PlayerSurvival.ts`) | `VYTHERA.Gameplay.Survival` | Reimplement (C#) | Hunger exhaustion (sprinting, jumping, swimming), natural regeneration, starvation tick damage | 📋 Planned | Hunger exhaustion and regen timing unit tests |
| **Block Interaction & Raycast** (`BlockInteractionSystem.ts`, `voxelRaycast.ts`) | `VYTHERA.Gameplay.Interaction` | Reimplement (C#) | Fast DDA voxel raycasting, block break progress by tool tier/hardness, block placement validation | 📋 Planned | Raycast hit accuracy, block destruction time calculations |
| **Discovery & Landmarks** (`DiscoverySystem.ts`) | `VYTHERA.Gameplay.Discovery` | Reimplement (C#) | Landmark proximity detection, biome discovery notifications, field journal | 📋 Planned | Distance-based discovery trigger tests |
| **Versioned Save System** (`editStore.ts`, `survivalStore.ts`) | `VYTHERA.Save` | Reimplement (Versioned C#) | Binary / JSON versioned format with migration adapters (World seed, modified chunks RLE, player inventory/state) | 📋 Planned | Save format roundtrip and migration versioning tests |
| **Graphics & Shaders** (Custom Three.js shaders) | `VYTHERA.Rendering` | Reimplement in URP | URP Shader Graph / HLSL custom shaders (Terrain with Triplanar/Atlas AO, Water depth fog, Cutout leaves/grass, Lava) | 📋 Planned | Frame time profiling and visual parity checks |
| **UI Framework** (DOM/HTML/CSS) | `VYTHERA.UI` | Reimplement in Unity UI (uGUI / UI Toolkit) | HUD (hearts, hunger icons, hotbar, compass, crosshair), Inventory/Crafting modal, Settings menu, Mobile touch HUD | 📋 Planned | Canvas scaling tests across 16:9, 18:9, 21:9 mobile & desktop screens |
| **AI Subsystem** (`vythera_ai/`) | `VYTHERA.AI` | Reimplement (C# Interfaces) | `IAIService` abstract provider, local inference adapter, prompt/vision bridge | 📋 Planned | AI provider interface contract unit tests |
| **Multiplayer / Networking** (`net/`, `server/`) | `VYTHERA.Networking` | Reimplement (Unity Netcode / Transport) | Authoritative packet serialization for block modifications, player state synchronization | 📋 Planned | Serialization and state replication tests |
| **Modding Architecture** (`modding/`) | `VYTHERA.Modding` | Reimplement (Data-driven C#) | Sandboxed JSON asset loader for custom blocks, items, crafting recipes, textures | 📋 Planned | Mod bundle loading and validation unit tests |
| **Web/Vite Build Pipeline** (`node_modules`, `dist`, `vite.config.ts`) | Discard | Discard | Excluded from Unity project | 🗑️ Discarded | N/A |

---

## 3. Unity 6 Project Directory Layout

```
Assets/
    VYTHERA/
        Core/
            Time/
            Events/
            Logging/
            Profiling/
            Quality/
            Math/
        Voxel/
            Data/
            Storage/
            Lighting/
            Fluids/
            Meshing/
        WorldGeneration/
            Noise/
            Biomes/
            Terrain/
            Features/
            Decoration/
            Pipeline/
        World/
            Streaming/
            ChunkManager/
        Player/
            Physics/
            Collision/
            Camera/
            Input/
        Entities/
            Base/
            Mobs/
        Gameplay/
            Inventory/
            Crafting/
            Equipment/
            Combat/
            Survival/
            Interaction/
            Discovery/
        Rendering/
            Shaders/
            Materials/
            Textures/
            PostProcessing/
            Pipelines/
        UI/
            HUD/
            Inventory/
            Crafting/
            Settings/
            Touch/
        AI/
            Core/
            Providers/
        Audio/
        Networking/
            Protocol/
            StateSync/
        Save/
            Serialization/
            Migration/
        Data/
            Blocks/
            Items/
            Recipes/
            Biomes/
        Prefabs/
        Scenes/
        Editor/
        Tests/
            EditMode/
            PlayMode/
```

---

## 4. Phase-by-Phase Execution Roadmap

1. **Phase 1: Project Initialization & Tooling**
   - Setup clean Unity 6.6 project files (`ProjectSettings/`, `Packages/manifest.json`, `Assets/VYTHERA/`).
   - Configure URP, Input System, Burst, Mathematics, Collections, Test Framework.
   - Setup compilation validation and test runners.

2. **Phase 2: Core Mathematics, Seeds, & Noise Engine**
   - Implement `WorldSeed`, `Mulberry32`, `Hash32`, `NoiseKit` in C# (`Mathematics` / `Burst` compatible).
   - Write EditMode regression tests validating exact match with TS deterministic output.

3. **Phase 3: Voxel Data, Block Registry, & Chunk Storage**
   - Implement `BlockType`, `BlockProperties`, `BlockRegistry`.
   - Implement `ChunkData` (16×144×16 flat arrays with sky/block light & fluid level data).
   - Implement unit tests for chunk voxel reading, writing, and boundary wrapping.

4. **Phase 4: Procedural World Generation Pipeline**
   - Implement `ClimateSampler`, `BiomeTable`, `TerrainShape`, `CaveGenerator`, `OreGenerator`, `VegetationGenerator`.
   - Implement staged `ChunkPipeline` matching the deterministic pipeline.
   - Verify deterministic generation across coordinates and seeds.

5. **Phase 5: Voxel Meshing & Lighting Simulation**
   - Implement `LightEngine` (sky daylight + emitter falloff).
   - Implement `FluidSimulator` (cellular automata + drop-off search).
   - Implement `VoxelMesher` with face culling, vertex AO, sub-voxel terrain stepping, and multi-submesh buffers.

6. **Phase 6: Chunk Streaming & World Manager**
   - Implement `ChunkManager` spatial grid streaming, player distance rings, and background async job processing.

7. **Phase 7: Player Physics & Character Controller**
   - Implement `PlayerConfig`, `PlayerCollision`, `PlayerPhysics` (Java-accurate 20Hz tick, step-up, sneak restraint, auto-jump).
   - Implement `PlayerCamera` and `PlayerInput` (PC + Mobile touch).

8. **Phase 8: Gameplay Systems (Inventory, Crafting, Equipment, Combat, Survival)**
   - Implement `InventorySystem`, `CraftingSystem`, `EquipmentSystem`, `CombatSystem`, `SurvivalSystem`, `BlockInteractionSystem`.

9. **Phase 9: Versioned Save System**
   - Implement `SaveManager` with binary/JSON versioned serialization and schema migration support.

10. **Phase 10: URP Rendering, Materials, & Graphics Tiers**
    - Configure URP shaders, texture arrays/atlas, post-processing, and dynamic quality tiers (Very Low to Ultra).

11. **Phase 11: UI, Audio, AI Interfaces, & Networking**
    - Implement HUD, touch controls, crafting/inventory UI, sound effects, AI integration interface, and multiplayer sync foundations.

12. **Phase 12: Optimization & Platform Validation**
    - Profile memory, draw calls, frame times on PC and Android profiles.
