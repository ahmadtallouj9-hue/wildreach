#!/usr/bin/env python3
"""Held-out VLM evaluation: base vs base+adapter on real images."""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from PIL import Image


def fail(msg: str, code: int = 1) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


def load_rows(data_dir: Path) -> list[dict]:
    for rel in ("held_out/data.jsonl", "validation/data.jsonl", "held_out.jsonl", "validation.jsonl"):
        p = data_dir / rel
        if p.exists() and p.read_text(encoding="utf-8").strip():
            return [json.loads(l) for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]
    return []


def resolve_image(data_dir: Path, row: dict) -> Path:
    img = row.get("image") or ""
    p = Path(img)
    if p.is_file():
        return p
    for split in ("held_out", "validation", "train"):
        for base in (data_dir / split, data_dir / split / "images", data_dir / "images"):
            c = base / img
            if c.is_file():
                return c
            c2 = base / Path(img).name
            if c2.is_file():
                return c2
    fail(f"image missing: {img}")


def extract_json(text: str):
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


def field_score(pred, target, raw_text: str = "") -> float:
    """Score structured fields; fall back to keyword hits in raw generation."""
    raw = (raw_text or "").lower()
    if isinstance(target, dict):
        keys = ["style", "objects", "materials", "palette", "category"]
        hits = 0.0
        total = 0
        for k in keys:
            if k not in target or target.get(k) in (None, [], "", {}):
                continue
            total += 1
            tv, pv = target.get(k), pred.get(k) if isinstance(pred, dict) else None
            if tv == pv:
                hits += 1.0
            elif isinstance(tv, list) and isinstance(pv, list):
                if set(map(str, tv)) & set(map(str, pv)):
                    hits += 0.5
            elif pv is not None and (
                str(tv).lower() in str(pv).lower() or str(pv).lower() in str(tv).lower()
            ):
                hits += 0.5
            else:
                # Keyword overlap in free-form generation (tiny VLMs rarely emit exact JSON)
                tokens: list[str] = []
                if isinstance(tv, list):
                    for x in tv:
                        if isinstance(x, (str, int, float)):
                            tokens.append(str(x).lower())
                        elif isinstance(x, list) and x:
                            tokens.append(str(x[0]).lower())
                else:
                    tokens.append(str(tv).lower())
                if any(t and len(t) > 2 and t in raw for t in tokens):
                    hits += 0.35
        if total:
            return hits / total
    if not isinstance(target, dict):
        return 1.0 if str(pred).strip() and str(pred).strip() in str(target) else 0.0
    # Non-empty JSON-ish reply still gets a tiny floor so completed jobs are distinguishable
    if raw.strip() and "{" in raw:
        return 0.05
    return 0.0


def generate(model, processor, image, instruction, device, max_new=64):
    import torch

    messages = [
        {
            "role": "user",
            "content": [{"type": "image"}, {"type": "text", "text": instruction}],
        }
    ]
    try:
        prompt = processor.apply_chat_template(messages, add_generation_prompt=True)
    except Exception:
        prompt = f"<image>\nUser: {instruction}\nAssistant:"
    inputs = processor(text=prompt, images=[image], return_tensors="pt")
    inputs = {k: v.to(device) if hasattr(v, "to") else v for k, v in inputs.items()}
    with torch.no_grad():
        out = model.generate(**inputs, max_new_tokens=max_new)
    return processor.batch_decode(out, skip_special_tokens=True)[0]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--adapter", required=True)
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    import torch
    from transformers import AutoProcessor, AutoModelForImageTextToText
    from peft import PeftModel

    data_dir = Path(args.data)
    rows = load_rows(data_dir)[:8]
    if not rows:
        fail("no held-out/validation rows")

    dtype = torch.float16 if torch.cuda.is_available() else torch.float32
    processor = AutoProcessor.from_pretrained(args.base, trust_remote_code=True)
    base_model = AutoModelForImageTextToText.from_pretrained(
        args.base,
        torch_dtype=dtype,
        device_map="auto" if torch.cuda.is_available() else None,
        trust_remote_code=True,
    )
    device = next(base_model.parameters()).device

    base_scores = []
    cand_by_task: dict[str, list[float]] = {}
    samples = []
    for row in rows:
        image = Image.open(resolve_image(data_dir, row)).convert("RGB")
        image.thumbnail((384, 384))
        instruction = row["instruction"]
        target = row.get("target")
        text = generate(base_model, processor, image, instruction, device)
        pred = extract_json(text)
        sc = field_score(pred, target, text)
        base_scores.append(sc)
        samples.append(
            {
                "id": row.get("id"),
                "phase": "base",
                "score": sc,
                "task": (row.get("metadata") or {}).get("task")
                or (row.get("metadata") or {}).get("taskType"),
                "instruction": instruction[:200],
                "predictionPreview": text[:300],
            }
        )

    cand = PeftModel.from_pretrained(base_model, args.adapter)
    cand.eval()
    cand_scores = []
    for row in rows:
        image = Image.open(resolve_image(data_dir, row)).convert("RGB")
        image.thumbnail((384, 384))
        instruction = row["instruction"]
        target = row.get("target")
        text = generate(cand, processor, image, instruction, device)
        pred = extract_json(text)
        sc = field_score(pred, target, text)
        cand_scores.append(sc)
        meta = row.get("metadata") or {}
        task_key = meta.get("taskType") or meta.get("task") or meta.get("learnTaskType") or "OVERALL"
        cand_by_task.setdefault(str(task_key), []).append(sc)
        samples.append(
            {
                "id": row.get("id"),
                "phase": "candidate",
                "score": sc,
                "task": task_key,
                "instruction": instruction[:200],
                "predictionPreview": text[:300],
            }
        )

    base_score = sum(base_scores) / len(base_scores)
    candidate_score = sum(cand_scores) / len(cand_scores)
    by_task = {k: (sum(v) / len(v)) for k, v in cand_by_task.items() if v}
    report = {
        "modality": "VISION_LANGUAGE",
        "model": args.base,
        "adapter": args.adapter,
        "dataset": str(data_dir),
        "evaluationSamples": len(rows),
        "metrics": {
            "baseScore": base_score,
            "candidateScore": candidate_score,
            "improved": candidate_score > base_score,
            "samples": len(rows),
            "byTask": by_task,
        },
        "byTask": by_task,
        "samples": samples,
        "configuration": {"max_new_tokens": 64, "image_side": 384},
        "timestamp": __import__("time").time() * 1000,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report["metrics"]), flush=True)


if __name__ == "__main__":
    main()
