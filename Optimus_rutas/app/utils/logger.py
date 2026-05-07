"""Logging estructurado con formato JSON-friendly."""

import logging
import sys
from typing import Optional

from app.utils.config import get_settings


_configured = False


def setup_logging() -> None:
    """Configura logging global. Idempotente."""
    global _configured
    if _configured:
        return

    settings = get_settings()
    level = getattr(logging, settings.log_level, logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)

    # Reducir ruido de librerías
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

    _configured = True


def get_logger(name: Optional[str] = None) -> logging.Logger:
    setup_logging()
    return logging.getLogger(name or "app")
