"""Script to generate 44,119 MobileCLIP-S1 ONNX embeddings and build FAISS IndexFlatIP."""

import os
import sys
import time
import json
import argparse
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import numpy as np
import pandas as pd
from PIL import Image
import onnxruntime as ort
import faiss

sys.stdout.reconfigure(encoding='utf-8')

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

MAPPING_CSV = PROJECT_ROOT / "vision_44k_catalog_artifacts" / "production_mapping.csv"
IMAGES_DIR = PROJECT_ROOT / "data" / "images"
ONNX_MODEL_PATH = PROJECT_ROOT / "artifacts" / "onnx" / "mobileclip_s1_vision.onnx"

OUTPUT_EMBEDDINGS_DIR = PROJECT_ROOT / "artifacts" / "embeddings"
OUTPUT_FAISS_DIR = PROJECT_ROOT / "artifacts" / "faiss"
VISION_44K_DIR = PROJECT_ROOT / "vision_44k_catalog_artifacts"
LEGACY_DIR = PROJECT_ROOT / "data" / "embeddings" / "clip_vit_b32"
CHECKPOINT_DIR = PROJECT_ROOT / "artifacts" / "checkpoints"


def preprocess_image(path: Path, target_size: int = 256) -> np.ndarray:
    """Preprocess image using pure PIL and numpy (bilinear resize shortest edge + center crop)."""
    with Image.open(path) as img:
        img = img.convert("RGB")
        w, h = img.size
        if w < h:
            new_w = target_size
            new_h = int(round(target_size * h / w))
        else:
            new_w = int(round(target_size * w / h))
            new_h = target_size
        img = img.resize((new_w, new_h), resample=Image.BILINEAR)

        left = (new_w - target_size) // 2
        top = (new_h - target_size) // 2
        img = img.crop((left, top, left + target_size, top + target_size))

        arr = np.array(img, dtype=np.float32) / 255.0
        return np.transpose(arr, (2, 0, 1))


