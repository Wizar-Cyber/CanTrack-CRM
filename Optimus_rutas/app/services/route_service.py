"""Servicio de rutas. Orquesta geocoding, optimización y persistencia.

Esta es la capa donde vive la lógica de negocio de alto nivel.
Los controllers solo deben llamar a métodos de aquí.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from app.exceptions import (
    InvalidStateTransitionError,
    NotFoundError,
    ValidationFailedError,
)
from app.models.db import Route, RouteStatus, RouteStop, StopStatus
from app.models.schemas import (
    CreateRouteRequest,
    PaginatedRoutes,
    RouteResponse,
    RouteSummary,
    StopResponse,
    UpdateRouteStatusRequest,
    UpdateStopRequest,
)
from app.repositories.route_repository import RouteRepository
from app.services.geocoding_service import GeocodingService
from app.services.route_optimizer import RouteOptimizer
from app.utils.config import Settings
from app.utils.logger import get_logger

logger = get_logger(__name__)


# Transiciones legítimas. Cubre tanto los estados de Optimus como los de CanTrack.
_VALID_TRANSITIONS = {
    RouteStatus.PENDING:     {RouteStatus.IN_PROGRESS, RouteStatus.ACTIVE, RouteStatus.CANCELLED},
    RouteStatus.DRAFT:       {RouteStatus.PENDING, RouteStatus.IN_PROGRESS, RouteStatus.ACTIVE, RouteStatus.CANCELLED},
    RouteStatus.IN_PROGRESS: {RouteStatus.PENDING, RouteStatus.PAUSED, RouteStatus.COMPLETED, RouteStatus.CANCELLED},
    RouteStatus.ACTIVE:      {RouteStatus.PAUSED, RouteStatus.IN_PROGRESS, RouteStatus.COMPLETED, RouteStatus.CANCELLED},
    RouteStatus.PAUSED:      {RouteStatus.ACTIVE, RouteStatus.IN_PROGRESS, RouteStatus.CANCELLED},
    RouteStatus.COMPLETED:   set(),
    RouteStatus.CANCELLED:   set(),
}


class RouteService:
    def __init__(
        self,
        repo: RouteRepository,
        geocoding: GeocodingService,
        optimizer: RouteOptimizer,
        settings: Settings,
    ) -> None:
        self._repo = repo
        self._geocoding = geocoding
        self._optimizer = optimizer
        self._settings = settings

    # ----------------------------- Crear ------------------------------------ #

    async def create_optimized(self, payload: CreateRouteRequest) -> RouteResponse:
        # 1) Validación de límite de paradas
        if len(payload.stops) > self._settings.max_stops_per_route:
            raise ValidationFailedError(
                f"Máximo {self._settings.max_stops_per_route} paradas por ruta. "
                f"Recibidas: {len(payload.stops)}",
                details={"max_stops": self._settings.max_stops_per_route},
            )

        # 2) Geocoding (start + stops)
        start_lat, start_lng = await self._geocoding.geocode_strict(payload.start_address)
        stop_coords: List[tuple[float, float]] = []
        for addr in payload.stops:
            lat, lng = await self._geocoding.geocode_strict(addr)
            stop_coords.append((lat, lng))

        # 3) Optimización
        all_points = [(start_lat, start_lng)] + stop_coords
        opt = self._optimizer.optimize(
            all_points, return_to_start=payload.return_to_start
        )

        # 4) Construir entidades
        route = Route(
            user_id=payload.user_id,
            name=payload.name,
            status=RouteStatus.PENDING,
            start_address=payload.start_address,
            start_lat=start_lat,
            start_lng=start_lng,
            return_to_start=payload.return_to_start,
            average_speed_kmh=payload.average_speed_kmh,
            total_distance_km=opt.total_distance_km,
            estimated_time_minutes=self._estimate_time_minutes(
                opt.total_distance_km, payload.average_speed_kmh
            ),
            notes=payload.notes,
        )

        # opt.order incluye el índice 0 (start) al inicio.
        # Las paradas son los demás índices (excepto el último 0 si return_to_start).
        order_for_stops = [i for i in opt.order if i != 0]
        # leg_distances correspondientes (alineados con `order`):
        #   opt.leg_distances_km[k] es la distancia desde opt.order[k-1] hasta opt.order[k].
        # Para la primera parada visitada, su leg es opt.leg_distances_km[1].
        # Para mantenerlo simple, recorremos opt.order y agregamos legs cuando el nodo no es 0.
        seq = 1
        previous_distance = 0.0
        for idx_in_path, node in enumerate(opt.order):
            if node == 0:
                # nodo de inicio o regreso; no genera RouteStop
                continue
            previous_distance = opt.leg_distances_km[idx_in_path]
            stop_addr_idx = node - 1  # porque points[0] era start
            stop = RouteStop(
                order=seq,
                address=payload.stops[stop_addr_idx],
                lat=stop_coords[stop_addr_idx][0],
                lng=stop_coords[stop_addr_idx][1],
                distance_from_previous_km=previous_distance,
                status=StopStatus.PENDING,
            )
            route.stops.append(stop)
            seq += 1

        # 5) Persistir
        await self._repo.add(route)
        logger.info(
            "ruta creada id=%s nombre=%s paradas=%d distancia_km=%.2f",
            route.id, route.name, len(route.stops), route.total_distance_km,
        )
        return self._to_response(route)

    # ----------------------------- Listar ----------------------------------- #

    async def list_routes(
        self,
        *,
        status: Optional[RouteStatus],
        from_date: Optional[datetime],
        to_date: Optional[datetime],
        limit: int,
        offset: int,
    ) -> PaginatedRoutes:
        items, total = await self._repo.list(
            status=status,
            from_date=from_date,
            to_date=to_date,
            limit=limit,
            offset=offset,
        )
        summaries = [
            RouteSummary(
                id=r.id,
                name=r.name,
                status=r.status,
                start_address=r.start_address,
                total_distance_km=r.total_distance_km,
                estimated_time_minutes=r.estimated_time_minutes,
                stops_count=count,
                completed_stops_count=completed,
                notes=r.notes,
                created_at=r.created_at,
                started_at=r.started_at,
                completed_at=r.completed_at,
            )
            for (r, count, completed) in items
        ]
        return PaginatedRoutes(items=summaries, total=total, limit=limit, offset=offset)

    # ----------------------------- Detalle ---------------------------------- #

    async def get_detail(self, route_id: str) -> RouteResponse:
        route = await self._repo.get(route_id)
        if route is None:
            raise NotFoundError(f"Ruta {route_id} no encontrada.")
        return self._to_response(route)

    # ----------------------------- Update status ---------------------------- #

    async def update_status(
        self, route_id: str, payload: UpdateRouteStatusRequest
    ) -> RouteResponse:
        route = await self._repo.get(route_id)
        if route is None:
            raise NotFoundError(f"Ruta {route_id} no encontrada.")

        if payload.status not in _VALID_TRANSITIONS.get(route.status, set()):
            raise InvalidStateTransitionError(
                f"No se puede pasar de {route.status.value} a {payload.status.value}.",
                details={"from": route.status.value, "to": payload.status.value},
            )

        now = datetime.now(timezone.utc)
        route.status = payload.status
        if payload.status in (RouteStatus.IN_PROGRESS, RouteStatus.ACTIVE):
            if route.started_at is None:
                route.started_at = now
            route.current_stop_index = payload.current_stop_index
        elif payload.status == RouteStatus.COMPLETED:
            route.completed_at = now
            # Marcar paradas pendientes restantes como skipped si la ruta se cierra
            for s in route.stops:
                if s.status == StopStatus.PENDING:
                    s.status = StopStatus.SKIPPED
        elif payload.status == RouteStatus.CANCELLED:
            route.completed_at = now

        await self._repo.save(route)
        return self._to_response(route)

    # ----------------------------- Update stop ------------------------------ #

    async def update_stop(
        self, route_id: str, stop_id: str, payload: UpdateStopRequest
    ) -> RouteResponse:
        route = await self._repo.get(route_id)
        if route is None:
            raise NotFoundError(f"Ruta {route_id} no encontrada.")

        stop = await self._repo.get_stop(route_id, stop_id)
        if stop is None:
            raise NotFoundError(f"Parada {stop_id} no existe en la ruta {route_id}.")

        stop.status = payload.status
        if payload.notes is not None:
            stop.notes = payload.notes
        if payload.status in (StopStatus.VISITED, StopStatus.SKIPPED, StopStatus.FAILED):
            stop.visited_at = datetime.now(timezone.utc)

        # Si todas las paradas están en estado terminal, mover ruta a completed
        if route.status in (RouteStatus.IN_PROGRESS, RouteStatus.ACTIVE) and all(
            s.status != StopStatus.PENDING for s in route.stops
        ):
            route.status = RouteStatus.COMPLETED
            route.completed_at = datetime.now(timezone.utc)

        await self._repo.save(route)
        return self._to_response(route)

    # ----------------------------- Delete ----------------------------------- #

    async def delete(self, route_id: str) -> None:
        route = await self._repo.get(route_id)
        if route is None:
            raise NotFoundError(f"Ruta {route_id} no encontrada.")
        await self._repo.soft_delete(route)

    # ----------------------------- Helpers ---------------------------------- #

    @staticmethod
    def _estimate_time_minutes(distance_km: float, speed_kmh: float) -> float:
        if speed_kmh <= 0:
            return 0.0
        return (distance_km / speed_kmh) * 60.0

    @staticmethod
    def _to_response(route: Route) -> RouteResponse:
        return RouteResponse(
            id=route.id,
            name=route.name,
            status=route.status,
            start_address=route.start_address,
            start_lat=route.start_lat,
            start_lng=route.start_lng,
            return_to_start=route.return_to_start,
            average_speed_kmh=route.average_speed_kmh,
            total_distance_km=route.total_distance_km,
            estimated_time_minutes=route.estimated_time_minutes,
            current_stop_index=route.current_stop_index,
            notes=route.notes,
            created_at=route.created_at,
            updated_at=route.updated_at,
            started_at=route.started_at,
            completed_at=route.completed_at,
            stops=[
                StopResponse(
                    id=s.id,
                    order=s.order,
                    address=s.address,
                    lat=s.lat,
                    lng=s.lng,
                    label=s.label,
                    distance_from_previous_km=s.distance_from_previous_km,
                    status=s.status,
                    visited_at=s.visited_at,
                    notes=s.notes,
                )
                for s in route.stops
            ],
        )
