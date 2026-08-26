# VYTHERA Hybrid Online Deployment

This document describes how to run **public** VYTHERA services without exposing the private development PC (RTX training machine, local Ollama, datasets, training daemon).

## Topology

```text
PRIVATE DEV PC (always private)
  Game development · Local Ollama · VLM training · datasets · adapters · train daemon
           │
           │  explicit publish only (mods / model metadata / promoted adapters)
           ▼
PUBLIC CLOUD / VPS (PC can be OFF)
  API · Auth · Mod Hub · Object storage · Model registry · Inference · Search
```

**Never:** Internet → home router → VYTHERA PC  
**Never:** bind private AI/training to `0.0.0.0` or create router port forwards for them.

## Components (scale independently)

| Component | Role | Notes |
|-----------|------|--------|
| Game client | Static web (e.g. Vercel) | Offline play + local AI still work |
| Online API | `server/online` | Auth, mods, models, inference stub, health |
| Database | JSON file by default | Swap for Postgres later; metadata only |
| Object storage | Local FS abstraction | Swap for S3/R2/GCS; packages + screenshots |
| Inference | Separate process | Stub by default; CPU or small GPU often enough |
| CDN | Optional | Prefer signed URLs; do not stream large files through the API process |

## Local smoke (loopback only)

```bash
# Terminal A — Online API (defaults to 127.0.0.1:8788)
npm run vythera:online

# Terminal B — game
npm run dev
```

In Settings → Privacy:

- Set **Online API base URL** to `http://127.0.0.1:8788`
- Enable Cloud/Online AI only if you want AUTO/ONLINE routing for *safe* requests
- Keep Data sharing **PRIVATE** unless publishing

Private datasets, unpublished adapters, and training logs are **not** uploaded automatically.

## Cloud / VPS checklist

1. Provision a VPS (or container host). **Do not** use the home PC.
2. Install Node 20+.
3. Copy repo (or a release artifact) **without** `.vythera` private datasets / local adapters.
4. Set secrets from `.env.online.example` (especially `VYTHERA_ONLINE_JWT_SECRET`).
5. Only if behind a reverse proxy: `VYTHERA_ONLINE_HOST=0.0.0.0` and `VYTHERA_ONLINE_ALLOW_PUBLIC_BIND=1`.
6. Terminate HTTPS at Caddy/nginx/Traefik; point DNS at the VPS.
7. Restrict CORS to your game origins.
8. Back up `VYTHERA_ONLINE_DATA` (DB + object store).
9. Deploy inference separately when ready; keep `VYTHERA_ONLINE_VISION=0` until a real VLM is installed.
10. Do **not** deploy until `npm run vythera:security:audit` and Online smoke tests pass.

## Publishing boundary

```text
PRIVATE MODEL / MOD
  → validate → evaluate → sanitize metadata → explicit PUBLISH
  → Online registry / Mod Hub
```

Rejected automatically: filesystem paths, private IPs, credentials, dataset/training log fields.

## Training stays local by default

```text
Teach → Dataset → Train (RTX) → Evaluate → Promote → optional Publish
```

`npm run vythera:train:daemon` remains loopback-only on the private PC.

## Health

`GET /api/v1/health` returns service status only (no IPs, paths, secrets, or hostnames).

## Cost control

API, database, storage, and inference scale separately. Prefer an inexpensive CPU/small-GPU inference host sized to the published model — do not assume an RTX 5070-class GPU is required in production.
