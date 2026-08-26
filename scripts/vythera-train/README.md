# VYTHERA Local Training (Windows)

Local-only LoRA/QLoRA training for VYTHERA visual learning datasets.

**Browser never trains weights.** The Studio UI talks to a localhost daemon; the daemon runs Node orchestration and optional Python PEFT training.

## Critical distinctions

| Claim | Reality |
|-------|---------|
| **Ollama inference ≠ trainable Transformers model** | Ollama GGUF tags (e.g. `llava`) run vision inference. They are **not** PEFT-trainable bases in this pipeline. |
| **Saving an image ≠ training** | TEACH / APPROVE / ADD TO DATASET only builds a dataset. Weights change only after a real trainer run. |
| **Training text descriptions ≠ vision-model training** | Fine-tuning a text-only causal LM on image captions does **not** teach a vision tower to “see.” Use modality `VISION_LANGUAGE` with a vision-capable HF base when you need visual adaptation. |

## Architecture

```text
VYTHERA UI (Studio TRAIN/ADAPT)
   → http://127.0.0.1:8791 (daemon)
   → export dataset under .vythera/training/datasets/
   → spawn python train_qlora.py (when deps available)
   → adapters/VYTHERA-VISION-*/
   → evaluate → promote ACTIVE.json
```

## Prerequisites (Windows)

1. **Node 18+** (this repo)
2. **NVIDIA GPU + current Game Ready / Studio driver** (optional but recommended)
3. **Python 3.10–3.13** for PyTorch wheels — **not** the Microsoft Store stub under `WindowsApps`
   - Recommended: install [uv](https://github.com/astral-sh/uv) (`uv` is detected automatically), or Python 3.12 from python.org
4. Disk space for models + `.vythera/training/venv`

CUDA **toolkit** (`nvcc`) is optional. Driver CUDA / UMD is enough for PyTorch GPU wheels.

## One-command setup

```bash
npm run vythera:train:setup
```

This will:

1. Detect GPU / driver / CUDA UMD
2. Reject Windows Store Python stubs
3. Install CPython **3.12** via `uv` if needed
4. Create/reuse `.vythera/training/venv/`
5. Install **explicit** packages (printed to the console):
   - PyTorch (CUDA 12.8 wheels when NVIDIA is detected — required for RTX 50-series / sm_120)
   - transformers, peft, accelerate, datasets, safetensors, sentencepiece
   - bitsandbytes **only if importable** (otherwise: LoRA yes, QLoRA/4-bit no)
6. Verify imports + PyTorch CUDA
7. Run `python/smoke_test.py`
8. Write `.vythera/training/capability.json`

Never installs silent extras beyond the printed list.

## Environment verification

```bash
npm run vythera:train:detect
npm run vythera:train:smoke
```

Expect lines like:

```text
GPU DETECTED: OK NVIDIA GeForce …
CUDA RUNTIME AVAILABLE: OK …
PYTORCH CUDA AVAILABLE: OK …
LORA TRAINING AVAILABLE
QLORA / 4-BIT NOT AVAILABLE   # if bitsandbytes missing on Windows
```

Smoke test must print:

```text
VYTHERA LOCAL TRAINING SMOKE TEST: PASS
```

## Model selection

| Role | Example | Notes |
|------|---------|--------|
| Inference | Ollama `llava` | Studio IMAGE tab |
| Trainable base | `sshleifer/tiny-gpt2` (smoke) or a HF VL model | Must be Transformers/PEFT loadable |
| Adapter | `adapters/VYTHERA-VISION-*` | LoRA/QLoRA weights |

Selecting an Ollama tag as trainable base → **MODEL NOT TRAINABLE WITH CURRENT LOCAL BACKEND**.

### Modalities

```ts
type TrainingModality =
  | "TEXT"
  | "VISION_LANGUAGE"
  | "VISION_ENCODER"
  | "EMBEDDING";
```

Jobs declare a modality. Text-only bases cannot run `VISION_LANGUAGE` jobs.

## Vision-language training (separate from text)

Default VLM (fits ~12GB with LoRA): `HuggingFaceTB/SmolVLM-256M-Instruct`

Scripts: `python/train_vlm.py`, `python/evaluate_vlm.py`, `python/infer_vlm.py`, `python/vlm_smoke_test.py`

```bash
npm run vythera:train:vlm-smoke
```

Expect: `VYTHERA VLM TRAINING SMOKE TEST: PASS`

Active adapters are modality-split:

```text
adapters/ACTIVE_TEXT.json
adapters/ACTIVE_VISION.json
```

Runtime (local daemon):

```text
POST http://127.0.0.1:8791/vision/infer
{ "imageBase64": "...", "prompt": "..." }
```

Uses base VLM + `ACTIVE_VISION` adapter when present. Studio backend: **Local VLM + Adapter (daemon)**.

**Text QLoRA ≠ vision learning. Ollama ≠ PEFT VLM.**

## Dataset creation

In Studio: IMAGE → TEACH VYTHERA → ANALYZE → CORRECT → APPROVE → ADD TO DATASET.

Export (daemon/CLI) writes:

```text
.vythera/training/datasets/<version>/
  train.jsonl
  validation.jsonl
  held_out.jsonl
  images/          # required for VISION_* modalities
  metadata/
  manifest.json
```

Vision-language rows keep: `image`, `instruction`, `input`, `target`, `metadata`.

## Training

```bash
# Start control API (Studio buttons)
npm run vythera:train:daemon

# CLI detect
npm run vythera:train:detect

# Export + train (mock — tests only)
npx tsx scripts/vythera-train/run-job.ts --export-file records.json --version v1 --base sshleifer/tiny-gpt2 --mock --start
```

Preflight before START TRAINING:

```text
VYTHERA TRAINING PREFLIGHT
Python                 PASS
…
READY TO TRAIN
```

or `TRAINING BLOCKED` with a real reason.

When the backend is missing: job status **`awaiting_external`** — dataset creation still works.

## Evaluation / promote / rollback

```bash
npx tsx scripts/vythera-train/evaluate.ts --job train_…
npx tsx scripts/vythera-train/promote.ts --job train_…
npx tsx scripts/vythera-train/rollback.ts --to <adapter-folder>
```

Promote requires valid adapter artifacts + `evaluation.json` and a score that beats ACTIVE.

`COMPLETED` is never set without `adapter_config.json` + weights + `manifest.json`.

## Adapter layout

```text
adapters/<name>/
  adapter_config.json
  adapter_model.safetensors
  tokenizer/
  manifest.json
  metrics.json
  evaluation.json
adapters/ACTIVE.json
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Python MISSING / Store stub | Install 3.12 or run `npm run vythera:train:setup` (uses uv) |
| Packages incomplete | `npm run vythera:train:setup` |
| GPU DETECTED but PYTORCH CUDA MISSING | Re-run setup (cu128 wheels); verify smoke test |
| QLoRA unavailable | Expected on many Windows setups — use LoRA |
| Daemon offline in Studio | `npm run vythera:train:daemon` |
| Ollama model won't train | Enter a HF trainable base |
| RTX 50-series kernel errors | Need PyTorch **cu128** (setup selects this) |

## Security

- Daemon binds **127.0.0.1 only**
- Child processes use `spawn` with argv arrays (**no shell**)
- Model ids / paths validated; path traversal blocked
