"""Optimización del orden de visita usando OR-Tools.

Plantea el problema como un VRP (Vehicle Routing Problem) con un solo vehículo
que parte desde el índice 0 (start) y, opcionalmente, regresa al inicio.
Para 30 paradas es trivial computacionalmente.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Sequence

from ortools.constraint_solver import pywrapcp, routing_enums_pb2

from app.services.distance_calculator import DistanceCalculator, Point


@dataclass(frozen=True)
class OptimizationResult:
    """Resultado de la optimización.

    `order` es la secuencia de índices respecto a la lista original que se pasó
    al optimizador. El primer índice siempre es 0 (start). Si `return_to_start`
    es True, también termina en 0.

    `leg_distances_km` tiene el largo de `order` y representa la distancia
    desde el punto anterior hasta el actual (el primero siempre es 0.0).
    `total_distance_km` es la suma.
    """

    order: List[int]
    leg_distances_km: List[float]
    total_distance_km: float


class RouteOptimizer:
    """Resuelve TSP con OR-Tools sobre una matriz de distancias."""

    # OR-Tools trabaja con enteros: convertimos km a metros.
    _SCALE = 1000

    def __init__(self, distance_calc: DistanceCalculator) -> None:
        self._distance_calc = distance_calc

    def optimize(
        self,
        points: Sequence[Point],
        *,
        return_to_start: bool = False,
        time_limit_seconds: int = 5,
    ) -> OptimizationResult:
        """Optimiza el orden de visita.

        `points[0]` es el punto de partida (no se reordena).
        El resto se reordena para minimizar la distancia total.
        """
        n = len(points)
        if n == 0:
            return OptimizationResult(order=[], leg_distances_km=[], total_distance_km=0.0)
        if n == 1:
            return OptimizationResult(order=[0], leg_distances_km=[0.0], total_distance_km=0.0)

        matrix = self._distance_calc.matrix(points)

        # Si NO regresamos al inicio: fin "virtual" con coste 0 hacia start
        # para que OR-Tools tenga libertad de terminar en cualquier nodo.
        # OR-Tools soporta start_node y end_node distintos en RoutingIndexManager.
        if return_to_start:
            manager = pywrapcp.RoutingIndexManager(n, 1, 0)
            scaled = [[int(round(d * self._SCALE)) for d in row] for row in matrix]
        else:
            # Truco estándar: añadir nodo dummy con distancia 0 a todos
            # y forzar a que sea el final del recorrido.
            n_eff = n + 1
            scaled = [[0] * n_eff for _ in range(n_eff)]
            for i in range(n):
                for j in range(n):
                    scaled[i][j] = int(round(matrix[i][j] * self._SCALE))
            # dummy index = n; coste 0 hacia/desde todos => permite terminar libre
            manager = pywrapcp.RoutingIndexManager(n_eff, 1, [0], [n])

        routing = pywrapcp.RoutingModel(manager)

        def cost_callback(from_idx: int, to_idx: int) -> int:
            f = manager.IndexToNode(from_idx)
            t = manager.IndexToNode(to_idx)
            return scaled[f][t]

        transit_idx = routing.RegisterTransitCallback(cost_callback)
        routing.SetArcCostEvaluatorOfAllVehicles(transit_idx)

        params = pywrapcp.DefaultRoutingSearchParameters()
        params.first_solution_strategy = (
            routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
        )
        params.local_search_metaheuristic = (
            routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
        )
        params.time_limit.FromSeconds(time_limit_seconds)

        solution = routing.SolveWithParameters(params)
        if solution is None:
            # Fallback: orden original (no debería ocurrir con n <= 30)
            order = list(range(n))
            legs = [0.0] + [matrix[order[i - 1]][order[i]] for i in range(1, n)]
            if return_to_start:
                order.append(0)
                legs.append(matrix[order[-2]][0])
            return OptimizationResult(
                order=order, leg_distances_km=legs, total_distance_km=sum(legs)
            )

        order: List[int] = []
        index = routing.Start(0)
        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            if node < n:  # ignoramos el dummy
                order.append(node)
            index = solution.Value(routing.NextVar(index))
        # nodo final
        last = manager.IndexToNode(index)
        if last < n:
            order.append(last)

        if return_to_start and order[-1] != 0:
            order.append(0)

        # Calcular distancias por tramo (en km, no en metros)
        legs: List[float] = [0.0]
        for i in range(1, len(order)):
            legs.append(matrix[order[i - 1]][order[i]])

        return OptimizationResult(
            order=order,
            leg_distances_km=legs,
            total_distance_km=sum(legs),
        )
