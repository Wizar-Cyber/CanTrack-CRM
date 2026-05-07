# syntax=docker/dockerfile:1.6

# ================================================================
# Stage 1: build (instala dependencias en un venv aislado)
# ================================================================
FROM python:3.10-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Dependencias de build para ortools (wheels suelen estar disponibles, esto es belt-and-suspenders)
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Crear venv aislado para copiar limpio al runtime
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt


# ================================================================
# Stage 2: runtime (slim, sin compiladores)
# ================================================================
FROM python:3.10-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    APP_HOME=/app

# curl para healthcheck; tini para señales
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        tini \
    && rm -rf /var/lib/apt/lists/*

# Usuario no-root
RUN groupadd --system app && useradd --system --gid app --home-dir ${APP_HOME} app

WORKDIR ${APP_HOME}

# Copiar venv del builder
COPY --from=builder /opt/venv /opt/venv

# Copiar código (orden por cambio: lo más estable primero)
COPY alembic.ini ./alembic.ini
COPY alembic ./alembic
COPY app ./app
COPY frontend ./frontend

# Crear directorio de datos y darle permisos a app
RUN mkdir -p ${APP_HOME}/data && chown -R app:app ${APP_HOME}

USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl --fail --silent http://127.0.0.1:8000/api/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
