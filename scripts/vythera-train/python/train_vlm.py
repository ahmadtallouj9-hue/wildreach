#!/usr/bin/env python3
"""
VYTHERA vision-language PEFT trainer (separate from text train_qlora.py).

Uses AutoModelForImageTextToText + AutoProcessor + PEFT LoRA/QLoRA.
Requires a multimodal dataset with real image files.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from PIL import Image


def fail(msg: str, code: int = 1) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


def load_split(data_dir: Path, split: str) -> list[dict]:
    # Prefer nested layout: train/data.jsonl + train/images/
    nested = data_dir / split / "data.jsonl"
    flat = data_dir / f"{split}.jsonl"
    path = nested if nested.exists() else flat
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        rows.append(json.loads(line))
    return rows


def resolve_image(data_dir: Path, split: str, row: dict) -> Path:
    img = row.get("image") or row.get("image_path")
    if not img:
        fail(f"row {row.get('id')} missing image path")
    p = Path(img)
    if p.is_file():
        return p
    # relative to split or dataset root
    for base in (data_dir / split, data_dir, data_dir / split / "images", data_dir / "images"):
        cand = base / img
        if cand.is_file():
            return cand
        cand2 = base / Path(img).name
        if cand2.is_file():
            return cand2
    fail(f"image not found for {row.get('id')}: {img}")


def detect_lora_targets(model) -> list[str]:
    preferred = [
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj",
    ]
    found = set()
    for name, mod in model.named_modules():
        cls = mod.__class__.__name__
        if cls not in ("Linear", "Linear4bit", "Conv1D"):
            continue
        leaf = name.split(".")[-1]
        if leaf in preferred:
            found.add(leaf)
    if found:
        return sorted(found)
    # fallback: common attention names only
    return ["q_proj", "v_proj"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--epochs", type=int, default=1)
    ap.add_argument("--lr", type=float, default=2e-4)
    ap.add_argument("--batch", type=int, default=1)
    ap.add_argument("--grad-accum", type=int, default=4)
    ap.add_argument("--method", choices=["qlora", "lora"], default="lora")
    ap.add_argument("--max-steps", type=int, default=0)
    ap.add_argument("--max-seq", type=int, default=512)
    ap.add_argument("--lora-r", type=int, default=8)
    ap.add_argument("--image-side", type=int, default=384)
    ap.add_argument("--grad-checkpoint", action="store_true")
    args = ap.parse_args()

    data_dir = Path(args.data)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    man_path = data_dir / "manifest.json"
    if not man_path.exists():
        fail("dataset manifest.json missing")
    manifest = json.loads(man_path.read_text(encoding="utf-8"))
    modality = manifest.get("modality") or "VISION_LANGUAGE"
    if modality != "VISION_LANGUAGE":
        fail(f"train_vlm.py requires VISION_LANGUAGE modality, got {modality}")

    train_rows = load_split(data_dir, "train")
    if not train_rows:
        fail("empty train split")
    for i, r in enumerate(train_rows):
        if "instruction" not in r:
            fail(f"row {i} missing instruction")
        if not (r.get("image") or r.get("image_path")):
            fail(f"row {i} missing image — cannot train VLM on text-only")

    try:
        import torch
        from transformers import (
            AutoProcessor,
            AutoModelForImageTextToText,
            TrainingArguments,
            Trainer,
            BitsAndBytesConfig,
        )
        from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training, TaskType
    except ImportError as e:
        fail(f"Missing dependency: {e}")

    print(f"step=0 / loading VLM {args.base}", flush=True)
    processor = AutoProcessor.from_pretrained(args.base, trust_remote_code=True)

    load_kwargs: dict = {"trust_remote_code": True}
    use_qlora = args.method == "qlora" and torch.cuda.is_available()
    if use_qlora:
        try:
            load_kwargs["quantization_config"] = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_compute_dtype=torch.float16,
                bnb_4bit_use_double_quant=True,
                bnb_4bit_quant_type="nf4",
            )
            load_kwargs["device_map"] = "auto"
        except Exception as e:
            print(f"QLoRA unavailable ({e}); falling back to LoRA", flush=True)
            use_qlora = False

    if not use_qlora:
        load_kwargs["torch_dtype"] = torch.float16 if torch.cuda.is_available() else torch.float32
        if torch.cuda.is_available():
            load_kwargs["device_map"] = "auto"

    try:
        model = AutoModelForImageTextToText.from_pretrained(args.base, **load_kwargs)
    except Exception as e:
        fail(f"Failed to load VLM '{args.base}': {e}")

    if use_qlora:
        model = prepare_model_for_kbit_training(model)
    if args.grad_checkpoint and hasattr(model, "gradient_checkpointing_enable"):
        model.gradient_checkpointing_enable()

    targets = detect_lora_targets(model)
    print(f"LoRA target_modules={targets}", flush=True)
    lora = LoraConfig(
        r=args.lora_r,
        lora_alpha=max(16, args.lora_r * 2),
        lora_dropout=0.05,
        bias="none",
        task_type=TaskType.CAUSAL_LM,
        target_modules=targets,
    )
    model = get_peft_model(model, lora)

    class VlmDataset(torch.utils.data.Dataset):
        def __init__(self, rows: list[dict], split: str):
            self.rows = rows
            self.split = split

        def __len__(self):
            return len(self.rows)

        def __getitem__(self, idx):
            row = self.rows[idx]
            img_path = resolve_image(data_dir, self.split, row)
            try:
                image = Image.open(img_path).convert("RGB")
                image.load()
            except OSError as e:
                fail(f"unreadable image {img_path}: {e}")
            # resize lightly for VRAM
            side = args.image_side
            image.thumbnail((side, side))
            instruction = row["instruction"]
            target = row.get("target")
            if target is None:
                target = row.get("expected_output")
            if isinstance(target, (dict, list)):
                target = json.dumps(target, ensure_ascii=False)
            target = str(target or "")
            # SmolVLM / Idefics3 chat format
            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "image"},
                        {"type": "text", "text": instruction},
                    ],
                },
                {
                    "role": "assistant",
                    "content": [{"type": "text", "text": target}],
                },
            ]
            try:
                prompt = processor.apply_chat_template(messages, add_generation_prompt=False)
            except Exception:
                prompt = f"<image>\nUser: {instruction}\nAssistant: {target}"
            return {"image": image, "text": prompt, "target_len": len(target)}

    def collate(batch):
        images = [b["image"] for b in batch]
        texts = [b["text"] for b in batch]
        enc = processor(
            text=texts,
            images=images,
            return_tensors="pt",
            padding=True,
        )
        # Avoid truncating away <image> tokens (Idefics3/SmolVLM)
        labels = enc["input_ids"].clone()
        if processor.tokenizer.pad_token_id is not None:
            labels[labels == processor.tokenizer.pad_token_id] = -100
        enc["labels"] = labels
        return enc

    dataset = VlmDataset(train_rows, "train")
    max_steps = args.max_steps or max(1, len(dataset) * max(1, args.epochs))
    print(f"step=1 / {max_steps} preparing VLM trainer", flush=True)

    training_args = TrainingArguments(
        output_dir=str(out_dir / "hf_runs"),
        per_device_train_batch_size=max(1, args.batch),
        gradient_accumulation_steps=max(1, args.grad_accum),
        num_train_epochs=args.epochs,
        learning_rate=args.lr,
        logging_steps=1,
        save_strategy="no",
        report_to=[],
        max_steps=max_steps if args.max_steps else -1,
        fp16=torch.cuda.is_available(),
        remove_unused_columns=False,
        dataloader_pin_memory=False,
    )

    class ProgressTrainer(Trainer):
        def log(self, logs, *a, **k):
            super().log(logs, *a, **k)
            step = int(logs.get("step") or logs.get("global_step") or 0)
            loss = logs.get("loss")
            if loss is not None:
                print(f"step={step} / {max_steps} loss={loss}", flush=True)
            else:
                print(f"step={step} / {max_steps}", flush=True)

    trainer = ProgressTrainer(
        model=model,
        args=training_args,
        train_dataset=dataset,
        data_collator=collate,
    )
    train_result = trainer.train()
    metrics = getattr(train_result, "metrics", {}) or {}
    train_loss = metrics.get("train_loss")
    if train_loss is not None:
        train_loss = float(train_loss)

    model.save_pretrained(str(out_dir))
    processor.save_pretrained(str(out_dir / "processor"))

    cfg = out_dir / "adapter_config.json"
    if not cfg.exists():
        fail("adapter_config.json not written")
    has_weights = (out_dir / "adapter_model.safetensors").exists() or (
        out_dir / "adapter_model.bin"
    ).exists()
    if not has_weights:
        fail("Adapter weights were not written")

    steps = int(metrics.get("train_steps") or metrics.get("global_step") or max_steps)
    completion = {
        "status": "completed",
        "baseModel": args.base,
        "adapterPath": str(out_dir.resolve()),
        "datasetVersion": manifest.get("datasetVersion"),
        "modality": "VISION_LANGUAGE",
        "trainingSteps": steps,
        "epochs": args.epochs,
        "trainLoss": train_loss,
        "validationLoss": None,
        "method": "QLoRA" if use_qlora else "LoRA",
        "loraTargets": targets,
        "metricsPath": str((out_dir / "metrics.json").resolve()),
        "completedAt": int(time.time() * 1000),
        "provider": "python-vlm",
    }
    (out_dir / "metrics.json").write_text(
        json.dumps(
            {
                "train_loss": train_loss,
                "steps": steps,
                "epochs": args.epochs,
                "modality": "VISION_LANGUAGE",
                "method": completion["method"],
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    (out_dir / "manifest.json").write_text(json.dumps(completion, indent=2), encoding="utf-8")
    print(f"step={steps} / {steps} loss={train_loss}", flush=True)
    print("TRAINING COMPLETE", flush=True)


if __name__ == "__main__":
    main()
