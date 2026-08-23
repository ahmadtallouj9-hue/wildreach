# Wildreach

Browser voxel exploration game — walk an endless seeded world, find biomes, caves, and landmarks.

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints, then click the canvas to look around.

Optional seed: `http://localhost:5173/?seed=yourseed`

## Controls

| Input | Action |
|-------|--------|
| Click | Capture mouse |
| WASD | Move |
| Space | Jump |
| Shift | Sprint |
| Left click | Break block |
| Right click | Place block |
| 1–8 / scroll | Select material |
| J | Field journal |
| M | Sketch map |
| Esc | Close panels / release pointer |

## v1 features

- Chunk-streamed voxel terrain (Three.js)
- Procedural block textures + vertex ambient occlusion
- BSL-inspired look: custom terrain/water shaders, soft shadows, bloom, ACES grade
- Five biomes: Windplain, Deepwood, Highreach, Sunscorch, Mirefen
- Caves + sparse landmarks (monolith, ruin, crystal, overlook)
- Discovery UI: compass, biome chip, journal, fog-of-war sketch map
- Break / place blocks with a slim material tray (1–8)
- Day/night cycle and biome-tinted fog
- Reproducible worlds via `?seed=`

## Stack

Vite · TypeScript · Three.js · simplex-noise
