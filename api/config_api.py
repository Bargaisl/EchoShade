from fastapi import APIRouter
from core.config import settings

router = APIRouter()

@router.get("/api/config")
async def get_config():
    """
    Returns frontend configuration values including DEV_MODE.
    This allows JavaScript to access centralized config values.
    """
    return {
        "DEV_MODE": settings.DEV_MODE,
        "LOG_LEVEL": settings.LOG_LEVEL
    } 