"""Configuración de la aplicación leída desde variables de entorno."""

from functools import lru_cache
from typing import List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuración tipada y validada. Inmutable tras instanciar."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # App
    app_name: str = "routes-optimizer"
    app_env: str = "production"
    log_level: str = "INFO"

    # Mapbox
    mapbox_token: str = Field(..., min_length=10)
    # Token para uso en frontend (Mapbox GL JS).
    # Si no se setea, se usa mapbox_token (que normalmente ya es un pk.* público).
    # Setear por separado solo si el backend usa un sk.* (token secreto).
    mapbox_public_token: str = ""
    mapbox_country: str = "CA"
    mapbox_language: str = "fr"
    mapbox_proximity_lng: float = -73.5673
    mapbox_proximity_lat: float = 45.5017
    mapbox_timeout_seconds: float = 10.0
    mapbox_max_retries: int = 3

    # DB
    database_url: str = "sqlite+aiosqlite:///./data/routes.db"

    # Reglas de negocio
    max_stops_per_route: int = 30
    min_geocoding_confidence: float = 0.6
    default_average_speed_kmh: float = 30.0

    # Quebec bounding box
    quebec_lat_min: float = 44.99
    quebec_lat_max: float = 62.58
    quebec_lng_min: float = -79.76
    quebec_lng_max: float = -57.10

    # CORS
    cors_origins: str = "*"

    @field_validator("log_level")
    @classmethod
    def _upper_log_level(cls, v: str) -> str:
        return v.upper()

    @property
    def cors_origins_list(self) -> List[str]:
        if self.cors_origins.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def effective_public_token(self) -> str:
        """Token a usar en el frontend (Mapbox GL JS).

        Si no se configuró uno separado, usa el mismo del backend.
        Solo es seguro exponer tokens 'pk.*' (public). Los 'sk.*' (secret)
        nunca deben llegar al cliente — en ese caso, configurar
        MAPBOX_PUBLIC_TOKEN aparte.
        """
        return self.mapbox_public_token or self.mapbox_token


@lru_cache
def get_settings() -> Settings:
    """Instancia singleton de configuración (cacheada)."""
    return Settings()  # type: ignore[call-arg]
