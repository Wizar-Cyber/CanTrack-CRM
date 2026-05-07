"""Dependencias compartidas para FastAPI.

Centraliza la inyección: sesión DB, HTTP client, settings, y constructores
de servicios. Los endpoints usan `Depends(...)` sobre estas funciones.
"""

from __future__ import annotations

from typing import AsyncIterator

import httpx
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.geocoding_cache_repository import GeocodingCacheRepository
from app.repositories.route_repository import RouteRepository
from app.services.distance_calculator import DistanceCalculator, HaversineCalculator
from app.services.geocoding_service import GeocodingService
from app.services.route_optimizer import RouteOptimizer
from app.services.route_service import RouteService
from app.utils.config import Settings, get_settings
from app.utils.database import get_session

# ----------------------------- HTTP client global --------------------------- #

_http_client: httpx.AsyncClient | None = None


async def startup_http_client() -> None:
    global _http_client
    _http_client = httpx.AsyncClient()


async def shutdown_http_client() -> None:
    global _http_client
    if _http_client is not None:
        await _http_client.aclose()
        _http_client = None


def get_http_client() -> httpx.AsyncClient:
    if _http_client is None:
        raise RuntimeError("HTTP client no inicializado. Asegúrate de usar el lifespan.")
    return _http_client


# Permitir override en tests:
async def _http_client_dep() -> AsyncIterator[httpx.AsyncClient]:
    yield get_http_client()


# ----------------------------- Settings DI ---------------------------------- #


def settings_dep() -> Settings:
    return get_settings()


# ----------------------------- Repos ---------------------------------------- #


def route_repository(session: AsyncSession = Depends(get_session)) -> RouteRepository:
    return RouteRepository(session)


def geocoding_cache_repository(
    session: AsyncSession = Depends(get_session),
) -> GeocodingCacheRepository:
    return GeocodingCacheRepository(session)


# ----------------------------- Services ------------------------------------- #


def distance_calculator() -> DistanceCalculator:
    # Punto de extensión: cambiar por OSRMCalculator() en el futuro.
    return HaversineCalculator()


def route_optimizer(
    distance: DistanceCalculator = Depends(distance_calculator),
) -> RouteOptimizer:
    return RouteOptimizer(distance)


def geocoding_service(
    cache: GeocodingCacheRepository = Depends(geocoding_cache_repository),
    http: httpx.AsyncClient = Depends(_http_client_dep),
    settings: Settings = Depends(settings_dep),
) -> GeocodingService:
    return GeocodingService(cache, http, settings)


def route_service(
    repo: RouteRepository = Depends(route_repository),
    geocoding: GeocodingService = Depends(geocoding_service),
    optimizer: RouteOptimizer = Depends(route_optimizer),
    settings: Settings = Depends(settings_dep),
) -> RouteService:
    return RouteService(repo, geocoding, optimizer, settings)
