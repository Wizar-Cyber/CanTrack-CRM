"""Repositorio del caché de geocoding."""

from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.db import GeocodingCache


def normalize_address(address: str) -> str:
    """Normalización para hit rate de caché.

    Importante: NO destruye acentos franceses (UTF-8 puro).
    Solo lowercase + collapse de whitespace + trim.
    """
    return " ".join(address.lower().split()).strip()


class GeocodingCacheRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, address: str) -> Optional[GeocodingCache]:
        normalized = normalize_address(address)
        stmt = select(GeocodingCache).where(GeocodingCache.address_normalized == normalized)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def upsert(
        self,
        *,
        address: str,
        lat: float,
        lng: float,
        confidence: float,
        raw: dict,
    ) -> GeocodingCache:
        normalized = normalize_address(address)
        existing = await self.get(normalized)
        if existing:
            existing.lat = lat
            existing.lng = lng
            existing.confidence_score = confidence
            existing.mapbox_response_raw = raw
            await self._session.flush()
            return existing

        entry = GeocodingCache(
            address_normalized=normalized,
            lat=lat,
            lng=lng,
            confidence_score=confidence,
            mapbox_response_raw=raw,
        )
        self._session.add(entry)
        await self._session.flush()
        return entry
