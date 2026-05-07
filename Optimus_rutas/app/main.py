"""Punto de entrada de la aplicación FastAPI."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.controllers.dependencies import shutdown_http_client, startup_http_client
from app.exceptions import AppError
from app.models.db import Base
from app.routes.geocoding_endpoints import router as geocoding_router
from app.routes.health_endpoints import router as health_router
from app.routes.routes_endpoints import router as routes_router
from app.utils.config import get_settings
from app.utils.database import get_engine
from app.utils.logger import get_logger, setup_logging

setup_logging()
logger = get_logger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("startup: inicializando recursos")
    await startup_http_client()
    # Crear tablas si no existen (para dev / Docker volumen vacío).
    # En producción seria, usar `alembic upgrade head` (ver alembic/env.py).
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("startup: ok")
    yield
    # Shutdown
    logger.info("shutdown: cerrando recursos")
    await shutdown_http_client()
    await engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Routes Optimizer API",
        version="1.0.0",
        description=(
            "Microservicio de optimización de rutas con geocoding "
            "(Mapbox) y OR-Tools. Quebec, CA."
        ),
        lifespan=lifespan,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Routers
    app.include_router(health_router)
    app.include_router(geocoding_router)
    app.include_router(routes_router)

    # Frontend estático: servido en /
    # Path resuelto relativo al directorio raíz del proyecto.
    frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
    if frontend_dir.exists():
        app.mount(
            "/",
            StaticFiles(directory=str(frontend_dir), html=True),
            name="frontend",
        )

    # Exception handlers
    @app.exception_handler(AppError)
    async def _app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        logger.warning(
            "AppError code=%s status=%d msg=%s", exc.code, exc.status_code, exc.message
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={"code": exc.code, "message": exc.message, "details": exc.details},
        )

    @app.exception_handler(Exception)
    async def _unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("error no controlado: %s", exc)
        return JSONResponse(
            status_code=500,
            content={
                "code": "internal_error",
                "message": "Error interno del servidor.",
                "details": {},
            },
        )

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=False)
