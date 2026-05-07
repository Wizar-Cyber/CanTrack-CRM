# Routes Optimizer — Microservicio de Optimización de Rutas

Microservicio FastAPI para crear, optimizar y ejecutar rutas de entrega o servicio en **Quebec, Canadá**. Geocoding contra Mapbox (con caché en DB), optimización con OR-Tools (Vehicle Routing Problem), persistencia async con SQLAlchemy, frontend vanilla mobile-first servido en la misma origin, y empaquetado con Docker para desplegar en una VPS modesta.

Diseñado para ser desplegado mañana, no la próxima semana.

---

## Tabla de contenidos

1. [Arquitectura y decisiones](#arquitectura)
2. [Setup local (desarrollo)](#setup-local)
3. [Configuración de Mapbox](#mapbox)
4. [Endpoints HTTP](#endpoints)
5. [Despliegue en VPS Hostinger con Docker + Nginx + HTTPS](#despliegue)
6. [Migración a Postgres](#postgres)
7. [Migración a OSRM (rutas reales con tráfico)](#osrm)
8. [Estructura del proyecto](#estructura)
9. [Tests](#tests)
10. [Operación: backups, logs, troubleshooting](#operacion)

---

## Arquitectura y decisiones <a id="arquitectura"></a>

**Stack**

- Python 3.10+, FastAPI 0.115, Uvicorn (2 workers en Docker)
- SQLAlchemy 2.x async + aiosqlite por defecto (Postgres con un solo cambio de URL)
- OR-Tools 9.11 — VRP con un dummy node para no forzar regreso al inicio
- Mapbox Geocoding API v6 con bias a Quebec (`country=CA`, `proximity=-73.5673,45.5017`, `language=fr`)
- Frontend HTML+CSS+JS sin frameworks, servido por StaticFiles desde la misma app
- Docker multi-stage, usuario no-root, healthcheck

**Decisiones que importan**

- **Distancia abstracta.** `DistanceCalculator` es una interfaz; el default es `HaversineCalculator`. Para rutas reales con tráfico, escribir `OSRMCalculator` y cambiar una sola línea en `dependencies.py`. Ver sección [OSRM](#osrm).
- **Caché de geocoding en DB.** Las direcciones se normalizan preservando acentos franceses (UTF-8 puro, sin `unidecode`). Cada parada se geocodifica una sola vez por ruta y queda guardada para reusar.
- **Bounding box de Quebec.** Si Mapbox devuelve coordenadas fuera de la caja (por ej. Toronto, Ontario), el endpoint responde `status: out_of_region` en vez de 200 OK silencioso.
- **Confianza por umbral.** El `match_code.confidence` de Mapbox v6 (`exact`/`high`/`medium`/`low`) se mapea a un score numérico. Por debajo de `MIN_GEOCODING_CONFIDENCE` (0.6 por defecto), se devuelve `status: ambiguous` y el frontend muestra los candidatos para que el usuario elija.
- **Soft delete.** Las rutas no se borran físicamente — se marca `deleted_at`. Útil para auditoría y para deshacer.
- **Máquina de estados explícita.** `pending → in_progress`, `in_progress ↔ pending`, `in_progress → completed/cancelled`. `completed` y `cancelled` son terminales. Cualquier otra transición devuelve 400. Marcar todas las paradas como `visited`/`skipped`/`failed` cierra la ruta automáticamente.
- **Soporte futuro multi-usuario.** El campo `user_id` ya existe en `routes` (opcional, indexado). Para activar auth, agregar middleware JWT y filtrar por `user_id` en el repositorio.

---

## Setup local (desarrollo) <a id="setup-local"></a>

Requisitos: Python 3.10+, `pip`, `git`. Opcional: Docker.

```bash
# Clonar
git clone <tu-repo>.git routes-optimizer
cd routes-optimizer

# Entorno virtual
python3 -m venv .venv
source .venv/bin/activate

# Dependencias
pip install -r requirements.txt

# Variables de entorno
cp .env.example .env
# Editar .env y poner tu MAPBOX_TOKEN real

# Crear DB y aplicar schema
mkdir -p data
alembic upgrade head

# Arrancar
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Abrir en el navegador:

- Frontend: <http://localhost:8000/>
- Docs OpenAPI: <http://localhost:8000/docs>
- Health: <http://localhost:8000/api/health>

### Tests

```bash
pytest -q
```

62 tests, ninguno toca la red real (Mapbox está mockeado con `respx`).

### Levantar con Docker (idéntico a producción)

```bash
docker compose up -d
docker compose logs -f
```

El volumen `./data` persiste la base SQLite entre reinicios.

---

## Configuración de Mapbox <a id="mapbox"></a>

1. Crear cuenta gratis en <https://account.mapbox.com/auth/signup/>.
2. Ir a <https://account.mapbox.com/access-tokens/> y copiar el **default public token** (empieza con `pk.`).
3. Pegarlo en `.env` como `MAPBOX_TOKEN=pk....`.

El **free tier de Mapbox son 100,000 requests/mes** de geocoding, suficiente para una operación pequeña-mediana — sobre todo porque el caché en DB evita re-geocodificar la misma dirección. Para una flota de 10 técnicos con 20 paradas/día, son ~6,000 requests/mes en el peor caso (sin caché). En la práctica, después de la primera semana las direcciones recurrentes dejan de tocar Mapbox.

Si excedes el límite, Mapbox empieza a cobrar a partir de USD 0.75 por 1,000 requests adicionales — y la app respeta `Retry-After` automáticamente para 429.

---

## Endpoints HTTP <a id="endpoints"></a>

Base: `http://localhost:8000`

| Verbo  | Ruta                                          | Descripción                                       |
|--------|-----------------------------------------------|---------------------------------------------------|
| GET    | `/api/health`                                 | Health check                                      |
| POST   | `/api/geocode`                                | Geocodificar una dirección suelta                 |
| POST   | `/api/routes`                                 | Crear y optimizar una ruta                        |
| GET    | `/api/routes`                                 | Listar rutas (con filtros y paginación)           |
| GET    | `/api/routes/{id}`                            | Detalle completo de una ruta                      |
| PATCH  | `/api/routes/{id}/status`                     | Cambiar estado (pending/in_progress/completed/cancelled) |
| PATCH  | `/api/routes/{id}/stops/{stop_id}`            | Marcar parada como visited/skipped/failed         |
| DELETE | `/api/routes/{id}`                            | Soft delete                                       |

### Ejemplos `curl`

**Health**

```bash
curl http://localhost:8000/api/health
```

**Geocodificar**

```bash
curl -X POST http://localhost:8000/api/geocode \
  -H "Content-Type: application/json" \
  -d '{"address": "1200 Avenue McGill College, Montréal, QC"}'
```

Posibles `status` en la respuesta:

- `ok`: tiene `lat`, `lng`, `confidence`.
- `ambiguous`: confianza baja; viene `candidates[]` con hasta 3 opciones.
- `out_of_region`: la dirección existe pero está fuera del bounding box de Quebec.
- `not_found`: Mapbox no encontró nada.

**Crear ruta**

```bash
curl -X POST http://localhost:8000/api/routes \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Tournée du mardi",
    "start_address": "1200 Avenue McGill College, Montréal, QC",
    "stops": [
      "11000 Rue Mirabeau, Anjou, Montréal, QC",
      "5710 Rue Garnier, Montréal, QC",
      "129 Montée du Moulin, Laval, QC"
    ],
    "return_to_start": false,
    "average_speed_kmh": 35,
    "notes": "Livraisons Brocheusses"
  }'
```

Devuelve `201` con el objeto completo: paradas en orden óptimo, distancias por leg, distancia total, tiempo estimado.

**Listar rutas (con filtros)**

```bash
# Todas
curl http://localhost:8000/api/routes

# Filtrar por estado y paginar
curl "http://localhost:8000/api/routes?status=in_progress&limit=20&offset=0"

# Por rango de fechas
curl "http://localhost:8000/api/routes?from_date=2026-04-01T00:00:00Z&to_date=2026-04-30T23:59:59Z"
```

**Iniciar ruta**

```bash
curl -X PATCH http://localhost:8000/api/routes/<id>/status \
  -H "Content-Type: application/json" \
  -d '{"status": "in_progress", "current_stop_index": 0}'
```

**Marcar parada visitada**

```bash
curl -X PATCH http://localhost:8000/api/routes/<route_id>/stops/<stop_id> \
  -H "Content-Type: application/json" \
  -d '{"status": "visited", "notes": "Livré au concierge"}'
```

Si era la última parada pendiente, la ruta pasa a `completed` automáticamente.

**Pausar y retomar al día siguiente**

```bash
# Pausar (in_progress → pending)
curl -X PATCH http://localhost:8000/api/routes/<id>/status \
  -d '{"status": "pending"}' -H "Content-Type: application/json"

# Al día siguiente — la ruta sigue ahí, las paradas visitadas también
curl http://localhost:8000/api/routes/<id>
curl -X PATCH http://localhost:8000/api/routes/<id>/status \
  -d '{"status": "in_progress"}' -H "Content-Type: application/json"
```

**Soft delete**

```bash
curl -X DELETE http://localhost:8000/api/routes/<id>
# 204 No Content. El registro queda en DB con deleted_at != NULL.
```

### Errores

Forma estándar:

```json
{
  "code": "not_found | invalid_state_transition | geocoding_ambiguous | ...",
  "message": "Texto humano en español/francés",
  "details": { /* contexto extra */ }
}
```

| Código HTTP | Cuándo                                                                  |
|-------------|-------------------------------------------------------------------------|
| 400         | Validación fallida o transición de estado inválida                      |
| 404         | Ruta o parada no encontrada                                             |
| 422         | Geocoding: ambiguous / out_of_region / not_found (al crear la ruta)     |
| 502         | Mapbox cayó (se intentó N retries)                                      |
| 500         | Bug — revisar logs                                                      |

---

## Despliegue en VPS Hostinger con Docker + Nginx + HTTPS <a id="despliegue"></a>

Probado en **Hostinger VPS KVM 2** (2 vCPU, 8 GB RAM, Ubuntu 22.04 LTS) — recursos sobrados para esta carga.

### 1. Preparar el servidor

SSH como root:

```bash
ssh root@<ip-de-tu-vps>
```

Actualizar e instalar dependencias:

```bash
apt update && apt upgrade -y
apt install -y curl git ufw nginx certbot python3-certbot-nginx

# Docker (script oficial)
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
```

Firewall:

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
```

### 2. Clonar y configurar la app

```bash
mkdir -p /opt
cd /opt
git clone <tu-repo>.git routes-optimizer
cd routes-optimizer

cp .env.example .env
nano .env
# Poner el MAPBOX_TOKEN real, APP_ENV=production, CORS_ORIGINS=https://tu-dominio.com
```

Crear el directorio de datos (el volumen):

```bash
mkdir -p data
```

### 3. Arrancar con docker compose

```bash
docker compose up -d
docker compose ps
docker compose logs --tail=50

# Verificar que responde dentro del host
curl http://127.0.0.1:8000/api/health
```

La app escucha en `127.0.0.1:8000` desde docker compose; **no se expone públicamente**, Nginx hará de proxy.

### 4. Configurar Nginx como reverse proxy

Crear `/etc/nginx/sites-available/routes-optimizer`:

```nginx
server {
    listen 80;
    server_name tu-dominio.com;

    # Tamaño razonable de payload (la API recibe arreglos JSON, no archivos)
    client_max_body_size 1M;

    # Logs separados
    access_log /var/log/nginx/routes-optimizer.access.log;
    error_log  /var/log/nginx/routes-optimizer.error.log;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts razonables para geocoding lento
        proxy_connect_timeout 15s;
        proxy_send_timeout    30s;
        proxy_read_timeout    30s;
    }
}
```

Activar el sitio:

```bash
ln -s /etc/nginx/sites-available/routes-optimizer /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

Apuntar tu dominio al IP de la VPS (registro A en tu DNS) y esperar propagación.

### 5. HTTPS gratis con Let's Encrypt

```bash
certbot --nginx -d tu-dominio.com
```

Certbot edita el bloque server, agrega el `listen 443 ssl`, y arma un cronjob de renovación. Verificar:

```bash
certbot renew --dry-run
```

### 6. Actualizar la app (deploy de nueva versión)

```bash
cd /opt/routes-optimizer
git pull
docker compose build
docker compose up -d
docker compose logs --tail=100
```

Si cambian los modelos:

```bash
# Generar migración (en local primero)
alembic revision --autogenerate -m "descripción del cambio"
# Commit + push, luego en el server:
git pull
docker compose run --rm api alembic upgrade head
docker compose up -d
```

---

## Migración a Postgres <a id="postgres"></a>

SQLite va bien para una sola persona y pocas rutas/día. Si hay más de un usuario simultáneo o más de 10,000 rutas históricas, conviene Postgres.

1. Levantar Postgres (managed o en otro container).
2. En `.env`:

   ```
   DATABASE_URL=postgresql+asyncpg://usuario:contraseña@host:5432/routes
   ```

3. Aplicar el schema:

   ```bash
   alembic upgrade head
   ```

4. Reiniciar la app: `docker compose restart`.

No hay nada más que tocar — el código no usa SQLite-specifics.

---

## Migración a OSRM (rutas reales con tráfico) <a id="osrm"></a>

Haversine sobreestima distancias en zonas urbanas (asume línea recta). Para rutas reales:

1. Levantar un OSRM server con datos de Quebec (existe la opción `osrm-backend` en Docker; el extracto de Quebec de Geofabrik pesa ~250 MB).
2. Implementar el adaptador:

   ```python
   # app/services/osrm_calculator.py
   import httpx
   from app.services.distance_calculator import DistanceCalculator

   class OSRMCalculator(DistanceCalculator):
       def __init__(self, base_url: str, http: httpx.AsyncClient):
           self._base = base_url
           self._http = http

       def between(self, a, b):
           # OSRM /route/v1/driving/{lng1},{lat1};{lng2},{lat2}
           # Llamar y devolver distance/1000 (km).
           ...
   ```

3. Cambiar la única línea en `app/controllers/dependencies.py`:

   ```python
   def distance_calculator() -> DistanceCalculator:
       return OSRMCalculator(settings.osrm_url, get_http_client())
   ```

El optimizador y el resto del código no se enteran. Tests siguen pasando con `HaversineCalculator` (el default).

---

## Estructura del proyecto <a id="estructura"></a>

```
routes-optimizer/
├── app/
│   ├── main.py                  # create_app, lifespan, exception handlers
│   ├── exceptions.py            # AppError + subclases tipadas
│   ├── controllers/
│   │   └── dependencies.py      # DI: HTTP client, repos, services
│   ├── routes/                  # Endpoints HTTP
│   │   ├── health_endpoints.py
│   │   ├── geocoding_endpoints.py
│   │   └── routes_endpoints.py
│   ├── services/                # Lógica de negocio
│   │   ├── distance_calculator.py   # Interfaz + Haversine
│   │   ├── geocoding_service.py     # Mapbox v6 + cache + retry
│   │   ├── route_optimizer.py       # OR-Tools VRP
│   │   └── route_service.py         # Orquesta todo + state machine
│   ├── repositories/            # SQL aislado
│   │   ├── route_repository.py
│   │   └── geocoding_cache_repository.py
│   ├── models/
│   │   ├── db.py                # SQLAlchemy Mapped types
│   │   └── schemas.py           # Pydantic v2
│   └── utils/
│       ├── config.py            # Pydantic Settings
│       ├── database.py          # Engine + session factory async
│       └── logger.py
├── alembic/                     # Migraciones
├── frontend/                    # HTML + CSS + JS vanilla, mobile-first
├── tests/                       # 62 tests, ninguno toca la red real
├── Dockerfile                   # Multi-stage, non-root, healthcheck
├── docker-compose.yml
├── requirements.txt
├── alembic.ini
├── pytest.ini
├── .env.example
└── README.md
```

---

## Tests <a id="tests"></a>

```bash
pytest -q
```

- **`test_optimizer.py`** — Haversine, OR-Tools (return_to_start true/false, performance con 30 paradas, optimización vence al orden naive).
- **`test_geocoding.py`** — Cache hit/miss, normalización con acentos, baja confianza → ambiguous, fuera de Quebec → out_of_region, retry 429 con `Retry-After`, agotamiento de retries en 5xx → `MapboxUnavailableError`, sin retry en 4xx.
- **`test_routes.py`** — Repositorio (add/get/list/soft_delete/filtros/paginación), máquina de estados (transiciones válidas e inválidas, terminales), update_stop, auto-completion al cerrar la última parada.
- **`test_e2e.py`** — Flujo completo a través de FastAPI: crear → listar → detalle → in_progress → visitar paradas → completed automático → soft delete. 5 direcciones reales en Quebec, Mapbox mockeado con `respx`.

---

## Operación: backups, logs, troubleshooting <a id="operacion"></a>

### Backups (SQLite)

La DB vive en `./data/routes.db`. Para un cron diario:

```bash
# /etc/cron.d/routes-backup
0 3 * * * root cp /opt/routes-optimizer/data/routes.db /opt/routes-optimizer/backups/routes-$(date +\%Y\%m\%d).db && find /opt/routes-optimizer/backups -name "routes-*.db" -mtime +30 -delete
```

Si pasaste a Postgres, usar `pg_dump` en su lugar.

### Logs

```bash
# Logs de la app
docker compose logs -f --tail=200

# Logs de Nginx
tail -f /var/log/nginx/routes-optimizer.access.log
tail -f /var/log/nginx/routes-optimizer.error.log
```

Los logs de la app están limitados a 10 MB × 3 archivos por servicio (rotación automática vía driver `json-file` en `docker-compose.yml`).

### Troubleshooting rápido

| Síntoma                                     | Causa probable                                  | Acción                                                               |
|---------------------------------------------|-------------------------------------------------|----------------------------------------------------------------------|
| `502 Bad Gateway` desde Nginx               | Container caído                                 | `docker compose ps`, `docker compose logs`                           |
| `geocoding_failed` en respuestas            | Token inválido o expirado                       | Revisar `MAPBOX_TOKEN`, ver logs                                     |
| `mapbox_unavailable`                        | Mapbox tiene un incidente                       | Esperar; el cliente reintenta automáticamente con backoff            |
| Tiempos altos al crear ruta                 | Caché vacío + muchas paradas nuevas             | Normal la primera vez; las siguientes deberían ser <1s               |
| `out_of_region` con dirección que sí es QC  | Geocoding cayó en otra ciudad homónima          | Agregar más detalle: ciudad, código postal                           |
| DB corrupta (SQLite)                        | Caída brusca con escritura en curso             | Restaurar desde backup; SQLite es robusto pero no infalible          |

### Performance esperada

- Geocoding con caché caliente: **<50 ms**.
- Geocoding contra Mapbox: **~300–800 ms** por dirección.
- Crear una ruta de 30 paradas con todo en caché: **<1 s** total (geocoding + OR-Tools + persistencia).
- OR-Tools sólo (sin geocoding) para 30 nodos: **~50–200 ms**.

Si las cifras divergen mucho de esto, sospechar primero del network entre la VPS y `api.mapbox.com`.

---

## Licencia y créditos

Privado / interno. Mapbox tiene su propia licencia para los datos geográficos — revisar [Mapbox Terms of Service](https://www.mapbox.com/legal/tos/) antes de cachear masivamente o redistribuir resultados.
