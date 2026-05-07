"""Health check y configuración pública."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.controllers.dependencies import settings_dep
from app.models.schemas import ConfigResponse, HealthResponse
from app.utils.config import Settings

router = APIRouter(prefix="/api", tags=["meta"])


@router.get("/health", response_model=HealthResponse, summary="Health check")
async def health(settings: Settings = Depends(settings_dep)) -> HealthResponse:
    return HealthResponse(status="ok", app=settings.app_name, env=settings.app_env)


@router.get(
    "/config",
    response_model=ConfigResponse,
    summary="Configuración pública para el frontend",
)
async def config(settings: Settings = Depends(settings_dep)) -> ConfigResponse:
    """Devuelve solo valores seguros para exponer en el cliente.

    El token de Mapbox debe ser 'pk.*' (público). En producción, restringir
    en el dashboard de Mapbox a los dominios autorizados.
    """
    return ConfigResponse(
        mapbox_public_token=settings.effective_public_token,
        proximity_lng=settings.mapbox_proximity_lng,
        proximity_lat=settings.mapbox_proximity_lat,
        quebec_bbox={
            "lat_min": settings.quebec_lat_min,
            "lat_max": settings.quebec_lat_max,
            "lng_min": settings.quebec_lng_min,
            "lng_max": settings.quebec_lng_max,
        },
    )
