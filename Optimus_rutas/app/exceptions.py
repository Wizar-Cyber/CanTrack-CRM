"""Excepciones de dominio. El handler HTTP las traduce a status codes."""


class AppError(Exception):
    """Base. Todos los errores controlados heredan de aquí."""

    status_code: int = 500
    code: str = "internal_error"

    def __init__(self, message: str, *, details: dict | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}


class ValidationFailedError(AppError):
    status_code = 400
    code = "validation_failed"


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class GeocodingAmbiguousError(AppError):
    """Mapbox devolvió un resultado pero con baja confianza, o múltiples opciones."""

    status_code = 422
    code = "geocoding_ambiguous"


class GeocodingOutOfRegionError(AppError):
    """Coordenadas válidas pero fuera del bounding box de Quebec."""

    status_code = 422
    code = "geocoding_out_of_region"


class GeocodingFailedError(AppError):
    """Mapbox no devolvió ningún resultado."""

    status_code = 422
    code = "geocoding_failed"


class MapboxUnavailableError(AppError):
    """Mapbox respondió con error o no respondió tras los reintentos."""

    status_code = 502
    code = "mapbox_unavailable"


class InvalidStateTransitionError(AppError):
    status_code = 400
    code = "invalid_state_transition"
