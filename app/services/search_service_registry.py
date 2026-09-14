"""Singleton registry for shared Visual Product Search services."""

from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from app.services.clip_search_service import CLIPSearchService
    from app.services.resnet_search_service import ResNetSearchService

# Global search service instances (loaded on demand / first search request)
_clip_search_service: Optional["CLIPSearchService"] = None
_resnet_search_service: Optional["ResNetSearchService"] = None


def get_search_service() -> "CLIPSearchService":
    """Retrieve or initialize singleton CLIPSearchService instance on first call."""
    global _clip_search_service
    if _clip_search_service is None:
        from app.services.clip_search_service import CLIPSearchService
        _clip_search_service = CLIPSearchService()
    return _clip_search_service


def get_resnet_search_service() -> "ResNetSearchService":
    """Retrieve or initialize singleton ResNetSearchService instance on first call."""
    global _resnet_search_service
    if _resnet_search_service is None:
        from app.services.resnet_search_service import ResNetSearchService
        _resnet_search_service = ResNetSearchService()
    return _resnet_search_service
