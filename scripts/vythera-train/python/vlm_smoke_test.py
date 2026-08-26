#!/usr/bin/env python3
"""
VYTHERA VLM training smoke test — real load, LoRA step, save, reload, infer.
"""
from __future__ import annotations

import json
import sys
import tempfile
import traceback
from pathlib import Path

from PIL import Image


def fail(reason: str) -> None:
    print("VYTHERA VLM TRAINING SMOKE TEST: FAIL", flush=True)
    print(f"Reason: {reason}", flush=True)
    sys.exit(1)


def main() -> None:
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="HuggingFaceTB/SmolVLM-256M-Instruct")
    ap.add_argument("--out", default="")
    args = ap.parse_args()

    try:
        import torch
        from transformers import AutoProcessor, AutoModelForImageTextToText, TrainingArguments, Trainer
        from peft import LoraConfig, get_peft_model, PeftModel, TaskType
    except Exception as e:
        fail(f"Import failed: {e}")

    out = Path(args.out) if args.out else Path(tempfile.mkdtemp(prefix="vythera_vlm_smoke_"))
    out.mkdir(parents=True, exist_ok=True)
    img_path = out / "smoke.png"
    Image.new("RGB", (64, 64), color=(34, 120, 60)).save(img_path)

    try:
        print(f"loading processor {args.base}", flush=True)
        processor = AutoProcessor.from_pretrained(args.base, trust_remote_code=True)
        print(f"loading model {args.base}", flush=True)
        dtype = torch.float16 if torch.cuda.is_available() else torch.float32
        model = AutoModelForImageTextToText.from_pretrained(
            args.base,
            torch_dtype=dtype,
            device_map="auto" if torch.cuda.is_available() else None,
            trust_remote_code=True,
        )
        targets = []
        for n, m in model.named_modules():
            if m.__class__.__name__ in ("Linear", "Linear4bit") and n.split(".")[-1] in (
                "q_proj", "v_proj", "k_proj", "o_proj", "gate_proj", "up_proj", "down_proj"
            ):
                targets.append(n.split(".")[-1])
        targets = sorted(set(targets)) or ["q_proj", "v_proj"]
        print(f"LoRA targets {targets}", flush=True)
        model = get_peft_model(
            model,
            LoraConfig(
                r=4,
                lora_alpha=8,
                lora_dropout=0.0,
                bias="none",
                task_type=TaskType.CAUSAL_LM,
                target_modules=targets,
            ),
        )

        image = Image.open(img_path).convert("RGB")
        instruction = "What color is dominant?"
        target = '{"style":"solid","palette":["#22783c"],"objects":["block"]}'
        messages = [
            {
                "role": "user",
                "content": [{"type": "image"}, {"type": "text", "text": instruction}],
            },
            {"role": "assistant", "content": [{"type": "text", "text": target}]},
        ]
        try:
            prompt = processor.apply_chat_template(messages, add_generation_prompt=False)
        except Exception as e:
            fail(f"apply_chat_template failed: {e}")
        if "<image>" not in prompt:
            fail("chat template missing <image> token")
        text = prompt

        enc = processor(
            text=text,
            images=[image],
            return_tensors="pt",
            padding=True,
        )
        # Do not truncate multimodal sequences — truncating can drop <image> tokens
        # and break Idefics3 processing.
        labels = enc["input_ids"].clone()
        if processor.tokenizer.pad_token_id is not None:
            labels[labels == processor.tokenizer.pad_token_id] = -100
        enc["labels"] = labels

        class DS(torch.utils.data.Dataset):
            def __len__(self):
                return 1

            def __getitem__(self, idx):
                return {k: v[0] for k, v in enc.items()}

        print("running training step", flush=True)
        targs = TrainingArguments(
            output_dir=str(out / "runs"),
            per_device_train_batch_size=1,
            max_steps=1,
            learning_rate=1e-4,
            logging_steps=1,
            save_strategy="no",
            report_to=[],
            fp16=torch.cuda.is_available(),
            remove_unused_columns=False,
        )
        Trainer(model=model, args=targs, train_dataset=DS()).train()
        model.save_pretrained(str(out))
        processor.save_pretrained(str(out / "processor"))

        if not (out / "adapter_config.json").exists():
            fail("adapter_config.json missing")
        if not (
            (out / "adapter_model.safetensors").exists()
            or (out / "adapter_model.bin").exists()
        ):
            fail("adapter weights missing")

        print("reloading adapter", flush=True)
        base = AutoModelForImageTextToText.from_pretrained(
            args.base,
            torch_dtype=dtype,
            device_map="auto" if torch.cuda.is_available() else None,
            trust_remote_code=True,
        )
        adapted = PeftModel.from_pretrained(base, str(out))
        adapted.eval()
        infer_messages = [
            {
                "role": "user",
                "content": [{"type": "image"}, {"type": "text", "text": instruction}],
            }
        ]
        try:
            prompt = processor.apply_chat_template(
                infer_messages, add_generation_prompt=True
            )
        except Exception:
            prompt = f"<image>\nUser: {instruction}\nAssistant:"
        inputs = processor(text=prompt, images=[image], return_tensors="pt")
        if torch.cuda.is_available():
            inputs = {k: v.to(adapted.device) if hasattr(v, "to") else v for k, v in inputs.items()}
        with torch.no_grad():
            gen = adapted.generate(**inputs, max_new_tokens=32)
        decoded = processor.batch_decode(gen, skip_special_tokens=True)[0]
        print(f"inference_sample={decoded[:200]}", flush=True)

        man = {
            "status": "completed",
            "baseModel": args.base,
            "modality": "VISION_LANGUAGE",
            "smoke": True,
            "cuda": bool(torch.cuda.is_available()),
            "device": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "cpu",
        }
        (out / "manifest.json").write_text(json.dumps(man, indent=2), encoding="utf-8")
        print(json.dumps(man), flush=True)
        print("VYTHERA VLM TRAINING SMOKE TEST: PASS", flush=True)
    except Exception as e:
        traceback.print_exc()
        fail(str(e))


if __name__ == "__main__":
    main()
