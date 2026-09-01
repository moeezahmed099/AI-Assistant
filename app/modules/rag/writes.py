import json
from app.db.postgres_connection import get_connection


# ----------------------------------------------------------------
# Reads
# ----------------------------------------------------------------

def fetch_extracted_data(extracted_data_id: str):
    """
    Fetch a single row from the Vision module's extracted_data table.
    Returns a dict (RealDictCursor) or None if not found.

    REAL SCHEMA (confirmed via Supabase SQL Editor):
    extracted_data (
        id                uuid primary key,
        pipeline_run_id   uuid,
        asset_id          uuid,
        module            varchar,
        data_type         varchar,
        content           jsonb,
        model             varchar,
        confidence        double precision,
        created_at        timestamptz
    )
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM extracted_data WHERE id = %s;",
                (extracted_data_id,),
            )
            row = cur.fetchone()
            return dict(row) if row else None
    finally:
        conn.close()


# ----------------------------------------------------------------
# Writes
# ----------------------------------------------------------------

def insert_rag_document(
    pipeline_run_id: str,
    extracted_data_id: str,
    summary: str,
    citations: list,
    grounded: bool,
    groundedness_score,
    status: str,
):
    """
    Insert a row into rag_documents and return its generated id.

    REAL SCHEMA (confirmed via Supabase SQL Editor):
    rag_documents (
        id                        uuid primary key,
        pipeline_run_id           uuid,
        source_extracted_data_id  uuid,
        content                   text,
        metadata                  jsonb,
        created_at                timestamptz
    )

    NOTE: this table has no dedicated summary / citations / grounded /
    groundedness_score / status columns. summary is stored in `content`,
    and everything else is packed into `metadata` as JSON.
    """
    metadata = {
        "citations": citations,
        "grounded": grounded,
        "groundedness_score": groundedness_score,
        "status": status,
    }

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO rag_documents (
                    pipeline_run_id,
                    source_extracted_data_id,
                    content,
                    metadata
                )
                VALUES (%s, %s, %s, %s)
                RETURNING id;
                """,
                (
                    pipeline_run_id,
                    extracted_data_id,
                    summary,
                    json.dumps(metadata),
                ),
            )
            new_id = cur.fetchone()["id"]
            conn.commit()
            return new_id
    finally:
        conn.close()


def insert_chat_history(pipeline_run_id: str, role: str, message: str):
    """
    Insert a row into chat_history.

    REAL SCHEMA (confirmed via Supabase SQL Editor):
    chat_history (
        id               uuid primary key,
        pipeline_run_id  uuid,
        role             varchar,
        content          text,   -- NOTE: column is "content", not "message"
        created_at       timestamptz
    )
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO chat_history (pipeline_run_id, role, content)
                VALUES (%s, %s, %s);
                """,
                (pipeline_run_id, role, message),
            )
            conn.commit()
    finally:
        conn.close()


def insert_module_event(pipeline_run_id: str, event: str, payload: dict = None):
    """
    Insert a row into module_events, used by the Agent module / dashboard
    to track pipeline progress.

    REAL SCHEMA (confirmed via Supabase SQL Editor):
    module_events (
        id                uuid primary key,
        pipeline_run_id   uuid,
        module            varchar,   -- which module emitted the event
        event             varchar,   -- NOTE: column is "event", not "event_type"
        message           text,      -- optional human-readable message
        payload           jsonb,
        created_at        timestamptz
    )

    `module` is hardcoded to "rag" since this file only ever emits
    events on behalf of the RAG module.
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO module_events (pipeline_run_id, module, event, payload)
                VALUES (%s, %s, %s, %s);
                """,
                (pipeline_run_id, "rag", event, json.dumps(payload or {})),
            )
            conn.commit()
    finally:
        conn.close()