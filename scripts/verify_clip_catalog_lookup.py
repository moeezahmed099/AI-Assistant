"""Exercise CLIPSearchService's FAISS-to-Supabase lookup for a committed image.

This narrow verification fixture is used only when the local OpenCLIP runtime is
not installed. It passes Muneeb's committed ``15025.jpg`` to
``CLIPSearchService.search`` and supplies that image's stored CLIP vector from
the committed FAISS IndexIDMap2. This validates the exact path that previously
failed: FAISS IDs -> ``fetch_catalog_items_by_ids`` -> shared Supabase rows.
"""

from __future__ import annotations

from io import BytesIO
import json
from pathlib import Path
import subprocess
import sys
import types

import faiss
from PIL import Image


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_REVISION = "f9cfbe16ef5f5bdaaeaecb7b7e91036d005e9be7"
SAMPLE_IMAGE_PATH = "data/catalog/images/15025.jpg"
SAMPLE_CATALOG_ID = 2301


class KnownCatalogEmbeddingService:
    """Returns the persisted CLIP embedding for the checked committed image."""

    def __init__(self, fixture_index: faiss.Index) -> None:
        self.fixture_index = fixture_index

    def generate_image_embedding(self, query_image: Image.Image):
        if not isinstance(query_image, Image.Image) or query_image.mode != "RGB":
            raise AssertionError("Expected committed sample image as an RGB PIL image.")
        return self.fixture_index.reconstruct(SAMPLE_CATALOG_ID)


def main() -> None:
    # clip_search_service normally imports OpenCLIP's EmbeddingService eagerly.
    # The test injects the fixture before that import; only the service's normal
    # search, FAISS, and database-lookup code is under test here.
    embedding_module = types.ModuleType("app.services.embedding_service")
    embedding_module.EmbeddingService = KnownCatalogEmbeddingService
    sys.modules["app.services.embedding_service"] = embedding_module

    from backend.app.gateway.database import DATABASE_URL
    from app.services.clip_search_service import CLIPSearchService

    image_bytes = subprocess.check_output(
        ["git", "show", f"{SOURCE_REVISION}:{SAMPLE_IMAGE_PATH}"],
        cwd=PROJECT_ROOT,
    )
    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    index_path = PROJECT_ROOT / "data" / "embeddings" / "clip_vit_b32" / "catalog.index"
    fixture_index = faiss.read_index(str(index_path))

    service = CLIPSearchService(
        index_path=index_path,
        database_url=DATABASE_URL,
        embedding_service=KnownCatalogEmbeddingService(fixture_index),
    )
    results = service.search(image, top_k=5)
    print(json.dumps({
        "sample_image": SAMPLE_IMAGE_PATH,
        "sample_image_size": list(image.size),
        "top_k": 5,
        "result_count": len(results),
        "results": results,
    }, indent=2))


if __name__ == "__main__":
    main()
