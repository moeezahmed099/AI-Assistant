"""Seed the shared Supabase ``catalog_items`` table for the legacy CLIP index.

This script is intentionally safe by default: it performs no DDL or DML unless
``--apply`` is supplied.  It pins its source to Muneeb's vision commit that
created both ``selected_products.csv`` and ``manifest_2000.csv``.

The legacy ``scripts/ingest_catalog.py`` read ``manifest_2000.csv`` in file
order, inserted each item, then used the database primary key in the FAISS
IndexIDMap2.  The committed index contains the consecutive IDs 2301..4300;
therefore source row N is inserted with ID 2301 + N.
"""

from __future__ import annotations

import argparse
import csv
import io
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from sqlalchemy import bindparam, text
from psycopg2.extras import execute_values

from backend.app.gateway.database import engine


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_REVISION = "f9cfbe16ef5f5bdaaeaecb7b7e91036d005e9be7"
SOURCE_CSV_PATH = "data/catalog/selected_products.csv"
MANIFEST_PATH = "data/catalog/manifest_2000.csv"
FIRST_CATALOG_ID = 2301
EXPECTED_ROW_COUNT = 2000
LAST_CATALOG_ID = FIRST_CATALOG_ID + EXPECTED_ROW_COUNT - 1


CATALOG_SCHEMA = """
CREATE TABLE IF NOT EXISTS catalog_items (
    id SERIAL PRIMARY KEY,
    image_id INTEGER UNIQUE NOT NULL,
    product_id INTEGER NOT NULL,
    external_id TEXT UNIQUE NOT NULL,
    filename TEXT NOT NULL,
    image_url TEXT,
    relative_path TEXT NOT NULL,
    category TEXT,
    master_category TEXT,
    sub_category TEXT,
    article_type TEXT,
    gender TEXT,
    base_colour TEXT,
    season TEXT,
    year INTEGER,
    usage TEXT,
    product_display_name TEXT,
    -- FAISS owns the active vectors; this nullable compatibility column is
    -- deliberately BYTEA so seeding does not require a privileged pgvector
    -- extension installation on the shared database.
    embedding BYTEA,
    embedding_dimension INTEGER,
    embedding_model TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
)
"""

CATALOG_INDEXES = (
    "CREATE INDEX IF NOT EXISTS idx_cat_image_id ON catalog_items(image_id)",
    "CREATE INDEX IF NOT EXISTS idx_cat_product_id ON catalog_items(product_id)",
    "CREATE INDEX IF NOT EXISTS idx_cat_category ON catalog_items(category)",
)


class SeedError(RuntimeError):
    """Raised when the target database cannot safely receive this seed."""


@dataclass(frozen=True)
class CatalogRow:
    id: int
    image_id: int
    product_id: int
    external_id: str
    filename: str
    image_url: str
    relative_path: str
    category: str
    master_category: str
    sub_category: str
    article_type: str
    gender: str
    base_colour: str
    season: str
    year: int | None
    usage: str
    product_display_name: str

    def as_insert_params(self) -> dict[str, Any]:
        return self.__dict__


