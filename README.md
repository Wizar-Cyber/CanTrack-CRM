# CanTrack CRM

CRM para rastreo de aplicaciones de trabajo e inteligencia de empresas en el mercado canadiense.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19 + TypeScript + Tailwind CSS |
| Backend | Express + Node.js (`server.ts`) |
| Auth + Firestore | Firebase (Auth + Firestore named DB) |
| Base de datos | PostgreSQL (empresas, trabajos) |
| IA | Google Gemini |

---

## Configuración inicial

### 1. Instalar dependencias
```bash
npm install
```

### 2. Configurar variables de entorno
Copia `.env.example` a `.env` (ya incluido) y completa los valores:
```env
GEMINI_API_KEY=tu_clave_aqui
DATABASE_URL=postgresql://user:password@host:5432/cantrack
APP_URL=http://localhost:3000
```

### 3. Configurar base de datos PostgreSQL
Ejecuta el schema SQL en tu base de datos:
```bash
psql $DATABASE_URL -f db/schema.sql
```

### 4. Iniciar el servidor
```bash
npm run dev
```
Abre [http://localhost:3000](http://localhost:3000)

---

## Estructura del proyecto

```
cantrack-crm/
├── db/
│   └── schema.sql              # Schema y seed de PostgreSQL
├── server/
│   └── services/               # Lógica del backend (Express)
│       ├── automation.service.ts
│       ├── gemini.service.ts
│       ├── greenhouse.service.ts
│       ├── lever.service.ts
│       └── portal-detector.ts
├── src/
│   ├── components/             # Componentes React por módulo
│   │   ├── Auth/
│   │   ├── Companies/
│   │   ├── Dashboard/
│   │   ├── Jobs/
│   │   ├── Layout/
│   │   └── Settings/
│   ├── contexts/
│   │   └── AuthContext.tsx     # Firebase Auth + Firestore
│   ├── services/               # Servicios del frontend
│   ├── firebase.ts             # Inicialización Firebase
│   ├── types.ts                # Tipos TypeScript globales
│   └── App.tsx                 # Rutas principales
├── firebase-applet-config.json # Config Firebase SDK
├── firestore.rules             # Reglas de seguridad Firestore
├── server.ts                   # Entry point del servidor Express
└── .env                        # Variables de entorno (NO commitear)
```

---

## Firebase

La app usa una base de datos Firestore con ID `ai-studio-1a0f9521-74ae-414d-8ab1-342bc2982481`.
Las reglas de seguridad están en `firestore.rules`.

Para desplegar reglas:
```bash
firebase deploy --only firestore:rules
```

