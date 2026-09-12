"""Build-time download script for FAISS index deployment on Render."""

import os
import sys
import urllib.request
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
INDEX_DIR = PROJECT_ROOT / "artifacts" / "faiss"
INDEX_FILE = INDEX_DIR / "clip.index"

# Default public GitHub Release asset URL for moeezahmed099/AI-Assistant
DEFAULT_INDEX_URL = (
    "https://github.com/moeezahmed099/AI-Assistant/releases/download/v1.0-artifacts/clip.index"
)
FAISS_INDEX_URL = os.getenv("FAISS_INDEX_URL", DEFAULT_INDEX_URL)


def download_faiss_index() -> None:
    if INDEX_FILE.exists() and INDEX_FILE.stat().st_size > 0:
        size_mb = INDEX_FILE.stat().st_size / (1024 * 1024)
        print(f"[download_faiss] Index already exists at {INDEX_FILE} ({size_mb:.2f} MB). Skipping download.")
        return

    if not FAISS_INDEX_URL:
        print(
            "[download_faiss] ERROR: artifacts/faiss/clip.index is missing and FAISS_INDEX_URL is not set.\n"
            "Please set FAISS_INDEX_URL in your Render environment variables pointing to the public index asset.",
            file=sys.stderr,
        )
        sys.exit(1)

    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    print(f"[download_faiss] Downloading FAISS index from:\n  {FAISS_INDEX_URL}\nTarget:\n  {INDEX_FILE}...")

    request = urllib.request.Request(
        FAISS_INDEX_URL,
        headers={"User-Agent": "Mozilla/5.0 (AI-Assistant Index Downloader)"},
    )

    temp_file = INDEX_FILE.with_suffix(".tmp")
    try:
        with urllib.request.urlopen(request) as response, open(temp_file, "wb") as out_file:
            total_size = response.getheader("Content-Length")
            total_size = int(total_size) if total_size and total_size.isdigit() else 0
            downloaded = 0
            chunk_size = 1024 * 1024  # 1 MB chunks

            while True:
                chunk = response.read(chunk_size)
                if not chunk:
                    break
                out_file.write(chunk)
                downloaded += len(chunk)
                if total_size > 0:
                    pct = (downloaded / total_size) * 100
                    print(
                        f"\r[download_faiss] Progress: {downloaded / (1024*1024):.1f} MB / {total_size / (1024*1024):.1f} MB ({pct:.1f}%)",
                        end="",
                        flush=True,
                    )
                else:
                    print(
                        f"\r[download_faiss] Progress: {downloaded / (1024*1024):.1f} MB downloaded",
                        end="",
                        flush=True,
                    )
            print()

        # Atomic swap once download completes
        temp_file.replace(INDEX_FILE)
        final_size_mb = INDEX_FILE.stat().st_size / (1024 * 1024)
        print(f"[download_faiss] Successfully downloaded and saved clip.index ({final_size_mb:.2f} MB).")

    except Exception as exc:
        if temp_file.exists():
            temp_file.unlink()
        print(f"\n[download_faiss] Download failed: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    download_faiss_index()
