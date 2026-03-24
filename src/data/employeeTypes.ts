/**
 * Los 32 perfiles de empleados que CanTrack ofrece a las empresas.
 * Actualiza los campos name, category y description con los nombres reales.
 */
export interface EmployeeType {
  id: string;
  name: string;           // Nombre del cargo/perfil
  category: string;       // Categoría agrupadora (mostrada como heading en el selector)
  description: string;    // Descripción breve — usada en el cuerpo del correo
  icon?: string;          // Emoji representativo (opcional)
}

export const EMPLOYEE_TYPES: EmployeeType[] = [
  // ── Producción / Operaciones ───────────────────────────────────────────────
  { id: 'op-01', name: 'Operario de Producción',       category: 'Producción',  icon: '⚙️',  description: 'Experiencia en líneas de ensamblaje, manejo de maquinaria industrial y control de calidad.' },
  { id: 'op-02', name: 'Auxiliar de Bodega',           category: 'Producción',  icon: '📦',  description: 'Gestión de inventarios, picking, packing y manejo de montacargas.' },
  { id: 'op-03', name: 'Técnico de Mantenimiento',     category: 'Producción',  icon: '🔧',  description: 'Mantenimiento preventivo y correctivo de equipos industriales y eléctricos.' },
  { id: 'op-04', name: 'Técnico Mecánico',             category: 'Producción',  icon: '🛠️',  description: 'Reparación y ajuste de maquinaria pesada, motores y sistemas hidráulicos.' },
  { id: 'op-05', name: 'Soldador',                     category: 'Producción',  icon: '🔥',  description: 'Certificado en soldadura MIG, TIG y por arco. Procesa metales ferrosos y no ferrosos.' },
  { id: 'op-06', name: 'Electricista Industrial',      category: 'Producción',  icon: '⚡',  description: 'Instalación y mantenimiento de tableros eléctricos, motores y automatización PLC.' },

  // ── Logística / Cadena de Suministro ──────────────────────────────────────
  { id: 'lg-01', name: 'Conductor / Repartidor',       category: 'Logística',   icon: '🚛',  description: 'Licencia C2/C3 vigente. Distribución urbana y de última milla.' },
  { id: 'lg-02', name: 'Coordinador de Logística',     category: 'Logística',   icon: '🗂️',  description: 'Planificación de rutas, coordinación con proveedores y control de indicadores.' },
  { id: 'lg-03', name: 'Operador de Montacargas',      category: 'Logística',   icon: '🏗️',  description: 'Certificado en montacargas contrabalanceado y retráctil. Manejo en altas alturas.' },
  { id: 'lg-04', name: 'Auxiliar de Despachos',        category: 'Logística',   icon: '📋',  description: 'Preparación de órdenes, verificación de guías y cargue de vehículos.' },

  // ── Construcción / Infraestructura ────────────────────────────────────────
  { id: 'co-01', name: 'Maestro de Obra',              category: 'Construcción', icon: '🏗️',  description: 'Dirección de cuadrillas, lectura de planos y acabados en construcción civil.' },
  { id: 'co-02', name: 'Ayudante de Construcción',    category: 'Construcción', icon: '🧱',  description: 'Mezcla de materiales, andamiaje y apoyo en labores civiles generales.' },
  { id: 'co-03', name: 'Pintor Industrial',            category: 'Construcción', icon: '🎨',  description: 'Aplicación de pinturas epóxicas, anticorrosivos y recubrimientos industriales.' },
  { id: 'co-04', name: 'Plomero / Gasfitero',          category: 'Construcción', icon: '🚿',  description: 'Instalación y reparación de redes hidrosanitarias en proyectos residenciales e industriales.' },

  // ── Servicios Generales ────────────────────────────────────────────────────
  { id: 'sg-01', name: 'Personal de Aseo',             category: 'Servicios',   icon: '🧹',  description: 'Limpieza y desinfección de plantas industriales, oficinas y espacios comunes.' },
  { id: 'sg-02', name: 'Vigilante / Guardia',          category: 'Servicios',   icon: '🛡️',  description: 'Licencia de funcionamiento vigente. Control de acceso, rondas y manejo de CCTV.' },
  { id: 'sg-03', name: 'Jardinero',                    category: 'Servicios',   icon: '🌿',  description: 'Mantenimiento de zonas verdes, poda especializada y manejo de maquinaria de jardín.' },
  { id: 'sg-04', name: 'Mensajero / Courier',          category: 'Servicios',   icon: '✉️',  description: 'Distribución de documentos y paquetes a nivel urbano. Manejo de motocicleta.' },

  // ── Administración y Finanzas ─────────────────────────────────────────────
  { id: 'ad-01', name: 'Auxiliar Contable',            category: 'Administración', icon: '📊', description: 'Manejo de cuentas por pagar/cobrar, conciliaciones y elaboración de informes.' },
  { id: 'ad-02', name: 'Asistente Administrativo',     category: 'Administración', icon: '🖥️', description: 'Gestión documental, atención al cliente, manejo de Office y CRM.' },
  { id: 'ad-03', name: 'Recepcionista',                category: 'Administración', icon: '☎️', description: 'Atención presencial y telefónica, manejo de agenda y correspondencia.' },
  { id: 'ad-04', name: 'Auxiliar de Nómina y RRHH',    category: 'Administración', icon: '👥', description: 'Liquidación de nómina, seguridad social, novedades y afiliaciones.' },

  // ── Ventas y Mercadeo ─────────────────────────────────────────────────────
  { id: 'vt-01', name: 'Asesor Comercial',             category: 'Ventas',      icon: '💼',  description: 'Prospección, seguimiento y cierre de negocios B2B y B2C.' },
  { id: 'vt-02', name: 'Promotor de Ventas',           category: 'Ventas',      icon: '📣',  description: 'Impulso en punto de venta, activaciones de marca y manejo de material POP.' },
  { id: 'vt-03', name: 'Mercaderista',                 category: 'Ventas',      icon: '🛒',  description: 'Gestión de exhibición en cadenas y tiendas. Control de inventarios en PDV.' },
  { id: 'vt-04', name: 'Telemercaderista',             category: 'Ventas',      icon: '🎧',  description: 'Contacto en frío, recuperación de cartera y agendamiento de citas comerciales.' },

  // ── Tecnología ────────────────────────────────────────────────────────────
  { id: 'ti-01', name: 'Técnico de Soporte IT',        category: 'Tecnología',  icon: '💻',  description: 'Soporte de primer y segundo nivel, redes LAN/WAN, impresoras y estaciones de trabajo.' },
  { id: 'ti-02', name: 'Desarrollador de Software',    category: 'Tecnología',  icon: '👨‍💻', description: 'Full-stack Junior/Senior. Stack según necesidad del cliente.' },

  // ── Salud y Seguridad ─────────────────────────────────────────────────────
  { id: 'ss-01', name: 'Auxiliar de Enfermería',       category: 'Salud',       icon: '🏥',  description: 'Registro de signos vitales, primeros auxilios y apoyo en áreas de salud ocupacional.' },
  { id: 'ss-02', name: 'Inspector HSEQ',               category: 'Salud',       icon: '⛑️',  description: 'Implementación de SG-SST, inspecciones, investigación de accidentes y EPP.' },

  // ── Gastronomía ───────────────────────────────────────────────────────────
  { id: 'ga-01', name: 'Cocinero / Chef',              category: 'Gastronomía', icon: '👨‍🍳', description: 'Producción de alimentos en volumen, manejo de cocina caliente y BPM.' },
  { id: 'ga-02', name: 'Auxiliar de Cocina',           category: 'Gastronomía', icon: '🍽️',  description: 'Mise en place, limpieza de cocina y apoyo en servicio de casino empresarial.' },
];

/** Todas las categorías únicas, en el orden de aparición */
export const EMPLOYEE_CATEGORIES = [...new Set(EMPLOYEE_TYPES.map(e => e.category))];
