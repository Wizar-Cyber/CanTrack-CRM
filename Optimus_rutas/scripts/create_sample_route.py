#!/usr/bin/env python3
"""Crea una ruta de prueba con 10 direcciones reales de Quebec.

Por defecto valida cada dirección antes de crear la ruta, así si alguna falla
te lo dice individualmente sin tener que adivinar cuál fue.

Uso:
    python scripts/create_sample_route.py
    python scripts/create_sample_route.py --url http://localhost:8000
    python scripts/create_sample_route.py --validate-only      # sólo geocodifica
    python scripts/create_sample_route.py --no-validate        # crea directo

Requiere que la API esté arriba (uvicorn o docker compose) y que MAPBOX_TOKEN
esté configurado en el .env de la app.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

import httpx


# 10 direcciones reales de Quebec.
# Mezcla deliberada Montreal / Laval / Longueuil para que la optimización tenga
# que hacer trabajo real (no es un orden trivialmente bueno).
# Todas elegidas por ser puntos bien indexados (centros comerciales, instituciones)
# para minimizar el riesgo de geocoding ambiguo.
SAMPLE_ADDRESSES = [
    # Las 3 con código postal son calles que Mapbox v6 marca ambiguas sin él
    # (existe el nombre en varias ciudades, o normaliza distinto el "Les"/"Des").
    # Con CP, el match sube de 0.30 (low) a 0.85+ (high/exact).
    "1255 Boulevard Robert-Bourassa, Montréal, QC",                       # Centre-ville
    #"8000 Boulevard Des Galeries-d'Anjou, Anjou, Québec H1M 1W6",         # Galeries d'Anjou
    "5710 Rue Garnier, Montréal, QC",                                     # Plateau
    "1755 Boulevard Le Corbusier, Laval, Québec H7S 2P1",                 # Carrefour Laval
    "6767 Chemin de la Côte-des-Neiges, Montréal, QC",                    # CDN (oeste)
    "4200 Rue Sainte-Catherine Est, Montréal, QC",                        # Hochelaga
    "150 Rue Saint-Charles Ouest, Longueuil, QC",                         # Rive-Sud
    "2000 Rue Peel, Montréal, QC",                                        # Centre-ville oeste
    #"7077 Rue Saint-Hubert, Montréal, Québec H2S 2N1",                    # Villeray
    "1500 Avenue Atwater, Montréal, QC",                                  # Saint-Henri / Westmount
]

START_ADDRESS = "1200 Avenue McGill College, Montréal, QC"


# --- Colores básicos (sin dependencias externas) --------------------------- #

class C:
    R = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    GREEN = "\033[32m"
    RED = "\033[31m"
    YELLOW = "\033[33m"
    CYAN = "\033[36m"
    MAGENTA = "\033[35m"

    @classmethod
    def disable(cls):
        for attr in ("R", "BOLD", "DIM", "GREEN", "RED", "YELLOW", "CYAN", "MAGENTA"):
            setattr(cls, attr, "")


if not sys.stdout.isatty() or os.environ.get("NO_COLOR"):
    C.disable()


def hr(char: str = "─", width: int = 70) -> None:
    print(C.DIM + char * width + C.R)


def fail(msg: str, *, code: int = 1) -> None:
    print(f"{C.RED}{C.BOLD}✗ {msg}{C.R}", file=sys.stderr)
    sys.exit(code)


# --- API helpers ----------------------------------------------------------- #

def check_health(client: httpx.Client) -> None:
    try:
        resp = client.get("/api/health", timeout=5.0)
    except httpx.HTTPError as e:
        fail(f"No se pudo contactar la API: {e}\n"
             "  Verificá que la app esté arriba (uvicorn / docker compose).")
    if resp.status_code != 200:
        fail(f"Health check devolvió {resp.status_code}: {resp.text}")
    body = resp.json()
    print(f"{C.GREEN}✓{C.R} API arriba — {C.DIM}{body['app']} ({body['env']}){C.R}")


def validate_address(client: httpx.Client, address: str) -> dict[str, Any]:
    """Llama /api/geocode y devuelve el body parseado."""
    resp = client.post("/api/geocode", json={"address": address}, timeout=20.0)
    resp.raise_for_status()
    return resp.json()


def validate_all(
    client: httpx.Client, addresses: list[str]
) -> tuple[list[str], list[tuple[str, str, Any]]]:
    """Pre-valida todas las direcciones. Devuelve (ok, errores).

    ok      : lista de strings (direcciones que geocodifican bien)
    errores : lista de tuplas (address, status, payload)
    """
    print(f"{C.BOLD}Validando {len(addresses)} direcciones...{C.R}")
    ok: list[str] = []
    errors: list[tuple[str, str, Any]] = []

    for addr in addresses:
        try:
            body = validate_address(client, addr)
        except httpx.HTTPError as e:
            print(f"  {C.RED}✗{C.R} {addr}")
            print(f"      {C.DIM}error de red: {e}{C.R}")
            errors.append((addr, "http_error", str(e)))
            continue

        status = body.get("status")
        if status == "ok":
            conf = body.get("confidence", 0)
            print(f"  {C.GREEN}✓{C.R} {addr}")
            print(f"      {C.DIM}({body['lat']:.4f}, {body['lng']:.4f})  conf={conf:.2f}{C.R}")
            ok.append(addr)
        elif status == "ambiguous":
            print(f"  {C.YELLOW}~{C.R} {addr}  {C.YELLOW}AMBIGUA{C.R}")
            for c in body.get("candidates", [])[:3]:
                pn = c.get("place_name") or c.get("address", "?")
                print(f"      {C.DIM}→ {pn}  conf={c.get('confidence', 0):.2f}{C.R}")
            errors.append((addr, "ambiguous", body))
        elif status == "out_of_region":
            print(f"  {C.RED}✗{C.R} {addr}  {C.RED}FUERA DE QUEBEC{C.R}")
            print(f"      {C.DIM}({body.get('lat'):.4f}, {body.get('lng'):.4f}){C.R}")
            errors.append((addr, "out_of_region", body))
        else:
            print(f"  {C.RED}✗{C.R} {addr}  {C.RED}NO ENCONTRADA{C.R}")
            errors.append((addr, "not_found", body))

    print()
    if errors:
        print(f"{C.YELLOW}{len(ok)}/{len(addresses)} OK, {len(errors)} con problema.{C.R}")
    else:
        print(f"{C.GREEN}{len(ok)}/{len(addresses)} direcciones OK.{C.R}")
    return ok, errors


def create_route(
    client: httpx.Client, *, name: str, start: str, stops: list[str]
) -> dict[str, Any]:
    payload = {
        "name": name,
        "start_address": start,
        "stops": stops,
        "return_to_start": False,
        "average_speed_kmh": 35.0,
        "notes": "Ruta de prueba generada por scripts/create_sample_route.py",
    }
    print(f"{C.CYAN}→{C.R} POST /api/routes  {C.DIM}({len(stops)} paradas){C.R}")
    try:
        resp = client.post("/api/routes", json=payload, timeout=60.0)
    except httpx.HTTPError as e:
        fail(f"Error de red al crear la ruta: {e}")

    if resp.status_code == 201:
        return resp.json()

    try:
        body = resp.json()
    except json.JSONDecodeError:
        fail(f"Respuesta inesperada {resp.status_code}: {resp.text[:300]}")

    print(f"{C.RED}✗ La API rechazó la creación{C.R}")
    print(f"  HTTP   : {resp.status_code}")
    print(f"  code   : {body.get('code', '?')}")
    print(f"  message: {body.get('message', '?')}")
    if body.get("details"):
        print(f"  details: {json.dumps(body['details'], ensure_ascii=False, indent=2)}")
    sys.exit(2)


# --- Pretty printing ------------------------------------------------------- #

def print_route(route: dict[str, Any]) -> None:
    hr("═")
    print(f"{C.BOLD}{C.GREEN}✓ Ruta creada{C.R}  id = {C.CYAN}{route['id']}{C.R}")
    print(f"  {C.BOLD}{route['name']}{C.R}")
    hr()
    print(f"  Estado            : {route['status']}")
    print(f"  Distancia total   : {C.BOLD}{route['total_distance_km']:.2f} km{C.R}")
    print(f"  Tiempo estimado   : {C.BOLD}{route['estimated_time_minutes']:.0f} min{C.R}  "
          f"{C.DIM}(@ {route['average_speed_kmh']:.0f} km/h){C.R}")
    print(f"  Volver al inicio  : {'sí' if route['return_to_start'] else 'no'}")
    print()
    print(f"  {C.MAGENTA}START{C.R}  {route['start_address']}")
    print(f"         {C.DIM}({route['start_lat']:.4f}, {route['start_lng']:.4f}){C.R}")

    print()
    print(f"  {C.BOLD}Paradas en orden óptimo:{C.R}")
    for s in route["stops"]:
        print(f"    {C.CYAN}{s['order']:>2}.{C.R}  {s['address']}")
        print(f"         {C.DIM}({s['lat']:.4f}, {s['lng']:.4f}) · "
              f"+{s['distance_from_previous_km']:.2f} km · {s['status']}{C.R}")
    hr("═")


def print_followups(base_url: str, route_id: str, first_stop_id: str) -> None:
    print(f"{C.BOLD}Comandos útiles para continuar:{C.R}")
    print()
    print(f"  {C.DIM}# Ver la ruta en el navegador{C.R}")
    print(f"  open {base_url}/")
    print()
    print(f"  {C.DIM}# Iniciar la ruta (pending → in_progress){C.R}")
    print(f"  curl -X PATCH {base_url}/api/routes/{route_id}/status \\")
    print(f"    -H 'Content-Type: application/json' \\")
    print(f"    -d '{{\"status\": \"in_progress\"}}'")
    print()
    print(f"  {C.DIM}# Marcar la primera parada como visitada{C.R}")
    print(f"  curl -X PATCH {base_url}/api/routes/{route_id}/stops/{first_stop_id} \\")
    print(f"    -H 'Content-Type: application/json' \\")
    print(f"    -d '{{\"status\": \"visited\", \"notes\": \"Livré au concierge\"}}'")
    print()
    print(f"  {C.DIM}# Detalle completo{C.R}")
    print(f"  curl {base_url}/api/routes/{route_id}")
    print()
    print(f"  {C.DIM}# Soft delete{C.R}")
    print(f"  curl -X DELETE {base_url}/api/routes/{route_id}")


# --- Main ------------------------------------------------------------------ #

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Crear ruta de muestra con 10 direcciones reales de Quebec."
    )
    parser.add_argument(
        "--url",
        default=os.environ.get("API_URL", "http://localhost:8000"),
        help="URL base de la API (default: http://localhost:8000 o $API_URL)",
    )
    parser.add_argument(
        "--name",
        default="Tournée test — 10 arrêts QC",
        help="Nombre de la ruta a crear",
    )
    parser.add_argument(
        "--start",
        default=START_ADDRESS,
        help=f"Dirección de inicio (default: {START_ADDRESS})",
    )
    parser.add_argument(
        "--no-validate",
        action="store_true",
        help="Saltar la pre-validación y crear directo",
    )
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="Sólo validar las direcciones, no crear la ruta",
    )
    args = parser.parse_args()

    base = args.url.rstrip("/")
    print(f"{C.BOLD}Routes Optimizer — script de muestra{C.R}")
    print(f"  API: {C.CYAN}{base}{C.R}")
    print(f"  Inicio: {args.start}")
    print(f"  Paradas: {len(SAMPLE_ADDRESSES)}")
    hr()

    with httpx.Client(base_url=base) as client:
        check_health(client)
        print()

        # Pre-validación
        if not args.no_validate:
            all_addresses = [args.start] + SAMPLE_ADDRESSES
            ok, errors = validate_all(client, all_addresses)
            if errors:
                print()
                print(f"{C.YELLOW}{C.BOLD}Hay direcciones con problemas:{C.R}")
                ambiguous_count = 0
                for addr, kind, payload in errors:
                    print(f"  - [{kind}] {addr}")
                    if kind == "ambiguous":
                        ambiguous_count += 1
                        cands = payload.get("candidates", []) if isinstance(payload, dict) else []
                        if cands:
                            first = cands[0].get("place_name") or cands[0].get("address", "?")
                            print(f"      {C.DIM}→ probablemente quisiste: {first}{C.R}")
                print()
                if ambiguous_count:
                    print(f"{C.DIM}Para AMBIGUA: copiá el 'probablemente quisiste' "
                          f"(forma canónica con código postal) y pegalo en SAMPLE_ADDRESSES.{C.R}")
                    print(f"{C.DIM}Mapbox v6 da confianza baja cuando el input no coincide "
                          f"exactamente con su normalización; con código postal sube a 0.85+.{C.R}")
                sys.exit(2)

            if args.validate_only:
                print(f"{C.GREEN}Validación completa. Saliendo (--validate-only).{C.R}")
                return

            print()

        # Crear ruta
        route = create_route(
            client,
            name=args.name,
            start=args.start,
            stops=SAMPLE_ADDRESSES,
        )

    print_route(route)
    print()
    if route["stops"]:
        print_followups(base, route["id"], route["stops"][0]["id"])


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n{C.YELLOW}Cancelado por el usuario.{C.R}")
        sys.exit(130)
