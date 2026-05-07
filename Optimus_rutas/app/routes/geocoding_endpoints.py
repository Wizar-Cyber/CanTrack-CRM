"""Endpoint para geocodificar una dirección suelta."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.controllers.dependencies import geocoding_service
from app.models.schemas import GeocodeRequest, GeocodeResponse
from app.services.geocoding_service import GeocodingService

router = APIRouter(prefix="/api/geocode", tags=["geocoding"])


@router.post(
    "",
    response_model=GeocodeResponse,
    summary="Geocodificar una dirección (validación previa)",
)
async def geocode(
    payload: GeocodeRequest,
    service: GeocodingService = Depends(geocoding_service),
) -> GeocodeResponse:
    """Devuelve `status` ∈ ok | ambiguous | out_of_region | not_found.

    No lanza excepciones para casos esperados: el frontend muestra feedback
    según el campo `status`.
    """
    return await service.geocode(payload.address)
