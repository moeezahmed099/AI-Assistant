from typing import Dict


def vision_to_context(vision_data: Dict) -> str:
    """
    Converts Vision module's structured output into a plain-text
    paragraph, treated as a single document chunk by the existing
    RAG pipeline. No changes to retrieval/embedding logic needed.

    vision_data is a raw row from the extracted_data table:
    {
        "id": ...,
        "pipeline_run_id": ...,
        "asset_id": ...,
        "module": ...,
        "data_type": ...,
        "content": { ... actual product fields live here ... },
        "model": ...,
        "confidence": ...,
        "created_at": ...
    }
    """

    if not vision_data:
        return ""

    # The real product/match fields are nested inside "content" (jsonb),
    # not at the top level of the extracted_data row.
    content = vision_data.get("content") or {}

    parts = []

    product_id = content.get("product_id")
    if product_id:
        parts.append(f"Product {product_id}.")

    product_name = content.get("product_name")
    if product_name:
        parts.append(f"Name: {product_name}.")

    category = content.get("category")
    if category:
        parts.append(f"Category: {category}.")

    article_type = content.get("article_type")
    if article_type:
        parts.append(f"Article type: {article_type}.")

    # Vision's contract uses "base_colour" (see docs/api-contracts.md);
    # fall back to "colour" too in case an older shape is passed in.
    colour = content.get("base_colour") or content.get("colour")
    if colour:
        parts.append(f"Colour: {colour}.")

    similarity_score = content.get("similarity_score")
    if similarity_score is not None:
        parts.append(f"Visual match confidence: {similarity_score}.")

    return " ".join(parts)


def build_vision_citation(vision_data: Dict) -> Dict:
    """
    Builds a citation object for a Vision-sourced item, matching
    the 'catalog_item' shape defined in docs/api-contracts.md.
    """

    content = vision_data.get("content") or {}

    return {
        "source_type": "catalog_item",
        "source": content.get("product_id", "Unknown product"),
        "page_number": None,
        "product_id": content.get("product_id"),
        "image_url": content.get("image_url"),
    }