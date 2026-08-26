#!/usr/bin/env python3
"""
VYTHERA local training smoke test.

Tiny end-to-end PEFT LoRA run on sshleifer/tiny-gpt2 (or --base).
Does not use the user's full training dataset.

Prints exactly:
  VYTHERA LOCAL TRAINING SMOKE TEST: PASS
or
  VYTHERA LOCAL TRAINING SMOKE TEST: FAIL
with the reason.
"""
from __future__ import annotations

import argparse
import json
import sys
import tempfile
import traceback
from pathlib import Path


def fail(reason: str) -> None:
    print(f"VYTHERA LOCAL TRAINING SMOKE TEST: FAIL", flush=True)
    print(f"Reason: {reason}", flush=True)
    sys.exit(1)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="sshleifer/tiny-gpt2")
    ap.add_argument("--out", default="")
    args = ap.parse_args()

    try:
        import torch
        print(f"ok python + torch {torch.__version__}", flush=True)
    except Exception as e:
        fail(f"PyTorch import failed: {e}")

    try:
        from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments, Trainer
        from peft import LoraConfig, get_peft_model, TaskType
    except Exception as e:
        fail(f"transformers/peft import failed: {e}")

    out = Path(args.out) if args.out else Path(tempfile.mkdtemp(prefix="vythera_smoke_"))
    out.mkdir(parents=True, exist_ok=True)

    try:
        print(f"loading tokenizer {args.base}", flush=True)
        tok = AutoTokenizer.from_pretrained(args.base)
        if tok.pad_token is None:
            tok.pad_token = tok.eos_token
        print(f"loading model {args.base}", flush=True)
        model = AutoModelForCausalLM.from_pretrained(args.base)
        lora = LoraConfig(
            task_type=TaskType.CAUSAL_LM,
            r=4,
            lora_alpha=8,
            lora_dropout=0.0,
            target_modules=["c_attn"] if "gpt2" in args.base.lower() else None,
        )
        if lora.target_modules is None:
            lora = LoraConfig(task_type=TaskType.CAUSAL_LM, r=4, lora_alpha=8, lora_dropout=0.0)
        model = get_peft_model(model, lora)
        print("LoRA config applied", flush=True)

        texts = [
            "### Instruction:\nSay hello\n\n### Response:\nhello",
            "### Instruction:\nVoxel tree\n\n### Response:\n{\"kind\":\"tree\"}",
        ]
        enc = tok(texts, truncation=True, padding=True, max_length=64, return_tensors="pt")

        class DS(torch.utils.data.Dataset):
            def __len__(self):
                return enc["input_ids"].shape[0]

            def __getitem__(self, idx):
                return {
                    "input_ids": enc["input_ids"][idx],
                    "attention_mask": enc["attention_mask"][idx],
                    "labels": enc["input_ids"][idx].clone(),
                }

        args_tr = TrainingArguments(
            output_dir=str(out / "runs"),
            per_device_train_batch_size=1,
            max_steps=2,
            learning_rate=1e-4,
            logging_steps=1,
            save_strategy="no",
            report_to=[],
            fp16=False,
        )
        trainer = Trainer(model=model, args=args_tr, train_dataset=DS())
        print("running training steps", flush=True)
        trainer.train()
        model.save_pretrained(str(out))
        tok.save_pretrained(str(out / "tokenizer"))

        cfg = out / "adapter_config.json"
        weights = (out / "adapter_model.safetensors").exists() or (out / "adapter_model.bin").exists()
        if not cfg.exists():
            fail("adapter_config.json not written")
        if not weights:
            fail("adapter weights not written")
        man = {
            "status": "completed",
            "baseModel": args.base,
            "adapterPath": str(out.resolve()),
            "smoke": True,
            "cuda": bool(torch.cuda.is_available()),
            "device": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "cpu",
        }
        (out / "manifest.json").write_text(json.dumps(man, indent=2), encoding="utf-8")
        print(json.dumps(man), flush=True)
        print("VYTHERA LOCAL TRAINING SMOKE TEST: PASS", flush=True)
    except Exception as e:
        traceback.print_exc()
        fail(str(e))


if __name__ == "__main__":
    main()
