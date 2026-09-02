# VYTHERA ENGINE — Roadmap

**Status:** Phase 0 complete (audit). Phase 1 in progress.
**Audit date:** 2026-08-30 · **Baseline:** full test suite green, `tsc && vite build` green.

---

## 0. Platform decision (first architectural ruling)

VYTHERA ENGINE is built as a **modular TypeScript engine** on the existing
Wildreach codebase (Vite + Three.js + simplex-noise), **not** a C++ rewrite.

Rationale:

- 308 TS files / ~61.6k LOC of *working, tested* systems already exist:
  deterministic world gen, Java-accurate player physics, chunk streaming,
  custom shaders, survival, modding, multiplayer, local AI.
- One Web codebase already ships to desktop **and** Android browsers — the
  mobile-first scalability goal — with zero porting layer.
- A C++ rewrite would discard all of it and delay the game by months for no
  measurable gameplay benefit at this scale.

If native-class performance is ever required on a specific target, the
engine-core separation (below) is what makes a future native renderer port
feasible. Revisit only with profiling evidence.

---

## 1. Current-state map (from audit)

| Layer | Location | State |
|---|---|---|
| Composition root / main loop | `src/game/Game.ts` (915 lines) | Works; god-object, needs engine extraction |
| Engine loop | fixed 20 Hz accumulator + render interpolation inside `Game.frame()` | Correct; not reusable yet |
| Rendering | `src/render/` (TerrainMaterials, Sky, PostFX, TextureAtlas, gfxPrefs) | Custom shaders + quality presets exist |
| Voxel | `src/world/` (Chunk, ChunkManager, VoxelMesher, LightEngine, FluidSim) | Streaming + BFS lighting work; meshing is naive per-block (deliberate: atlas UVs); no LOD, no worker threads |
| World gen | `src/world/gen/` (ChunkPipeline: climate→terrain→biome→fill→caves→ores→vegetation) | Deterministic w/ version + tests; structures disabled |
| Physics/player | `src/player/` (Java-accurate, collision shapes, fixed tick) | Strong; recently extracted interaction/inventory/crafting/combat/equipment |
| Entity/AI(mobs) | `src/entity/`, `src/mobs/` | Dormant (`spawnMobs` no-op — perf) |
| Quality tiers | `src/render/gfxPrefs.ts` (very-low…max + device detection) | Real budget enforcement; engine-level adoption pending |
| UI | `src/ui/` (DOM, no framework) | Complete screens; `src/vyui/` is an empty leftover |
| Game AI | `src/vythera_ai/` (local inference, training, vision, privacy) | Extensive, self-contained |
| Modding | `src/modding/` (runtime + Mod Studio), `src/modhub/` (distribution) | Intentional layering, works |
| Networking | `src/net/` + `server/` (WS rooms, social) | Works; server validates block edits |
| Online AI | `src/online/` behind privacy gate | Works, optional |
| Saves | `editStore` + `survivalStore` (localStorage) | Functional; **no format versioning** |
| Profiling | ad-hoc (`hud.tickFps`, genDebug) | **No unified profiler** |
| Tests | 24 `tsx` suites chained via npm scripts | Green after streaming-mock fix |

**Empty-residue dirs removed in Phase 1:** `src/ai/`, `src/vyui/`.

**Known debt:** 955 kB main JS chunk (needs code-splitting); scratch
`scripts/_*.mjs` one-shot files; `.aider.*` artifacts in repo root;
mobs/pathfinding suspended; structures generation disabled.

---

## 2. Target architecture

```
src/
  engine/                 ← reusable, game-agnostic VYTHERA ENGINE
    core/                 Application, FixedTimestep, Logger, EventBus,
                          Profiler, QualityConfig
    platform/             device detection, input abstraction (future)
    render/               renderer abstraction (migrate from src/render)
    voxel/                chunk storage/meshing (migrate from src/world)
    worldgen/             staged pipeline (migrate from src/world/gen)
    physics/              collision/character controller (migrate player core)
    ecs/                  entity/components (formalize src/entity)
    assets/               asset registry/pipeline
    save/                 versioned serialization
  game/                   Wildreach game: Game.ts glue, gameplay rules
  ui/  net/  online/  vythera_ai/  modding/  modhub/   (game-level apps)
```

Migration is **gradual**, phase-by-phase — no big-bang moves. Engine code
must not import game code.

---

## 3. Phase plan (adapted to audit findings)

| Phase | Goal | Key work | Status |
|---|---|---|---|
| 0 | Audit | This document, architecture doc, green baseline | ✅ done |
| 1 | Engine foundation | `engine/core`: Logger, EventBus, FixedTimestep, Profiler, QualityConfig; adopt in `Game`; remove empty dirs | **in progress** |
| 2 | Platform layer | Formalize device capability detection behind engine API; input abstraction | pending |
| 3 | Renderer foundation | Draw-call/triangle stats into Profiler; code-split bundle; renderer interface extraction | pending |
| 4 | Voxel data | Chunk storage audit → `engine/voxel`; dirty-tracking review; memory budget | pending |
| 5 | Meshing | Keep naive mesher (UV-correct); evaluate greedy variant behind flag; border tests | pending |
| 6 | World gen | Keep pipeline; re-enable structures behind budget; stage isolation tests | pending |
| 7 | Streaming | **Web Worker generation + meshing** (biggest perf win); async chunk pipeline | pending |
| 8 | Physics/entity | Player done; re-enable mobs behind entity budget; ECS formalization | pending |
| 9 | Gameplay | Land combat/crafting/equipment/inventory extraction (uncommitted WIP) | pending |
| 10 | Assets | Asset registry; atlas pipeline formalization; no absolute paths | pending |
| 11 | Saves | **Versioned save format + migration**; never silent-corrupt | pending |
| 12 | Editor | Unify Mod Studio + Custom World + terrainlab under editor shell | pending |
| 13 | AI | Keep `vythera_ai` separable; engine-facing AI service interface | pending |
| 14 | Networking | Keep; protocol versioning; determinism checks per room | pending |
| 15 | Mobile | Validate very-low/low presets on real devices; touch UX pass | pending |
| 16 | PC quality | High/max preset polish; shadow/AO improvements with measurements | pending |
| 17 | Stabilization | Profiler-driven optimization; regression suite expansion | pending |

Ordering note: save versioning (11) and worker streaming (7) outrank editor
work — they protect player data and unlock every performance tier.

---

## 4. Engineering invariants

1. **Green baseline** — never leave `npm test` / `npm run build` broken.
2. Bug fixes: reproduce → fix → regression test → suite → build.
3. Determinism: `(seed, WORLD_GENERATION_VERSION, cx, cz)` reproducible.
4. Settings must change engine behavior, not just UI (gfxPrefs model).
5. Engine layer never imports from game layer.
6. Measure before optimizing; record numbers in commit messages.
7. No fake implementations; stubs are marked `// STUB:` explicitly.
8. Tests are plain `tsx` scripts using `node:assert/strict` (existing convention).

## 5. Commands

```bash
npm run dev        # dev server
npm test           # full suite (24 sub-suites, serial)
npm run build      # tsc + vite build
```
