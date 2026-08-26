#!/usr/bin/env python3
"""Local VLM inference: base model + optional ACTIVE vision adapter."""
from __future__ import annotations

import argparse
import base64
import io
import json
import sys
from pathlib import Path

from PIL import Image


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--adapter", default="")
    ap.add_argument("--image-b64", required=True)
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--max-new", type=int, default=128)
    args = ap.parse_args()

    import torch
    from transformers import AutoProcessor, AutoModelForImageTextToText
    from peft import PeftModel

    raw = base64.b64decode(args.image_b64)
    image = Image.open(io.BytesIO(raw)).convert("RGB")
    image.thumbnail((512, 512))

    dtype = torch.float16 if torch.cuda.is_available() else torch.float32
    processor = AutoProcessor.from_pretrained(args.base, trust_remote_code=True)
    model = AutoModelForImageTextToText.from_pretrained(
        args.base,
        torch_dtype=dtype,
        device_map="auto" if torch.cuda.is_available() else None,
        trust_remote_code=True,
    )
    if args.adapter and Path(args.adapter).exists():
        model = PeftModel.from_pretrained(model, args.adapter)
    model.eval()

    messages = [
        {
            "role": "user",
            "content": [{"type": "image"}, {"type": "text", "text": args.prompt}],
        }
    ]
    try:
        prompt = processor.apply_chat_template(messages, add_generation_prompt=True)
    except Exception:
        prompt = f"<image>\nUser: {args.prompt}\nAssistant:"
    inputs = processor(text=prompt, images=[image], return_tensors="pt")
    device = next(model.parameters()).device
    inputs = {k: v.to(device) if hasattr(v, "to") else v for k, v in inputs.items()}
    with torch.no_grad():
        out = model.generate(**inputs, max_new_tokens=args.max_new)
    text = processor.batch_decode(out, skip_special_tokens=True)[0]
    print(
        json.dumps(
            {
                "ok": True,
                "text": text,
                "base": args.base,
                "adapter": args.adapter or None,
                "device": str(device),
            }
        ),
        flush=True,
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}), flush=True)
        sys.exit(1)
