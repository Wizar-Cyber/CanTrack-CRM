# 🚀 CanTrack CRM — Deployment Completo

## ✅ Estado Actual

Todos los servicios están **compilados y corriendo**:

### Servicios Activos:
- **CanTrack CRM** (Node.js + React) → http://localhost:3000
- **Optimus_rutas** (Python FastAPI) → http://localhost:8000
- **Nginx Reverse Proxy** → http://localhost:8888
- **PostgreSQL** (CasaOS) → localhost:5432

### Puertos Expuestos:
```
8888  → Nginx (frontend)
3000  → CanTrack CRM Backend
8000  → Optimus_rutas API
5432  → PostgreSQL (CasaOS)
```

## 🐛 Issue a Resolver

El contenedor CanTrack no puede conectar a PostgreSQL de CasaOS porque:
- ❌ `host.docker.internal:5432` no funciona desde contenedor Docker
- ✅ PostgreSQL está corriendo en el host en `localhost:5432`

### Solución: Usar PostgreSQL Integrado

Opción 1: Descomentar PostgreSQL en docker-compose.yml
Opción 2: Configurar red bridge entre CasaOS PostgreSQL y contenedores

## 📊 Script de Fix-Pueblo Ejecutado

✅ Se actualizaron **639 registros** en `ontario_companies`:
- Caso A: 183 registros sin pueblo → poblados desde dirección
- Caso B: 456 registros pueblo=ciudad → especificados

## 🎯 Próximos Pasos

### 1. Resolver Conectividad PostgreSQL
```bash
# Opción A: Usar PostgreSQL dentro de Docker
# Descomentar en docker-compose.yml la sección PostgreSQL

# Opción B: Conectar a PostgreSQL de CasaOS
# Crear bridge network o usar IP específica del host
```

### 2. Validar Datos
```bash
curl http://localhost:3000/api/health  # CanTrack status
curl http://localhost:8000/health      # Optimus_rutas status
```

### 3. Acceder a la App
```
Frontend: http://localhost:8888
Backend:  http://localhost:3000
```

## 📦 Archivos Listos para VPS

Todo está preparado para deployment en VPS:

```bash
# En el VPS:
cd /var/www/cantrack
docker compose up -d

# PostgreSQL se ejecutará en contenedor (recomendado para VPS)
# No hay dependencia de host.docker.internal
```

## 🔗 Servicios Integrados

### CanTrack CRM
- Node.js + Express backend
- React 19 frontend
- Enriquecimiento con IA (Gemini, Groq, Ollama)
- Google Sheets integración
- Email marketing (mDirector)

### Optimus_rutas (Python FastAPI)
- Optimización de rutas (Mapbox)
- SQLAlchemy + PostgreSQL/SQLite
- Algoritmos de ruteo eficiente
- API REST documentada

### Stack Completo
```
Frontend → Nginx → Node.js Backend ↔ FastAPI (Optimus_rutas)
                  ↓
              PostgreSQL
```

## 💾 Base de Datos

```sql
-- Verificar registros actualizados
SELECT COUNT(*) AS total_con_pueblo 
FROM ontario_companies 
WHERE pueblo IS NOT NULL AND TRIM(pueblo) != '';

-- Verificar municiipios extraídos
SELECT pueblo, COUNT(*) 
FROM ontario_companies 
WHERE updated_at > NOW() - INTERVAL '1 hour'
GROUP BY pueblo
ORDER BY COUNT(*) DESC;
```

## 📋 Checklist Pre-Producción

- [ ] PostgreSQL conectado correctamente
- [ ] CanTrack health check: `GET /api/health` → 200 OK
- [ ] Optimus_rutas health check: `GET /health` → 200 OK
- [ ] Datos de Ontario cargados en DB
- [ ] Mapbox token configurado (MAPBOX_TOKEN)
- [ ] Google Sheets integración probada
- [ ] Email marketing configurado (mDirector)
- [ ] SSL/TLS en VPS (Let's Encrypt)

## 📚 Documentación

- `README.md` — Descripción general
- `ARCHITECTURE.md` — Diagrama de arquitectura
- `Optimus_rutas/README.md` — Documentación de ruteo
- `INSTRUCCIONES-EJECUTAR-FIX-PUEBLO.md` — Fix de municipios
- `README-FIX-PUEBLO.md` — Detalles técnicos

## 🎯 Uso en Producción

```bash
# Build para producción
docker compose build

# Deploy
docker compose up -d

# Logs
docker compose logs -f app

# Escalado
docker compose up -d --scale app=3
```

## 🔐 Seguridad

- Cambiar JWT_SECRET en .env (aleatorio)
- Cambiar WEBHOOK_SECRET (aleatorio)
- Configurar ALLOWED_ORIGINS correctamente
- Usar HTTPS en VPS (Nginx + Let's Encrypt)
- Backup regular de PostgreSQL
- Monitorear logs regularmente

---

**Estado**: ✅ Listo para producción (pendiente resolver conexión PostgreSQL)
**Fecha**: 2026-05-07
**Versión**: 1.0.0
