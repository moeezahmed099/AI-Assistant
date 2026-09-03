import sys
from pathlib import Path

# Add project root and backend paths to sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[4]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

BACKEND_DIR = Path(__file__).resolve().parents[3]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

MODULE_DIR = Path(__file__).resolve().parent
if str(MODULE_DIR) not in sys.path:
    sys.path.insert(0, str(MODULE_DIR))

try:
    from backend.app.schemas.contracts import AgentDecision
    from backend.app.modules.agent.adapter import apply_decision_rules
except ImportError:
    try:
        from app.schemas.contracts import AgentDecision
        from app.modules.agent.adapter import apply_decision_rules
    except ImportError:
        from schemas.contracts import AgentDecision
        from adapter import apply_decision_rules


def test_decision_rules():
    test_cases = [
        {
            "name": "Case 1: Complete confident vision + grounded rag -> expect generate_report",
            "vision": {
                "confidence": 0.95,
                "similarity_score": 0.95,
                "is_confident": True,
                "matched_part": "P-10023",
            },
            "rag": {
                "grounded": True,
                "complete": True,
                "citation_count": 4,
                "citations": ["doc_a.pdf", "doc_b.pdf"],
            },
            "expected": AgentDecision.generate_report,
        },
        {
            "name": "Case 2: Complete vision + rag present but grounded=False -> expect search_more_context",
            "vision": {
                "confidence": 0.92,
                "similarity_score": 0.92,
                "is_confident": True,
            },
            "rag": {
                "grounded": False,
                "complete": True,
                "citations": [],
            },
            "expected": AgentDecision.search_more_context,
        },
        {
            "name": "Case 3: Weak/low similarity vision -> expect needs_review",
            "vision": {
                "confidence": 0.45,
                "similarity_score": 0.45,
                "is_confident": False,
            },
            "rag": {
                "grounded": True,
                "complete": True,
                "citations": ["doc_a.pdf"],
            },
            "expected": AgentDecision.needs_review,
        },
        {
            "name": "Case 4: Missing rag data (None) -> expect flag_incomplete",
            "vision": {
                "confidence": 0.95,
                "similarity_score": 0.95,
                "is_confident": True,
            },
            "rag": None,
            "expected": AgentDecision.flag_incomplete,
        },
    ]

    all_passed = True
    print("=" * 70)
    print("TEST SUITE: Agent Decision Rules (backend/app/modules/agent/test_adapter.py)")
    print("=" * 70)

    for idx, tc in enumerate(test_cases, 1):
        decision, reason = apply_decision_rules(tc["vision"], tc["rag"])
        passed = decision == tc["expected"]
        status_label = "PASS" if passed else "FAIL"
        if not passed:
            all_passed = False

        print(f"[{status_label}] {tc['name']}")
        print(f"       Computed Decision : {decision.value}")
        print(f"       Expected Decision : {tc['expected'].value}")
        print(f"       Reason            : {reason}")
        print("-" * 70)

    if all_passed:
        print("RESULT: ALL 4 TESTS PASSED")
        return 0
    else:
        print("RESULT: SOME TESTS FAILED")
        return 1


if __name__ == "__main__":
    exit_code = test_decision_rules()
    sys.exit(exit_code)
