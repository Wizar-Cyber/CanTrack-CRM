"""Servicio de geocoding contra Mapbox Geocoding API v6.

- Cache primero (DB), Mapbox después.
- Bias geográfico hardcoded a Quebec (country=CA + proximity).
- Validación de bounding box: rechaza coordenadas fuera de Quebec.
- Retry exponencial para 429/5xx.
- UTF-8 puro: caracteres franceses se preservan.
"""

from __future__ import annotations

import asyncio
import random
from typing import List, Optional

import httpx

from app.exceptions import (
    GeocodingAmbiguousError,
    GeocodingFailedError,
    GeocodingOutOfRegionError,
    MapboxUnavailableError,
)
from app.models.schemas import GeocodeCandidate, GeocodeResponse
from app.repositories.geocoding_cache_repository import (
    GeocodingCacheRepository,
    normalize_address,
)
from app.utils.config import Settings
from app.utils.logger import get_logger

logger = get_logger(__name__)

MAPBOX_V6_URL = "https://api.mapbox.com/search/geocode/v6/forward"

# Mapbox v6 devuelve match_code.confidence con valores categóricos.
# Mapeamos a un score numérico estable.
_MATCH_CODE_TO_SCORE = {
    "exact": 1.0,
    "high": 0.85,
    "medium": 0.6,
    "low": 0.3,
}


