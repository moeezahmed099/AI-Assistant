# API Contracts — RAG Module (Faizan)

## Overview

The RAG module receives a reference to Vision-extracted data (not the raw data itself) via `pipeline_run_id` + `extracted_data_id`, reads it from the shared Postgres database, converts it into retrievable context, and returns a grounded summary or answer with citations.

**The core retrieval engine (Qdrant, MiniLM embeddings, BM25 hybrid search, Gemini generation, no-match gate, hallucination check) is unchanged from the Week 1–3 Lumis implementation.** This contract only adds an adapter layer on top.

---

## Endpoint

## Request

```json
{
  "pipeline_run_id": "string (UUID)",
  "extracted_data_id": "string (UUID)",
  "question": "string | null"
}
```

- `pipeline_run_id` — shared identifier for this end-to-end pipeline run, used across all three modules.
- `extracted_data_id` — foreign key into Vision's `extracted_data` table.
- `question` — optional. If omitted, RAG runs in **summarization mode** (summarizes the full Vision record). If provided, RAG runs in **Q&A mode** (answers the specific question grounded in the Vision record + any other documents in the knowledge base).

## Response

```json
{
  "pipeline_run_id": "string",
  "rag_document_id": "string",
  "summary": "string",
  "citations": [
    {
      "source_type": "catalog_item | document",
      "source": "string",
      "page_number": "integer | null",
      "product_id": "string | null",
      "image_url": "string | null"
    }
  ],
  "grounded": true,
  "groundedness_score": 0.85,
  "status": "completed | failed | insufficient_data | llm_unavailable"
}
```

---

## Vision → RAG Context Conversion

Vision's structured output (`product_id`, `category`, `colour`, `similarity_score`, `image_url`, etc.) is converted into a plain-text paragraph before entering the existing chunk/embed/retrieve pipeline — it is treated exactly like a document chunk. No changes to the retrieval algorithm are required.

Example conversion:

**Vision output:**
```json
{
  "product_id": "SKU-4471",
  "category": "Outerwear",
  "colour": "Blue",
  "similarity_score": 0.89,
  "image_url": "https://.../4471.jpg"
}
```

**Converted context (fed into existing pipeline as a single chunk):**