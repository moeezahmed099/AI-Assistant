from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.modules.rag.adapter import vision_to_context, build_vision_citation
from app.modules.rag.writes import (
    insert_rag_document,
    insert_chat_history,
    insert_module_event,
    fetch_extracted_data,
    update_pipeline_status,
)
from app.services.rag import ask_rag
from app.llm.gemini import generate_answer
from app.services.hallucination_check import check_groundedness


router = APIRouter(prefix="/api/v1/rag", tags=["rag"])


# ======================================================================
# ORIGINAL STANDALONE ENDPOINT — unchanged behaviour from the solo
# Lumis project. Kept working alongside the integration endpoint below,
# per team agreement: each module's standalone capability stays
# accessible through the unified app, not just the merged pipeline.
# ======================================================================

class ChatRequest(BaseModel):
    question: str
    history: Optional[list] = None


@router.post("/chat")
def chat(request: ChatRequest):
    result = ask_rag(request.question, history=request.history or [])
    return result


# ======================================================================
# INTEGRATION ENDPOINT — consumes Vision's extracted_data, runs RAG,
# writes to the shared rag_documents / chat_history / module_events
# tables, and updates pipeline_runs.status so the gateway can detect
# completion.
#
# FIX: this endpoint previously converted Vision's match into
# `context_text` via vision_to_context(), then IGNORED it and instead
# called ask_rag() — which vector-searches the uploaded-document
# knowledge base in Qdrant. Vision's catalog match has nothing to do
# with that knowledge base, so the search almost always missed and
# fell back to "I couldn't find that information...", regardless of
# how confident the Vision match was.
#
# Now the Vision-derived context_text is used directly to generate a
# grounded answer (generate_answer + check_groundedness — the same
# calls ask_rag() makes internally), instead of routing through the
# document-only retrieval pipeline.
# ======================================================================

class RagProcessRequest(BaseModel):
    pipeline_run_id: str
    extracted_data_id: str
    question: Optional[str] = None


@router.post("/process")
def process(request: RagProcessRequest):

    insert_module_event(
        request.pipeline_run_id,
        "rag_started",
        {"extracted_data_id": request.extracted_data_id},
    )

    # ----------------------------------------------------
    # 1. Fetch Vision data from shared DB
    # ----------------------------------------------------

    vision_data = fetch_extracted_data(request.extracted_data_id)

    if vision_data is None:
        insert_module_event(request.pipeline_run_id, "rag_failed", {"reason": "not_found"})
        raise HTTPException(status_code=404, detail="extracted_data_id not found")

    # ----------------------------------------------------
    # 2. Convert Vision data to RAG context
    # ----------------------------------------------------

    context_text = vision_to_context(vision_data)

    if not context_text.strip():
        insert_module_event(request.pipeline_run_id, "rag_failed", {"reason": "insufficient_data"})

        rag_document_id = insert_rag_document(
            pipeline_run_id=request.pipeline_run_id,
            extracted_data_id=request.extracted_data_id,
            summary="",
            citations=[],
            grounded=False,
            groundedness_score=None,
            status="insufficient_data",
        )

        return {
            "pipeline_run_id": request.pipeline_run_id,
            "rag_document_id": rag_document_id,
            "summary": "",
            "citations": [],
            "grounded": False,
            "groundedness_score": None,
            "status": "insufficient_data",
        }

    # ----------------------------------------------------
    # 3. Generate an answer grounded in Vision's context directly
    #    (NOT via ask_rag — that searches the document knowledge
    #    base, which has nothing to do with the Vision catalog match)
    # ----------------------------------------------------

    question = request.question or "Summarize this product record."

    if request.question:
        insert_chat_history(request.pipeline_run_id, "user", request.question)

    try:
        answer = generate_answer(question, context_text)
        groundedness = check_groundedness(answer, context_text)
    except Exception as error:
        insert_module_event(
            request.pipeline_run_id,
            "rag_failed",
            {"reason": "llm_unavailable", "error": str(error)},
        )

        rag_document_id = insert_rag_document(
            pipeline_run_id=request.pipeline_run_id,
            extracted_data_id=request.extracted_data_id,
            summary="",
            citations=[],
            grounded=False,
            groundedness_score=None,
            status="llm_unavailable",
        )

        return {
            "pipeline_run_id": request.pipeline_run_id,
            "rag_document_id": rag_document_id,
            "summary": "",
            "citations": [],
            "grounded": False,
            "groundedness_score": None,
            "status": "llm_unavailable",
        }

    # ----------------------------------------------------
    # 4. Build citations — grounded in the Vision match
    # ----------------------------------------------------

    citations = [build_vision_citation(vision_data)]

    if groundedness is None:
        grounded = None
        groundedness_score = None
    else:
        grounded = not groundedness.get("flagged", False)
        groundedness_score = groundedness.get("groundedness_score")

    if request.question:
        insert_chat_history(request.pipeline_run_id, "bot", answer)

    # ----------------------------------------------------
    # 5. Persist + respond
    # ----------------------------------------------------

    rag_document_id = insert_rag_document(
        pipeline_run_id=request.pipeline_run_id,
        extracted_data_id=request.extracted_data_id,
        summary=answer,
        citations=citations,
        grounded=grounded,
        groundedness_score=groundedness_score,
        status="completed",
    )

    insert_module_event(
        request.pipeline_run_id,
        "rag_completed",
        {"rag_document_id": rag_document_id, "grounded": grounded},
    )

    update_pipeline_status(request.pipeline_run_id, "rag_complete")

    return {
        "pipeline_run_id": request.pipeline_run_id,
        "rag_document_id": rag_document_id,
        "summary": answer,
        "citations": citations,
        "grounded": grounded,
        "groundedness_score": groundedness_score,
        "status": "completed",
    }