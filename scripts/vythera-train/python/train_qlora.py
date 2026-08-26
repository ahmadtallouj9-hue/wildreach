#!/usr/bin/env python3
"""
VYTHERA local QLoRA/LoRA trainer.

Loads an exported VYTHERA visual dataset directory and fine-tunes a local
Hugging Face causal LM with PEFT. Writes adapter weights + manifest.json.

Does NOT contact cloud APIs for training data.
Does NOT invent metrics — values come from the trainer.

Usage:
  python train_qlora.py --base <hf-or-path> --data <dataset-dir> --out <adapter-dir>
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path


def fail(msg: str, code: int = 1) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


def load_jsonl(path: Path) -> list[dict]:
    rows = []
    if not path.exists():
        return rows
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        rows.append(json.loads(line))
    return rows


def validate_rows(rows: list[dict]) -> None:
    if not rows:
        fail("empty training split")
    for i, r in enumerate(rows):
        if "instruction" not in r or not isinstance(r["instruction"], str):
            fail(f"row {i} missing instruction")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--epochs", type=int, default=1)
    ap.add_argument("--lr", type=float, default=2e-4)
    ap.add_argument("--batch", type=int, default=1)
    ap.add_argument("--method", choices=["qlora", "lora"], default="qlora")
    ap.add_argument("--max-steps", type=int, default=0, help="0 = derive from data")
    args = ap.parse_args()

    data_dir = Path(args.data)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    man_path = data_dir / "manifest.json"
    if not man_path.exists():
        fail("dataset manifest.json missing")
    manifest = json.loads(man_path.read_text(encoding="utf-8"))
    if manifest.get("type") != "vythera_visual_dataset_export":
        fail("invalid dataset manifest type")

    train_rows = load_jsonl(data_dir / "train.jsonl")
    val_rows = load_jsonl(data_dir / "validation.jsonl")
    validate_rows(train_rows)

    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments, Trainer
        from peft import LoraConfig, get_peft_model, TaskType
    except ImportError as e:
        fail(
            f"Missing dependency: {e}. Install scripts/vythera-train/python/requirements.txt"
        )

    texts = []
    for r in train_rows:
        expected = r.get("expected_output")
        target = json.dumps(expected) if expected is not None else ""
        texts.append(f"### Instruction:\n{r['instruction']}\n\n### Response:\n{target}")

    print(f"step=0 / loading base model {args.base}", flush=True)
    try:
        tokenizer = AutoTokenizer.from_pretrained(args.base, trust_remote_code=False)
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token
        load_kwargs = {"trust_remote_code": False}
        if args.method == "qlora" and torch.cuda.is_available():
            try:
                from transformers import BitsAndBytesConfig

                load_kwargs["quantization_config"] = BitsAndBytesConfig(
                    load_in_4bit=True,
                    bnb_4bit_compute_dtype=torch.float16,
                )
            except Exception as e:
                print(f"QLoRA bitsandbytes unavailable ({e}); falling back to LoRA", flush=True)
        model = AutoModelForCausalLM.from_pretrained(args.base, **load_kwargs)
    except Exception as e:
        fail(f"Failed to load base model '{args.base}': {e}")

    lora = LoraConfig(
        task_type=TaskType.CAUSAL_LM,
        r=8,
        lora_alpha=16,
        lora_dropout=0.05,
        target_modules=["q_proj", "v_proj", "k_proj", "o_proj"],
    )
    try:
        model = get_peft_model(model, lora)
    except Exception:
        # Some models use different module names — try a minimal config
        lora = LoraConfig(task_type=TaskType.CAUSAL_LM, r=8, lora_alpha=16, lora_dropout=0.05)
        model = get_peft_model(model, lora)

    enc = tokenizer(
        texts,
        truncation=True,
        padding=True,
        max_length=512,
        return_tensors="pt",
    )

    class DS(torch.utils.data.Dataset):
        def __len__(self):
            return enc["input_ids"].shape[0]

        def __getitem__(self, idx):
            return {
                "input_ids": enc["input_ids"][idx],
                "attention_mask": enc["attention_mask"][idx],
                "labels": enc["input_ids"][idx].clone(),
            }

    dataset = DS()
    max_steps = args.max_steps or max(1, len(dataset) * max(1, args.epochs))
    print(f"step=1 / {max_steps} preparing trainer", flush=True)

    training_args = TrainingArguments(
        output_dir=str(out_dir / "hf_runs"),
        per_device_train_batch_size=max(1, args.batch),
        num_train_epochs=args.epochs,
        learning_rate=args.lr,
        logging_steps=1,
        save_strategy="no",
        report_to=[],
        max_steps=max_steps if args.max_steps else -1,
        fp16=torch.cuda.is_available(),
    )

    class ProgressTrainer(Trainer):
        def log(self, logs, *a, **k):
            super().log(logs, *a, **k)
            step = int(logs.get("step") or logs.get("global_step") or 0)
            loss = logs.get("loss")
            total = max_steps
            if loss is not None:
                print(f"step={step} / {total} loss={loss}", flush=True)
            else:
                print(f"step={step} / {total}", flush=True)

    trainer = ProgressTrainer(model=model, args=training_args, train_dataset=dataset)
    train_result = trainer.train()
    metrics = train_result.metrics if hasattr(train_result, "metrics") else {}
    train_loss = metrics.get("train_loss")
    if train_loss is not None:
        train_loss = float(train_loss)

    # Optional tiny validation loss via teacher-forcing NLL on a few rows
    val_loss = None
    if val_rows:
        model.eval()
        losses = []
        with torch.no_grad():
            for r in val_rows[:8]:
                expected = r.get("expected_output")
                target = json.dumps(expected) if expected is not None else ""
                text = f"### Instruction:\n{r['instruction']}\n\n### Response:\n{target}"
                batch = tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
                batch = {k: v.to(model.device) for k, v in batch.items()}
                out = model(**batch, labels=batch["input_ids"])
                if out.loss is not None:
                    losses.append(float(out.loss.detach().cpu()))
        if losses:
            val_loss = sum(losses) / len(losses)

    model.save_pretrained(str(out_dir))
    tokenizer.save_pretrained(str(out_dir / "tokenizer"))

    # Ensure expected filenames for orchestrator
    cfg = out_dir / "adapter_config.json"
    if not cfg.exists():
        # PEFT may write adapter_config.json already; if not, write minimal
        cfg.write_text(json.dumps({"peft_type": "LORA", "base_model_name_or_path": args.base}), encoding="utf-8")

    # PEFT saves adapter_model.safetensors or .bin — verify
    has_weights = (out_dir / "adapter_model.safetensors").exists() or (out_dir / "adapter_model.bin").exists()
    if not has_weights:
        fail("Adapter weights were not written")

    steps = int(metrics.get("train_steps") or metrics.get("global_step") or max_steps)
    completion = {
        "status": "completed",
        "baseModel": args.base,
        "adapterPath": str(out_dir.resolve()),
        "datasetVersion": manifest.get("datasetVersion"),
        "trainingSteps": steps,
        "epochs": args.epochs,
        "trainLoss": train_loss,
        "validationLoss": val_loss,
        "metricsPath": str((out_dir / "metrics.json").resolve()),
        "completedAt": int(time.time() * 1000),
        "provider": "python-qlora",
    }
    (out_dir / "metrics.json").write_text(
        json.dumps({"train_loss": train_loss, "validation_loss": val_loss, "steps": steps, "epochs": args.epochs}, indent=2),
        encoding="utf-8",
    )
    (out_dir / "manifest.json").write_text(json.dumps(completion, indent=2), encoding="utf-8")
    print(f"step={steps} / {steps} loss={train_loss}", flush=True)
    print("TRAINING COMPLETE", flush=True)


if __name__ == "__main__":
    main()
