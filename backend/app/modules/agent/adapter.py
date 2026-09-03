import logging
import sys
import uuid
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

# Ensure backend/app/modules/agent/backend is on sys.path to resolve existing agent orchestrator modules
AGENT_BACKEND_DIR = Path(__file__).resolve().parent / "backend"
if str(AGENT_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(AGENT_BACKEND_DIR))

# Ensure root paths are available for schema contracts
PROJECT_ROOT = Path(__file__).resolve().parents[4]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

BACKEND_DIR = Path(__file__).resolve().parents[3]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

try:
    from backend.app.schemas.contracts import AgentDecision, AgentRunResponse
except ImportError:
    try:
        from app.schemas.contracts import AgentDecision, AgentRunResponse
    except ImportError:
        from schemas.contracts import AgentDecision, AgentRunResponse

# Locate and import existing agent orchestrator logic (without modifying its internals)
try:
    from agent.orchestrator import run_agent as orchestrator_run_agent, synthesize_report
    import models as agent_models
except ImportError:
    try:
        from backend.app.modules.agent.backend.agent.orchestrator import (
            run_agent as orchestrator_run_agent,
            synthesize_report,
        )
        from backend.app.modules.agent.backend import models as agent_models
    except ImportError:
        orchestrator_run_agent = None
        synthesize_report = None
        agent_models = None

logger = logging.getLogger(__name__)

# Minimum similarity/confidence threshold for a confident Vision match
VISION_CONFIDENCE_THRESHOLD = 0.70


def get_vision_result(pipeline_run_id: str) -> Optional[dict]:
    """
    Fetch Vision module output/state from shared DB for given pipeline_run_id.

    TODO: Query shared database (e.g. vision_runs / pipeline_state table) to retrieve
          the vision analysis results, match confidence, and similarity scores.
    """
    logger.info(f"Fetching vision result for pipeline_run_id: {pipeline_run_id}")
    # STUB: Returns None for now until shared DB repository is wired
    return None


def get_rag_result(pipeline_run_id: str) -> Optional[dict]:
    """
    Fetch RAG module output/state from shared DB for given pipeline_run_id.

    TODO: Query shared database (e.g. rag_runs / pipeline_state table) to retrieve
          the retrieved context chunks, groundedness flag, and citations.
    """
    logger.info(f"Fetching RAG result for pipeline_run_id: {pipeline_run_id}")
    # STUB: Returns None for now until shared DB repository is wired
    return None


def is_vision_confident(vision_data: dict) -> bool:
    """Helper to check if Vision match meets confidence criteria."""
    if vision_data.get("is_confident") is False:
        return False
    if vision_data.get("weak_match") is True:
        return False
    if "similarity_score" in vision_data and vision_data["similarity_score"] < VISION_CONFIDENCE_THRESHOLD:
        return False
    if "confidence" in vision_data and vision_data["confidence"] < VISION_CONFIDENCE_THRESHOLD:
        return False
    if "similarity" in vision_data and vision_data["similarity"] < VISION_CONFIDENCE_THRESHOLD:
        return False
    return True


def is_rag_grounded_and_complete(rag_data: dict) -> bool:
    """Helper to check if RAG context is grounded and sufficiently cited/complete."""
    if rag_data.get("grounded") is False or rag_data.get("is_grounded") is False:
        return False
    if rag_data.get("complete") is False or rag_data.get("is_complete") is False:
        return False
    if rag_data.get("thin_citations") is True:
        return False
    if "citations" in rag_data and len(rag_data["citations"]) == 0 and rag_data.get("requires_citations", False):
        return False
    return True


def apply_decision_rules(
    vision_data: Optional[dict],
    rag_data: Optional[dict],
) -> Tuple[AgentDecision, str]:
    """
    Apply decision rules mapping Vision & RAG state to AgentDecision:
    - Vision or RAG state missing entirely -> flag_incomplete
    - Vision match weak/below similarity threshold -> needs_review
    - Confident Vision match + RAG present but not grounded / thin citations -> search_more_context
    - Confident Vision match + RAG grounded, complete -> generate_report
    """
    # 1. State missing entirely
    if vision_data is None or rag_data is None:
        return (
            AgentDecision.flag_incomplete,
            "Vision or RAG state missing entirely.",
        )

    # 2. Vision match weak / below similarity threshold
    if not is_vision_confident(vision_data):
        return (
            AgentDecision.needs_review,
            "Vision match weak or below similarity threshold.",
        )

    # 3. Confident Vision match + RAG present but not grounded / thin citations
    if not is_rag_grounded_and_complete(rag_data):
        return (
            AgentDecision.search_more_context,
            "Confident Vision match, but RAG context is not grounded or has thin citations.",
        )

    # 4. Confident Vision match + RAG grounded, complete
    return (
        AgentDecision.generate_report,
        "Confident Vision match and RAG retrieved context is grounded and complete.",
    )


async def run_agent(pipeline_run_id: str) -> AgentRunResponse:
    """
    Main Agent execution adapter:
    1. Fetches Vision and RAG state for pipeline_run_id.
    2. Flags incomplete if either is missing.
    3. Applies decision rules.
    4. Calls existing orchestrator for reasoning/report generation if appropriate.
    5. Returns unified AgentRunResponse.
    """
    agent_run_id = f"agent-run-{uuid.uuid4()}"
    actions: list[dict] = []

    # 1. Fetch upstream module outputs from shared DB
    vision_data = get_vision_result(pipeline_run_id)
    rag_data = get_rag_result(pipeline_run_id)

    # 2. Apply Decision Rules
    decision, reason = apply_decision_rules(vision_data, rag_data)

    actions.append({
        "action_type": "decision_rule_evaluation",
        "payload": {
            "pipeline_run_id": pipeline_run_id,
            "decision": decision.value,
            "reason": reason,
            "has_vision_data": vision_data is not None,
            "has_rag_data": rag_data is not None,
        },
    })

    # 3. Handle flag_incomplete
    if decision == AgentDecision.flag_incomplete:
        return AgentRunResponse(
            pipeline_run_id=pipeline_run_id,
            agent_run_id=agent_run_id,
            status="flagged_incomplete",
            decision=decision,
            reason=reason,
            actions=actions,
        )

    # 4. Handle needs_review
    if decision == AgentDecision.needs_review:
        return AgentRunResponse(
            pipeline_run_id=pipeline_run_id,
            agent_run_id=agent_run_id,
            status="pending_review",
            decision=decision,
            reason=reason,
            actions=actions,
        )

    # 5. Handle search_more_context
    if decision == AgentDecision.search_more_context:
        # TODO: Call existing orchestrator / web_search_tool to gather missing citations / context
        actions.append({
            "action_type": "search_more_context_dispatched",
            "payload": {
                "pipeline_run_id": pipeline_run_id,
                "status": "search_dispatched",
            },
        })
        return AgentRunResponse(
            pipeline_run_id=pipeline_run_id,
            agent_run_id=agent_run_id,
            status="in_progress",
            decision=decision,
            reason=reason,
            actions=actions,
        )

    # 6. Handle generate_report: invoke existing orchestrator logic
    # TODO: Connect shared database session to orchestrator_run_agent / synthesize_report
    if orchestrator_run_agent is not None:
        actions.append({
            "action_type": "orchestrator_invoked",
            "payload": {
                "module": "backend.app.modules.agent.backend.agent.orchestrator",
                "status": "report_generation_ready",
            },
        })

    return AgentRunResponse(
        pipeline_run_id=pipeline_run_id,
        agent_run_id=agent_run_id,
        status="completed",
        decision=decision,
        reason=reason,
        actions=actions,
    )
