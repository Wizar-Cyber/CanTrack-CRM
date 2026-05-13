"""Modelos SQLAlchemy 2.x. Todos heredan de Base."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    JSON,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def _uuid() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class RouteStatus(str, enum.Enum):
    # Optimus-native statuses
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    # CanTrack-compatible statuses
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class StopStatus(str, enum.Enum):
    PENDING = "pending"
    VISITED = "visited"
    SKIPPED = "skipped"
    FAILED = "failed"


class Route(Base):
    __tablename__ = "routes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[RouteStatus] = mapped_column(
        Enum(RouteStatus, native_enum=False, values_callable=lambda obj: [e.value for e in obj], length=20),
        default=RouteStatus.PENDING,
        nullable=False,
        index=True,
    )

    start_address: Mapped[str] = mapped_column(Text, nullable=False)
    start_lat: Mapped[float] = mapped_column(Float, nullable=False)
    start_lng: Mapped[float] = mapped_column(Float, nullable=False)
    return_to_start: Mapped[bool] = mapped_column(default=False, nullable=False)

    average_speed_kmh: Mapped[float] = mapped_column(Float, nullable=False, default=30.0)
    total_distance_km: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    estimated_time_minutes: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    current_stop_index: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    stops: Mapped[list["RouteStop"]] = relationship(
        back_populates="route",
        cascade="all, delete-orphan",
        order_by="RouteStop.order",
        lazy="selectin",
    )

    __table_args__ = (Index("ix_routes_status_created", "status", "created_at"),)


class RouteStop(Base):
    __tablename__ = "route_stops"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    route_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("routes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    order: Mapped[int] = mapped_column(Integer, nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    label: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    distance_from_previous_km: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    status: Mapped[StopStatus] = mapped_column(
        Enum(StopStatus, native_enum=False, values_callable=lambda obj: [e.value for e in obj], length=20),
        default=StopStatus.PENDING,
        nullable=False,
    )
    visited_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    route: Mapped[Route] = relationship(back_populates="stops")


class GeocodingCache(Base):
    __tablename__ = "geocoding_cache"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    address_normalized: Mapped[str] = mapped_column(
        String(500), nullable=False, unique=True, index=True
    )
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    confidence_score: Mapped[float] = mapped_column(Float, nullable=False)
    mapbox_response_raw: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
