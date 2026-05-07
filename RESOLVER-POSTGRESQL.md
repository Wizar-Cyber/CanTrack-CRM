# 🔧 Resolver Conectividad PostgreSQL

## Problema Actual

El contenedor CanTrack no puede conectar a PostgreSQL de CasaOS porque `host.docker.internal:5432` no funciona dentro del contenedor.

## Solución 1: Usar PostgreSQL Integrado en docker-compose.yml ⭐ RECOMENDADO

Esto es lo más fácil para desarrollo y testing:

### Paso 1: Descomentar PostgreSQL en docker-compose.yml

```yaml
services:
  # Descomentar esta sección:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: cantrack
      POSTGRES_PASSWORD: cantrack
      POSTGRES_DB: cantrack
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5433:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U cantrack"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - default

volumes:
  postgres_data:
```

### Paso 2: Actualizar DATABASE_URL en .env

```env
# Cambiar de:
DATABASE_URL=postgresql://casaos:casaos@host.docker.internal:5432/casaos

# A:
DATABASE_URL=postgresql://cantrack:cantrack@postgres:5432/cantrack
```

### Paso 3: Reiniciar servicios

```bash
docker compose down
docker compose up -d
```

**Ventaja**: Funciona inmediatamente, aislado en la red de Docker
**Desventaja**: Datos de PostgreSQL no persisten si eliminas el volumen

---

## Solución 2: Usar PostgreSQL de CasaOS con Network Bridge

Para compartir PostgreSQL de CasaOS con los contenedores:

### Paso 1: Obtener IP del host desde Docker

```bash
docker inspect cantrack-app-1 | grep Gateway
# O:
docker run --rm alpine:latest ip route | grep default | awk '{print $3}'
```

Esto te dará algo como `172.17.0.1` o similar.

### Paso 2: Actualizar DATABASE_URL

```env
# Obtener la IP del host (ej: 172.17.0.1)
DATABASE_URL=postgresql://casaos:casaos@172.17.0.1:5432/casaos
```

### Paso 3: Reiniciar app

```bash
docker compose down app
docker compose up -d app
```

**Ventaja**: Datos persisten en CasaOS, una sola BD
**Desventaja**: Depende de que CasaOS esté corriendo, IP puede cambiar

---

## Solución 3: Modificar docker-compose.yml para acceso a host

Actualizar el service `app` en docker-compose.yml:

```yaml
app:
  build: .
  ports:
    - "3000:3000"
  environment:
    - NODE_ENV=production
    - DATABASE_URL=postgresql://casaos:casaos@host.docker.internal:5432/casaos
  env_file:
    - .env
  restart: unless-stopped
  extra_hosts:
    - "host.docker.internal:host-gateway"  # ← Asegurar que esto esté
  network_mode: "host"  # ← O esto (menos portable)
```

---

## Recomendación Final

**Para desarrollo/testing**: Solución 1 (PostgreSQL integrado)
- Más fácil de configurar
- No depende de CasaOS
- Funciona igual en VPS

**Para producción con CasaOS**: Solución 2 (Network bridge)
- Reutiliza PostgreSQL de CasaOS
- Datos centralizados

**Para VPS en producción**: Solución 1 (PostgreSQL integrado)
- No hay `host.docker.internal` en VPS
- Mejor usar contenedor separado

---

## Test de Conectividad

```bash
# Verificar que PostgreSQL responde
PGPASSWORD=cantrack psql -h localhost -p 5432 -U cantrack -d cantrack -c "SELECT 1;"

# Ver logs del app
docker compose logs -f app

# Probar health endpoint
curl http://localhost:3000/api/health
```

---

## Rollback si algo falla

```bash
# Volver a estado anterior
docker compose down
git checkout docker-compose.yml .env
docker compose up -d
```