class GeocodingService:
    """Servicio de alto nivel. Inyectar el repositorio de caché y un httpx.AsyncClient."""

    def __init__(
        self,
        cache_repo: GeocodingCacheRepository,
        http_client: httpx.AsyncClient,
        settings: Settings,
    ) -> None:
        self._cache = cache_repo
        self._http = http_client
        self._settings = settings

    # ------------------------------ API pública ----------------------------- #

    async def geocode(self, address: str) -> GeocodeResponse:
        """Geocodifica una dirección. Devuelve `GeocodeResponse` con status diferenciado.

        No lanza excepciones para casos esperables (ambiguous / out_of_region):
        las codifica en el response. Lanza solo si Mapbox cae.
        """
        addr = address.strip()
        if not addr:
            return GeocodeResponse(status="not_found", address=address)

        # 1) cache
        cached = await self._cache.get(addr)
        if cached:
            if not self._in_quebec(cached.lat, cached.lng):
                return GeocodeResponse(
                    status="out_of_region", address=addr,
                    lat=cached.lat, lng=cached.lng,
                    confidence=cached.confidence_score,
                )
            if cached.confidence_score < self._settings.min_geocoding_confidence:
                # Cache contiene una entrada de baja confianza; recomputar.
                logger.info("cache hit pero baja confianza, refrescando: %s", addr[:60])
            else:
                return GeocodeResponse(
                    status="ok",
                    address=addr,
                    lat=cached.lat,
                    lng=cached.lng,
                    confidence=cached.confidence_score,
                )

        # 2) Mapbox
        features = await self._call_mapbox(addr)
        if not features:
            return GeocodeResponse(status="not_found", address=addr)

        candidates = self._features_to_candidates(features)
        if not candidates:
            return GeocodeResponse(status="not_found", address=addr)

        best = candidates[0]

        if best.confidence < self._settings.min_geocoding_confidence:
            return GeocodeResponse(
                status="ambiguous",
                address=addr,
                candidates=candidates[:3],
            )

        if not self._in_quebec(best.lat, best.lng):
            return GeocodeResponse(
                status="out_of_region",
                address=addr,
                lat=best.lat,
                lng=best.lng,
                confidence=best.confidence,
                candidates=candidates[:3],
            )

        # Persistir en cache (raw para debugging)
        await self._cache.upsert(
            address=addr,
            lat=best.lat,
            lng=best.lng,
            confidence=best.confidence,
            raw={"feature": features[0]},
        )

        return GeocodeResponse(
            status="ok",
            address=addr,
            lat=best.lat,
            lng=best.lng,
            confidence=best.confidence,
        )

    async def geocode_strict(self, address: str) -> tuple[float, float]:
        """Geocodifica una dirección y exige éxito. Útil para crear rutas.

        Lanza excepciones tipadas si no se puede:
        - GeocodingAmbiguousError
        - GeocodingOutOfRegionError
        - GeocodingFailedError
        """
        result = await self.geocode(address)
        if result.status == "ok":
            assert result.lat is not None and result.lng is not None
            return result.lat, result.lng

        if result.status == "ambiguous":
            raise GeocodingAmbiguousError(
                f"La dirección '{address}' es ambigua. Especifica más detalles.",
                details={"candidates": [c.model_dump() for c in result.candidates]},
            )
        if result.status == "out_of_region":
            raise GeocodingOutOfRegionError(
                f"La dirección '{address}' está fuera de Quebec.",
                details={
                    "lat": result.lat,
                    "lng": result.lng,
                    "candidates": [c.model_dump() for c in result.candidates],
                },
            )
        raise GeocodingFailedError(f"No se pudo geocodificar '{address}'.")

    # ------------------------------ Internos -------------------------------- #

    async def _call_mapbox(self, address: str) -> List[dict]:
        """Llama a Mapbox v6 con retry. Devuelve la lista `features`."""
        params = {
            "q": address,
            "access_token": self._settings.mapbox_token,
            "country": self._settings.mapbox_country,
            "language": self._settings.mapbox_language,
            "proximity": (
                f"{self._settings.mapbox_proximity_lng},"
                f"{self._settings.mapbox_proximity_lat}"
            ),
            "limit": "5",
        }

        last_error: Optional[Exception] = None
        for attempt in range(self._settings.mapbox_max_retries):
            try:
                response = await self._http.get(
                    MAPBOX_V6_URL,
                    params=params,
                    timeout=self._settings.mapbox_timeout_seconds,
                )
            except httpx.HTTPError as exc:
                last_error = exc
                logger.warning("mapbox http error attempt %d: %s", attempt + 1, exc)
                await self._backoff(attempt)
                continue

            if response.status_code == 200:
                data = response.json()
                return data.get("features", []) or []

            if response.status_code in (429, 500, 502, 503, 504):
                last_error = httpx.HTTPStatusError(
                    f"Mapbox returned {response.status_code}",
                    request=response.request,
                    response=response,
                )
                logger.warning(
                    "mapbox %d on attempt %d, retrying", response.status_code, attempt + 1
                )
                await self._backoff(attempt, response=response)
                continue

            # 4xx no recuperable
            logger.error(
                "mapbox returned non-recoverable %d: %s",
                response.status_code,
                response.text[:300],
            )
            raise MapboxUnavailableError(
                f"Mapbox returned {response.status_code}",
                details={"status_code": response.status_code},
            )

        # Reintentos agotados
        logger.error("mapbox unreachable after retries: %s", last_error)
        raise MapboxUnavailableError(
            "Mapbox no está disponible. Reintenta en unos segundos.",
            details={"last_error": str(last_error) if last_error else "unknown"},
        )

    async def _backoff(self, attempt: int, response: Optional[httpx.Response] = None) -> None:
        """Backoff exponencial con jitter. Respeta Retry-After si está presente."""
        if response is not None:
            ra = response.headers.get("Retry-After")
            if ra:
                try:
                    await asyncio.sleep(float(ra))
                    return
                except ValueError:
                    pass
        wait = (2 ** attempt) + random.uniform(0, 0.5)
        await asyncio.sleep(wait)

    def _features_to_candidates(self, features: List[dict]) -> List[GeocodeCandidate]:
        out: List[GeocodeCandidate] = []
        for f in features:
            props = f.get("properties", {}) or {}
            # v6: properties.coordinates.{longitude,latitude}
            coords = props.get("coordinates") or {}
            lng = coords.get("longitude")
            lat = coords.get("latitude")
            if lat is None or lng is None:
                # fallback geometry
                geom = f.get("geometry", {}) or {}
                gcoords = geom.get("coordinates") or []
                if len(gcoords) >= 2:
                    lng, lat = gcoords[0], gcoords[1]
            if lat is None or lng is None:
                continue

            mc = (props.get("match_code") or {}).get("confidence", "low")
            confidence = _MATCH_CODE_TO_SCORE.get(mc, 0.3)

            place_name = props.get("full_address") or props.get("name") or props.get("place_formatted")

            out.append(
                GeocodeCandidate(
                    address=props.get("name", ""),
                    lat=float(lat),
                    lng=float(lng),
                    confidence=confidence,
                    place_name=place_name,
                )
            )
        # Ordenar por confianza descendente
        out.sort(key=lambda c: c.confidence, reverse=True)
        return out

    def _in_quebec(self, lat: float, lng: float) -> bool:
        s = self._settings
        return (
            s.quebec_lat_min <= lat <= s.quebec_lat_max
            and s.quebec_lng_min <= lng <= s.quebec_lng_max
        )


# Re-export for convenience
__all__ = ["GeocodingService", "normalize_address"]
