"""Endpoints de rutas."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query, Response, status

from app.controllers.dependencies import route_service
from app.models.db import RouteStatus
from app.models.schemas import (
    CreateRouteRequest,
    PaginatedRoutes,
    RouteResponse,
    UpdateRouteStatusRequest,
    UpdateStopRequest,
)
from app.services.route_service import RouteService

router = APIRouter(prefix="/api/routes", tags=["routes"])


@router.post(
    "",
    response_model=RouteResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear y optimizar una ruta",
)
async def create_route(
    payload: CreateRouteRequest,
    service: RouteService = Depends(route_service),
) -> RouteResponse:
    return await service.create_optimized(payload)


@router.get(
    "",
    response_model=PaginatedRoutes,
    summary="Listar rutas con filtros",
)
async def list_routes(
    status_filter: Optional[RouteStatus] = Query(default=None, alias="status"),
    from_date: Optional[datetime] = Query(default=None),
    to_date: Optional[datetime] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    service: RouteService = Depends(route_service),
) -> PaginatedRoutes:
    return await service.list_routes(
        status=status_filter,
        from_date=from_date,
        to_date=to_date,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{route_id}",
    response_model=RouteResponse,
    summary="Detalle completo de una ruta",
)
async def get_route(
    route_id: str,
    service: RouteService = Depends(route_service),
) -> RouteResponse:
    return await service.get_detail(route_id)


@router.patch(
    "/{route_id}/status",
    response_model=RouteResponse,
    summary="Cambiar estado de la ruta",
)
async def update_status(
    route_id: str,
    payload: UpdateRouteStatusRequest,
    service: RouteService = Depends(route_service),
) -> RouteResponse:
    return await service.update_status(route_id, payload)


@router.patch(
    "/{route_id}/stops/{stop_id}",
    response_model=RouteResponse,
    summary="Marcar parada como visitada/saltada/fallida",
)
async def update_stop(
    route_id: str,
    stop_id: str,
    payload: UpdateStopRequest,
    service: RouteService = Depends(route_service),
) -> RouteResponse:
    return await service.update_stop(route_id, stop_id, payload)


@router.delete(
    "/{route_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Soft delete de una ruta",
)
async def delete_route(
    route_id: str,
    service: RouteService = Depends(route_service),
) -> Response:
    await service.delete(route_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