def main():
    parser = argparse.ArgumentParser(description="Generate full MobileCLIP-S1 embeddings and build FAISS index.")
    parser.add_argument("--batch-size", type=int, default=32, help="Inference batch size")
    parser.add_argument("--checkpoint-every", type=int, default=2500, help="Checkpoint frequency")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of items (for testing)")
    parser.add_argument("--force-recompute", action="store_true", help="Force recomputation from scratch")
    args = parser.parse_args()

    print("=" * 70)
    print("STAGE 3: FULL EMBEDDING REGENERATION (MobileCLIP-S1 ONNX)")
    print("=" * 70)

    # 1. Load mapping
    if not MAPPING_CSV.exists():
        print(f"ERROR: Mapping CSV not found at {MAPPING_CSV}", file=sys.stderr)
        sys.exit(1)

    df_mapping = pd.read_csv(MAPPING_CSV)
    if args.limit:
        df_mapping = df_mapping.head(args.limit)
    total_items = len(df_mapping)
    print(f"Catalog Items to Process: {total_items:,}")

    # 2. Setup ONNX session
    available_providers = ort.get_available_providers()
    providers = ["DmlExecutionProvider", "CPUExecutionProvider"] if "DmlExecutionProvider" in available_providers else ["CPUExecutionProvider"]
    print(f"ONNX Providers: {providers}")
    session = ort.InferenceSession(str(ONNX_MODEL_PATH), providers=providers)

    # 3. Check for existing checkpoint
    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
    ckpt_emb_file = CHECKPOINT_DIR / "ckpt_embeddings.npy"
    ckpt_ids_file = CHECKPOINT_DIR / "ckpt_ids.npy"
    ckpt_meta_file = CHECKPOINT_DIR / "ckpt_meta.json"

    resume_idx = 0
    all_embeddings_list = []
    all_catalog_ids_list = []

    if not args.force_recompute and ckpt_emb_file.exists() and ckpt_ids_file.exists() and ckpt_meta_file.exists():
        try:
            with open(ckpt_meta_file, "r", encoding="utf-8") as f:
                meta = json.load(f)
            saved_count = meta.get("count", 0)
            if 0 < saved_count < total_items:
                ckpt_embs = np.load(str(ckpt_emb_file))
                ckpt_ids = np.load(str(ckpt_ids_file))
                all_embeddings_list.append(ckpt_embs)
                all_catalog_ids_list.extend(ckpt_ids.tolist())
                resume_idx = saved_count
                print(f"Resuming from checkpoint at item {resume_idx:,}/{total_items:,} ({(resume_idx/total_items)*100:.1f}%)")
        except Exception as e:
            print(f"Warning: Failed to load checkpoint ({e}). Starting fresh.")
            all_embeddings_list = []
            all_catalog_ids_list = []
            resume_idx = 0

    records = df_mapping.to_dict(orient="records")
    remaining_records = records[resume_idx:]

    print(f"\nProcessing {len(remaining_records):,} items (batch_size={args.batch_size})...")
    start_time = time.time()
    last_ckpt_time = start_time
    last_ckpt_count = resume_idx

    # 4. Batch inference loop with thread pool for image loading
    batch_size = args.batch_size
    with ThreadPoolExecutor(max_workers=6) as executor:
        for i in range(0, len(remaining_records), batch_size):
            chunk = remaining_records[i : i + batch_size]
            paths = [IMAGES_DIR / r["filename"] for r in chunk]
            cids = [int(r["catalog_item_id"]) for r in chunk]

            # Parallel preprocessing of batch
            tensors = list(executor.map(preprocess_image, paths))
            batch_array = np.stack(tensors, axis=0)

            # ONNX Inference
            out_embs = session.run(["embedding"], {"image": batch_array})[0]
            # Ensure float32 & exact L2 normalization
            out_embs = out_embs.astype(np.float32)
            norms = np.linalg.norm(out_embs, axis=-1, keepdims=True)
            out_embs = out_embs / np.maximum(norms, 1e-12)

            all_embeddings_list.append(out_embs)
            all_catalog_ids_list.extend(cids)

            processed = resume_idx + i + len(chunk)
            elapsed = time.time() - start_time
            rate = (processed - resume_idx) / elapsed if elapsed > 0 else 0
            eta_seconds = (total_items - processed) / rate if rate > 0 else 0

            # Progress output
            pct = (processed / total_items) * 100
            print(
                f"\r  [{processed:5,}/{total_items:5,}] ({pct:5.1f}%) | "
                f"Speed: {rate:5.1f} img/s | ETA: {eta_seconds/60:4.1f} min",
                end="",
                flush=True
            )

            # Periodic Checkpoint
            if (processed - last_ckpt_count >= args.checkpoint_every) or (processed == total_items):
                print(f"\n  >>> Checkpoint reached at {processed:,} items. Saving snapshot...", flush=True)
                temp_embs = np.concatenate(all_embeddings_list, axis=0)
                temp_ids = np.array(all_catalog_ids_list, dtype=np.int64)
                np.save(str(ckpt_emb_file), temp_embs)
                np.save(str(ckpt_ids_file), temp_ids)
                with open(ckpt_meta_file, "w", encoding="utf-8") as f:
                    json.dump({"count": processed, "timestamp": time.time()}, f)
                last_ckpt_count = processed

    # 5. Final Concatenation & Validation
    print("\n\nFinalizing embeddings array...")
    final_embeddings = np.concatenate(all_embeddings_list, axis=0).astype(np.float32)
    final_catalog_ids = np.array(all_catalog_ids_list, dtype=np.int64)

    assert len(final_embeddings) == total_items, f"Count mismatch: {len(final_embeddings)} != {total_items}"
    assert len(final_catalog_ids) == total_items, f"IDs mismatch: {len(final_catalog_ids)} != {total_items}"
    assert np.all(np.isfinite(final_embeddings)), "FATAL: Non-finite values detected!"
    assert final_embeddings.shape[1] == 512, f"Dimension mismatch: expected 512, got {final_embeddings.shape[1]}"

    # 6. Save final embedding artifacts across all active locations
    OUTPUT_EMBEDDINGS_DIR.mkdir(parents=True, exist_ok=True)
    VISION_44K_DIR.mkdir(parents=True, exist_ok=True)
    LEGACY_DIR.mkdir(parents=True, exist_ok=True)

    destinations = [
        (OUTPUT_EMBEDDINGS_DIR / "clip_embeddings.npy", OUTPUT_EMBEDDINGS_DIR / "clip_catalog_ids.npy"),
        (VISION_44K_DIR / "clip_embeddings.npy", VISION_44K_DIR / "clip_catalog_ids.npy"),
        (LEGACY_DIR / "catalog_embeddings.npy", LEGACY_DIR / "product_ids.npy"),
    ]

    for emb_dst, ids_dst in destinations:
        np.save(str(emb_dst), final_embeddings)
        np.save(str(ids_dst), final_catalog_ids)
        print(f"  + Saved embeddings to: {emb_dst.relative_to(PROJECT_ROOT)}")
        print(f"  + Saved catalog IDs to: {ids_dst.relative_to(PROJECT_ROOT)}")

    # 7. Rebuild FAISS index (IndexIDMap2 wrapping IndexFlatIP)
    print("\nRebuilding FAISS IndexFlatIP index wrapped with IndexIDMap2...")
    dim = 512
    base_index = faiss.IndexFlatIP(dim)
    index = faiss.IndexIDMap2(base_index)

    vectors_contiguous = np.ascontiguousarray(final_embeddings)
    ids_contiguous = np.ascontiguousarray(final_catalog_ids)

    index.add_with_ids(vectors_contiguous, ids_contiguous)
    print(f"  + Added {index.ntotal:,} vectors into FAISS index.")

    index_destinations = [
        OUTPUT_FAISS_DIR / "clip.index",
        VISION_44K_DIR / "clip.index",
        LEGACY_DIR / "catalog.index",
    ]

    for idx_dst in index_destinations:
        idx_dst.parent.mkdir(parents=True, exist_ok=True)
        faiss.write_index(index, str(idx_dst))
        print(f"  + Saved FAISS index to: {idx_dst.relative_to(PROJECT_ROOT)}")

    # Clean up checkpoint files
    if ckpt_emb_file.exists():
        ckpt_emb_file.unlink()
    if ckpt_ids_file.exists():
        ckpt_ids_file.unlink()
    if ckpt_meta_file.exists():
        ckpt_meta_file.unlink()

    total_elapsed = time.time() - start_time
    print("\n" + "=" * 70)
    print(f"STAGE 3 COMPLETE in {total_elapsed/60:.2f} minutes.")
    print(f"Total Vectors Indexed: {index.ntotal:,}")
    print(f"Vector Dimensionality: {index.d}")
    print("=" * 70)


if __name__ == "__main__":
    main()
