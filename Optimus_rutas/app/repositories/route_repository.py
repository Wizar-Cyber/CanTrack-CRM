"""Repositorio de rutas. Aísla SQL de la lógica de negocio."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional, Tuple

from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.db import Route, RouteStatus, RouteStop, StopStatus


class RouteRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ----------------------------- Writes ----------------------------------- #

    async def add(self, route: Route) -> Route:
        self._session.add(route)
        await self._session.flush()
        # Re-fetch con stops cargados
        await self._session.refresh(route, attribute_names=["stops"])
        return route

    async def soft_delete(self, route: Route) -> None:
        from datetime import timezone
        route.deleted_at = datetime.now(timezone.utc)
        await self._session.flush()

    async def save(self, route: Route) -> None:
        await self._session.flush()
        await self._session.refresh(route, attribute_names=["stops"])

    # ----------------------------- Reads ------------------------------------ #

    async def get(self, route_id: str, *, include_deleted: bool = False) -> Optional[Route]:
        stmt = select(Route).where(Route.id == route_id)
        if not include_deleted:
            stmt = stmt.where(Route.deleted_at.is_(None))
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_stop(self, route_id: str, stop_id: str) -> Optional[RouteStop]:
        stmt = select(RouteStop).where(
            and_(RouteStop.id == stop_id, RouteStop.route_id == route_id)
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def list(
        self,
        *,
        status: Optional[RouteStatus] = None,
        from_date: Optional[datetime] = None,
        to_date: Optional[datetime] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[Tuple[Route, int, int]], int]:
        """Devuelve (lista de (route, total_stops, completed_stops), total_count).

        El recuento de paradas se hace en SQL para evitar N+1.
        """
        # Subquery: total y completadas por ruta
        total_sq = (
            select(
                RouteStop.route_id.label("rid"),
                func.count(RouteStop.id).label("total"),
                func.sum(
                    case(
                        (RouteStop.status == StopStatus.VISITED, 1), else_=0
                    )
                ).label("completed"),
            )
            .group_by(RouteStop.route_id)
            .subquery()
        )

        base = (
            select(
                Route,
                func.coalesce(total_sq.c.total, 0).label("stops_count"),
                func.coalesce(total_sq.c.completed, 0).label("completed_stops_count"),
            )
            .outerjoin(total_sq, Route.id == total_sq.c.rid)
            .where(Route.deleted_at.is_(None))
        )

        if status is not None:
            base = base.where(Route.status == status)
        if from_date is not None:
            base = base.where(Route.created_at >= from_date)
        if to_date is not None:
            base = base.where(Route.created_at <= to_date)

        # Total para paginación
        count_stmt = select(func.count()).select_from(base.subquery())
        total_count = (await self._session.execute(count_stmt)).scalar_one()

        page = (
            base.order_by(Route.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self._session.execute(page)
        rows = result.all()

        items: List[Tuple[Route, int, int]] = [(r[0], int(r[1]), int(r[2])) for r in rows]
        return items, int(total_count)
