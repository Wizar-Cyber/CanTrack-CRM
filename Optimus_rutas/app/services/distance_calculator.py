"""Calculadores de distancia entre puntos.

Interface abstracta para permitir migración a OSRM (distancia real por carretera)
sin reescribir el optimizador ni los servicios que la consumen.
"""

from __future__ import annotations

import math
from abc import ABC, abstractmethod
from typing import List, Sequence, Tuple

Point = Tuple[float, float]  # (lat, lng)


class DistanceCalculator(ABC):
    """Interfaz para cualquier estrategia de cálculo de distancias."""

    @abstractmethod
    def matrix(self, points: Sequence[Point]) -> List[List[float]]:
        """Devuelve matriz N×N de distancias en kilómetros."""
        raise NotImplementedError

    @abstractmethod
    def between(self, a: Point, b: Point) -> float:
        """Distancia en km entre dos puntos."""
        raise NotImplementedError


class HaversineCalculator(DistanceCalculator):
    """Distancia geodésica en línea recta (great-circle).

    Subestima la distancia real por carretera ~20-30% en zonas urbanas
    pero es suficiente para el orden óptimo en rutas pequeñas (<= 30 paradas).
    Migrar a OSRM cuando se necesite tiempo de viaje real.
    """

    EARTH_RADIUS_KM = 6371.0088

    def between(self, a: Point, b: Point) -> float:
        lat1, lng1 = a
        lat2, lng2 = b

        lat1r = math.radians(lat1)
        lat2r = math.radians(lat2)
        dlat = math.radians(lat2 - lat1)
        dlng = math.radians(lng2 - lng1)

        h = (
            math.sin(dlat / 2) ** 2
            + math.cos(lat1r) * math.cos(lat2r) * math.sin(dlng / 2) ** 2
        )
        c = 2 * math.asin(min(1.0, math.sqrt(h)))
        return self.EARTH_RADIUS_KM * c

    def matrix(self, points: Sequence[Point]) -> List[List[float]]:
        n = len(points)
        m: List[List[float]] = [[0.0] * n for _ in range(n)]
        for i in range(n):
            for j in range(i + 1, n):
                d = self.between(points[i], points[j])
                m[i][j] = d
                m[j][i] = d
        return m


# Punto de extensión futuro (no implementado todavía).
# class OSRMCalculator(DistanceCalculator):
#     """Llama a un servidor OSRM para obtener distancia real por carretera."""
#     ...
