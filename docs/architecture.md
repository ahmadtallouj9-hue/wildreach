# VYTHERA ENGINE — Architecture

Companion to `VYTHERA_ENGINE_ROADMAP.md`. Documents the system map as it
exists and the direction each system is heading. Update this file when a
phase changes structure.

## Runtime topology

```
index.html → src/main.ts
  ├── SocialClient (net/)            friends / presence / join invites
  ├── MainMenu (ui/)                 title, world list, settings, studios
  └── Game (game/Game.ts)            composition root, created per world
        ├── WorldGen (world/gen/)    deterministic staged generation
        ├── ChunkManager (world/)    streaming, storage, lighting, fluids
        │     ├── Chunk              4 × Uint8Array(16·16·144):
        │     │                      voxels, skyLight, blockLight, fluidLevel
        │     ├── LightEngine        BFS sky/block light propagation
        │     └── FluidSim           placed water/lava spread
        ├── PlayerController (player/)
        │     ├── PlayerInput        pointer lock + touch
        │     ├── PlayerPhysics      fixed 20 Hz tick, Java-accurate
        │     ├── PlayerCollision    swept AABB + step-up + streaming gate
        │     └── PlayerCamera       1st/3rd person + interpolation
        ├── interaction/             raycast break/place (uses ModSystem)
        ├── inventory/ crafting/ combat/ equipment/   gameplay systems
        ├── render/
        │     ├── TerrainMaterials   shader materials from TextureAtlas
        │     ├── Sky                day/night sun, biome fog
        │     └── PostFX             EffectComposer: underwater/bloom/sun/grade
        ├── mobs/ + entity/          dormant (perf-gated)
        ├── discovery/               biomes/landmarks/journal/map
        ├── net/ NetClient           room state sync (server/)
        └── ui/ HUD, panels          DOM overlay
```

## Engine loop (Game.frame)

1. `Clock` delta, clamped 50 ms; optional 30 FPS cap (very-low preset).
2. Adaptive quality: `max` preset auto-drops to `high` after 3 s < 25 FPS.
3. Chunk streaming (`updateAround` player position, budgeted/frame).
4. **Fixed timestep** 0.05 s accumulator (max 0.25 s): player simulateTick,
   interaction tick, survival tick.
5. Interpolated render of player (`alpha = accumulator / FIXED_DT`).
6. Sky/materials/PostFX/HUD/net updates → `postfx.render()`.

Collision correctness during streaming: `ChunkManager.getCollisionBlock` /
`getCollisionAvailabilityForRegion` never collapse missing chunks into air;
`PlayerPhysics` freezes (position + velocity) instead of falling into
ungenerated void. Streaming itself is driven by `updateAround`, which
generates the full disc around the player — including corner chunks.

## Determinism contract

`(seed, WORLD_GENERATION_VERSION, generation config, cx, cz)` → identical
chunk voxel data. Enforced by `SeedSystem` (FNV-1a + mulberry32 + salted
coordinate hashes) and verified by `world/gen/determinism.test.ts`.

## Quality tiers

`render/gfxPrefs.ts`: `very-low | low | medium | high | max` with real
budgets — pixel-ratio cap, max render dimension, render distance, shadow
mode, post-processing, bloom, grade, water shader, particles, atlas size,
FPS cap, per-frame chunk mesh budget. Device detection (`deviceMemory`,
`hardwareConcurrency`, touch) picks the default preset. Phase 1 moves this
concept into `engine/core` as the engine's QualityConfig.

## Data boundaries

- **Engine → game imports: forbidden.** Game composes engine.
- Persistence: `editStore` (block edits), `survivalStore`, `localStorage`
  mod/hub stores. Save versioning arrives in Phase 11.
- Network authority: `server/` validates reach, rate, and bedrock for block
  edits; rooms are keyed by world-generation fingerprint so players only
  share worlds they generate identically.

## Modding trust model

Data-driven only: no `eval`, no `new Function`, no `fetch`/WS in mod logic.
Custom blocks 32–99, items 200–400. `modhub` adds packaging, validation,
catalog/ratings — all localStorage.

## AI systems

`vythera_ai/` = local-only workstation (Ollama/GGUF/ONNX backends, training,
vision, privacy sanitizers). `online/` = optional remote inference behind a
privacy gate that classifies outbound payloads. Neither is required by the
engine core; Phase 13 defines the engine-facing AI service seam.
