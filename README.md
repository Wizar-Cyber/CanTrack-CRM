# CanTrack CRM

Sistema CRM completo para rastreo de aplicaciones de trabajo e inteligencia de empresas en el mercado canadiense.

---

## Stack

| Componente | Tecnología |
|------------|-------------|
| Frontend | React 19 + TypeScript + Tailwind CSS |
| Backend | Express + Node.js (server.ts) |
| Base de datos | PostgreSQL |
| IA | Google Gemini + Groq |
| Optimización rutas | Optimus_rutas (Python/FastAPI) |

---

## Desarrollo Local

### 1. Instalar dependencias
```bash
npm install
```

### 2. Configurar variables de entorno
```bash
cp .env.example .env
# Editar .env con tus datos
```

### 3. Iniciar el servidor
```bash
npm run dev
```
Abre [http://localhost:3000](http://localhost:3000)

---

## Deployment VPS

### Requisitos previos

1. **SSH Tunnel** (desde tu PC local):
```bash
ssh -L 5434:127.0.0.1:5432 root@187.124.237.242 -N
```

2. **PostgreSQL** debe estar corriendo en tu PC (a través del tunnel)

### Pasos de instalación

```bash
# 1. Conectar al VPS
ssh root@187.124.237.242

# 2. Crear directorio y clonar
mkdir -p /var/www/cantrack
cd /var/www/cantrack
git clone https://github.com/Wizar-Cyber/CanTrack-CRM.git .

# 3. Crear archivo .env
cp .env.example .env
nano .env
```

#### Contenido mínimo de .env:
```env
PORT=3000
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
JWT_SECRET=genera-una-clave-segura-aqui
DATABASE_URL=postgresql://casaos:casaos@host.docker.internal:5434/casaos
GROQ_API_KEY=tu-groq-api-key
WEBHOOK_SECRET=genera-una-clave
APP_URL=http://187.124.237.242:8888
```

```bash
# 4. Instalar dependencias
npm ci

# 5. Iniciar CanTrack (en background)
npm run dev &

# 6. Verificar funciona
curl http://localhost:3000/api/health
```

### Optimus_rutas (opcional - para optimización de rutas)

```bash
# 1. En otra terminal o como servicio separado
cd /var/www
git clone https://github.com/Wizar-Cyber/Optimus_rutas.git optimus-rutas

# 2. Instalar Python
apt install -y python3 python3-pip python3-venv

# 3. Crear entorno virtual
python3 -m venv venv
source venv/bin/activate

# 4. Instalar dependencias
pip install -r requirements.txt

# 5. Iniciar (en background)
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
```

### Nginx como reverse proxy (opcional)

```bash
# Instalar nginx
apt install -y nginx

# Copiar configuración
cp nginx.conf /etc/nginx/nginx.conf

# Recargar
nginx -s reload
```

### Acceso

- **CanTrack CRM**: http://187.124.237.242:3000
- **Optimus_rutas**: http://187.124.237.242:8000 (opcional)

---

## Estructura del proyecto

```
cantrack-crm/
├── server.ts                    # Entry point backend
├── server/
│   ├── routes/                  # Endpoints API
│   ├── services/                # Lógica de negocio
│   ├── automation/               # Tareas automáticas
│   └── utils/                    # Utilidades
├── src/
│   ├── components/              # Componentes React
│   ├── contexts/                 # React Context
│   ├── services/                # Servicios frontend
│   └── types.ts                  # Tipos TypeScript
├── Optimus_rutas/               # Sistema optimización rutas (Python)
├── docker-compose.yml           # Orquestación Docker
├── nginx.conf                   # Config Nginx
└── .env.example                 # Variables entorno ejemplo
```

---

## Endpoints API principales

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | /api/auth/login | Iniciar sesión |
| GET | /api/companies | Listar empresas |
| POST | /api/companies | Crear empresa |
| GET | /api/jobs | Listar vacantes |
| GET | /api/stats | Estadísticas |
| POST | /api/routes/optimize | Optimizar ruta (llama a Optimus_rutas) |

---

## Integración con Optimus_rutas

CanTrack se conecta a Optimus_rutas para optimizar rutas:

1. CanTrack guarda las stops de la ruta en PostgreSQL
2. Llama a `POST http://localhost:8000/api/optimize`
3. Optimus_rutas devuelve la ruta optimizada
4. CanTrack muestra el resultado en el mapa

Para habilitar, configura en `.env`:
```env
OPTIMUS_URL=http://localhost:8000
```

---

## Troubleshooting

### Error: Cannot find module
Reinstalar dependencias:
```bash
rm -rf node_modules
npm ci
```

### Error: Database connection
Verificar que el SSH tunnel está activo:
```bash
# En tu PC local
ssh -L 5434:127.0.0.1:5432 root@187.124.237.242 -N
```

### Ver logs
```bash
pm2 logs                    # si usa PM2
tail -f /var/log/cantrack.log  # si corre directamente
```

---

## Licencia

MIT