def _read_csv_from_git(path: str) -> list[dict[str, str]]:
    """Read the pinned source from the already-fetched Git object database."""
    try:
        completed = subprocess.run(
            ["git", "show", f"{SOURCE_REVISION}:{path}"],
            cwd=PROJECT_ROOT,
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        raise SeedError(
            f"Cannot read {path} from pinned source commit {SOURCE_REVISION}. "
            "Fetch Muneeb's vision branch before running this script."
        ) from exc
    return list(csv.DictReader(io.StringIO(completed.stdout)))


def _as_year(value: str | None) -> int | None:
    try:
        return int(float(value)) if value and value.strip() else None
    except ValueError:
        return None


def load_seed_rows() -> list[CatalogRow]:
    """Load and verify the original selection before assigning FAISS IDs."""
    selected = _read_csv_from_git(SOURCE_CSV_PATH)
    manifest = _read_csv_from_git(MANIFEST_PATH)

    if len(selected) != EXPECTED_ROW_COUNT or len(manifest) != EXPECTED_ROW_COUNT:
        raise SeedError(
            f"Expected {EXPECTED_ROW_COUNT} source rows, got "
            f"selected={len(selected)}, manifest={len(manifest)}."
        )

    selected_ids = [row["id"].strip() for row in selected]
    manifest_ids = [row["product_id"].strip() for row in manifest]
    if selected_ids != manifest_ids:
        raise SeedError(
            "selected_products.csv and manifest_2000.csv are not in the same "
            "product order; refusing to create an unsafe FAISS mapping."
        )
    if len(set(selected_ids)) != EXPECTED_ROW_COUNT:
        raise SeedError("The pinned source has duplicate product IDs.")

    rows: list[CatalogRow] = []
    for offset, source in enumerate(selected):
        product_id = int(source["id"])
        filename = (source.get("image_filename") or f"{product_id}.jpg").strip()
        image_path = (source.get("image_path") or f"images/{filename}").strip()
        article_type = (source.get("articleType") or "").strip()
        master_category = (source.get("masterCategory") or "").strip()
        rows.append(
            CatalogRow(
                id=FIRST_CATALOG_ID + offset,
                image_id=product_id,
                product_id=product_id,
                external_id=str(product_id),
                filename=filename,
                image_url=f"/catalog-images/{filename}",
                # The source path is preserved from the original selected CSV.
                relative_path=image_path,
                category=article_type or master_category,
                master_category=master_category,
                sub_category=(source.get("subCategory") or "").strip(),
                article_type=article_type,
                gender=(source.get("gender") or "").strip(),
                base_colour=(source.get("baseColour") or "").strip(),
                season=(source.get("season") or "").strip(),
                year=_as_year(source.get("year")),
                usage=(source.get("usage") or "").strip(),
                product_display_name=(source.get("productDisplayName") or "").strip(),
            )
        )
    return rows


def _find_conflicts(conn: Any, rows: list[CatalogRow]) -> list[dict[str, Any]]:
    """Return conflicts that would make this explicit-ID insert unsafe."""
    ids = [row.id for row in rows]
    image_ids = [row.image_id for row in rows]
    external_ids = [row.external_id for row in rows]
    lookup = text(
        "SELECT id, image_id, product_id, external_id "
        "FROM catalog_items "
        "WHERE id IN :ids OR image_id IN :image_ids OR external_id IN :external_ids"
    ).bindparams(
        bindparam("ids", expanding=True),
        bindparam("image_ids", expanding=True),
        bindparam("external_ids", expanding=True),
    )
    return [dict(row._mapping) for row in conn.execute(lookup, {
        "ids": ids,
        "image_ids": image_ids,
        "external_ids": external_ids,
    })]


def _validate_existing_rows(existing: Iterable[dict[str, Any]], rows: list[CatalogRow]) -> str:
    """Classify existing target state as empty, complete, or unsafe."""
    existing = list(existing)
    if not existing:
        return "empty"

    expected = {row.id: row for row in rows}
    if len(existing) == EXPECTED_ROW_COUNT and {item["id"] for item in existing} == set(expected):
        for item in existing:
            source = expected[item["id"]]
            if (
                item["image_id"] != source.image_id
                or item["product_id"] != source.product_id
                or str(item["external_id"]) != source.external_id
            ):
                break
        else:
            return "already_seeded"

    examples = existing[:5]
    raise SeedError(
        "catalog_items already contains conflicting IDs or unique values for the "
        f"required 2301..4300 mapping. Examples: {examples}"
    )


def _table_exists(conn: Any) -> bool:
    return conn.execute(text("SELECT to_regclass('public.catalog_items')")).scalar() is not None


def dry_run(rows: list[CatalogRow]) -> None:
    """Read-only preflight; it never creates or changes the database."""
    if engine.dialect.name != "postgresql":
        raise SeedError(f"Shared engine is {engine.dialect.name!r}, not PostgreSQL/Supabase.")
    with engine.connect() as conn:
        if not _table_exists(conn):
            state = "table_absent"
        else:
            state = _validate_existing_rows(_find_conflicts(conn, rows), rows)
    print(
        "DRY RUN PASS: source_rows=2000, expected_ids=2301..4300, "
        f"target_state={state}, writes=0"
    )


def apply(rows: list[CatalogRow]) -> None:
    """Create the schema if absent and atomically seed the exact 2,000 rows."""
    if engine.dialect.name != "postgresql":
        raise SeedError(f"Shared engine is {engine.dialect.name!r}, not PostgreSQL/Supabase.")

    print(
        f"APPLY PLAN: create schema if absent; insert {len(rows)} rows with IDs "
        f"{FIRST_CATALOG_ID}..{LAST_CATALOG_ID}",
        flush=True,
    )
    with engine.begin() as conn:
        # Share-row-exclusive prevents a concurrent writer from taking the ID range.
        print("APPLY: creating catalog_items schema and indexes...", flush=True)
        conn.execute(text(CATALOG_SCHEMA))
        for index_sql in CATALOG_INDEXES:
            conn.execute(text(index_sql))
        conn.execute(text("LOCK TABLE catalog_items IN SHARE ROW EXCLUSIVE MODE"))

        state = _validate_existing_rows(_find_conflicts(conn, rows), rows)
        if state == "already_seeded":
            print("APPLY PASS: mapping was already seeded; no rows inserted.", flush=True)
            return

        print("APPLY: conflict check passed; inserting 2000 explicit-ID rows...", flush=True)
        columns = (
            "id", "image_id", "product_id", "external_id", "filename", "image_url",
            "relative_path", "category", "master_category", "sub_category",
            "article_type", "gender", "base_colour", "season", "year", "usage",
            "product_display_name",
        )
        insert_values = [tuple(row.as_insert_params()[column] for column in columns) for row in rows]
        raw_connection = conn.connection.driver_connection
        with raw_connection.cursor() as cursor:
            # A single VALUES statement avoids 2,000 pooled-network round trips.
            execute_values(
                cursor,
                f"INSERT INTO catalog_items ({', '.join(columns)}) VALUES %s",
                insert_values,
                page_size=EXPECTED_ROW_COUNT,
            )

        seeded = conn.execute(text("""
            SELECT count(*), min(id), max(id)
            FROM catalog_items
            WHERE id BETWEEN :first_id AND :last_id
        """), {"first_id": FIRST_CATALOG_ID, "last_id": LAST_CATALOG_ID}).one()
        if tuple(seeded) != (EXPECTED_ROW_COUNT, FIRST_CATALOG_ID, LAST_CATALOG_ID):
            raise SeedError(f"Post-insert ID range verification failed: {tuple(seeded)}")
        print(
            f"APPLY: verification passed; count={seeded[0]}, min_id={seeded[1]}, max_id={seeded[2]}",
            flush=True,
        )

        # Explicit IDs do not advance SERIAL automatically. Keep future inserts safe.
        conn.execute(text("""
            SELECT setval(
                pg_get_serial_sequence('catalog_items', 'id'),
                (SELECT max(id) FROM catalog_items),
                true
            )
        """))

    print("APPLY PASS: inserted=2000, ids=2301..4300, sequence_synced=true", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Create the table and insert data. Omit for a read-only preflight.",
    )
    args = parser.parse_args()
    rows = load_seed_rows()
    if args.apply:
        apply(rows)
    else:
        dry_run(rows)


if __name__ == "__main__":
    main()
