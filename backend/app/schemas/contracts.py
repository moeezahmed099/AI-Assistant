from enum import Enum
from typing import Any, List
from pydantic import BaseModel, Field


class AgentDecision(str, Enum):
    generate_report = "generate_report"
    search_more_context = "search_more_context"
    needs_review = "needs_review"
    flag_incomplete = "flag_incomplete"


class AgentRunRequest(BaseModel):
    pipeline_run_id: str


class AgentRunResponse(BaseModel):
    pipeline_run_id: str
    agent_run_id: str
    status: str
    decision: AgentDecision
    reason: str
    actions: list[dict] = Field(default_factory=list)
