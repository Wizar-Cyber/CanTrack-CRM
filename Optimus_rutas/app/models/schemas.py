"""Schemas Pydantic v2 para validación de I/O HTTP."""

from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.db import RouteStatus, StopStatus

# ----------------------------- Geocoding ------------------------------------ #


class GeocodeRequest(BaseModel):
    address: str = Field(..., min_length=5, max_length=300)


class GeocodeCandidate(BaseModel):
    address: str
    lat: float
    lng: float
    confidence: float
    place_name: Optional[str] = None


class GeocodeResponse(BaseModel):
    """Resultado de geocodificación de una dirección."""

    status: Literal["ok", "ambiguous", "out_of_region", "not_found"]
    address: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    confidence: Optional[float] = None
    candidates: List[GeocodeCandidate] = Field(default_factory=list)


# ------------------------------- Rutas -------------------------------------- #


class CreateRouteRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., min_length=1, max_length=200)
    start_address: str = Field(..., min_length=5, max_length=300)
    stops: List[str] = Field(..., min_length=1)
    return_to_start: bool = False
    average_speed_kmh: float = Field(default=30.0, gt=0, le=200)
    notes: Optional[str] = Field(default=None, max_length=2000)
    user_id: Optional[str] = None  # preparado para multiusuario futuro

    @field_validator("stops")
    @classmethod
    def _stops_non_empty(cls, v: List[str]) -> List[str]:
        cleaned = [s.strip() for s in v if s and s.strip()]
        if not cleaned:
            raise ValueError("at least one stop is required")
        for s in cleaned:
            if len(s) < 5 or len(s) > 300:
                raise ValueError(f"stop address out of length range (5-300): '{s[:30]}...'")
        return cleaned


class StopResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    order: int
    address: str
    lat: float
    lng: float
    label: Optional[str] = None
    distance_from_previous_km: float
    status: StopStatus
    visited_at: Optional[datetime] = None
    notes: Optional[str] = None


class RouteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    status: RouteStatus
    start_address: str
    start_lat: float
    start_lng: float
    return_to_start: bool
    average_speed_kmh: float
    total_distance_km: float
    estimated_time_minutes: float
    current_stop_index: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    stops: List[StopResponse]


class RouteSummary(BaseModel):
    """Versión liviana para listados (sin todas las paradas)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    status: RouteStatus
    start_address: str
    total_distance_km: float
    estimated_time_minutes: float
    stops_count: int
    completed_stops_count: int
    notes: Optional[str] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class PaginatedRoutes(BaseModel):
    items: List[RouteSummary]
    total: int
    limit: int
    offset: int


class UpdateRouteStatusRequest(BaseModel):
    status: RouteStatus
    current_stop_index: Optional[int] = Field(default=None, ge=0)


class UpdateStopRequest(BaseModel):
    status: StopStatus
    notes: Optional[str] = Field(default=None, max_length=1000)


# ----------------------------- Errores -------------------------------------- #


class ErrorResponse(BaseModel):
    code: str
    message: str
    details: dict = Field(default_factory=dict)


# ----------------------------- Health --------------------------------------- #


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    app: str
    env: str


# ----------------------------- Config (público) ----------------------------- #


class ConfigResponse(BaseModel):
    """Configuración pública para el frontend.

    Solo se exponen valores que son seguros en el cliente — el token de Mapbox
    debe ser un 'pk.*' (público); los 'sk.*' (secretos) JAMÁS van aquí.
    """

    mapbox_public_token: str
    proximity_lng: float
    proximity_lat: float
    quebec_bbox: dict
