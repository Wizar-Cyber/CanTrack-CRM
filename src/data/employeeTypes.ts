/**
 * Los 52 servicios que CanTrack ofrece a las empresas cliente.
 * Cada perfil tiene palabras clave (keywords) para el matching semántico
 * del agente clasificador de vacantes.
 */
export interface EmployeeType {
  id: string;
  number: number;       // número oficial del perfil (1-52)
  name: string;
  category: string;
  description: string;
  icon?: string;
  keywords: string[];   // sinónimos y términos relacionados para clasificación IA
}

export const EMPLOYEE_TYPES: EmployeeType[] = [
  // ── Gastronomía & Alimentos ───────────────────────────────────────────────────
  {
    id: 'ga-empacadores', number: 1,
    name: 'Empacadores',
    category: 'Gastronomía & Alimentos',
    icon: '📦',
    description: 'Personal para empaque, etiquetado y preparación de productos alimenticios en línea de producción.',
    keywords: ['empacador', 'packer', 'packaging', 'embalaje', 'etiquetado', 'picking', 'packing'],
  },
  {
    id: 'ga-meseros', number: 6,
    name: 'Meseros',
    category: 'Gastronomía & Alimentos',
    icon: '🍽️',
    description: 'Atención de mesas, toma de órdenes y servicio al cliente en restaurantes, cafeterías y eventos.',
    keywords: ['mesero', 'waiter', 'server', 'camarero', 'mozo', 'food service', 'servicios de mesa', 'banquetes'],
  },
  {
    id: 'ga-restaurante', number: 24,
    name: 'Restaurante',
    category: 'Gastronomía & Alimentos',
    icon: '🍴',
    description: 'Personal de restaurante: atención al cliente, caja, limpieza y apoyo general en operación.',
    keywords: ['restaurante', 'restaurant worker', 'food service', 'comida', 'cafetería', 'diner', 'food court'],
  },
  {
    id: 'ga-panaderia', number: 28,
    name: 'Panadería',
    category: 'Gastronomía & Alimentos',
    icon: '🍞',
    description: 'Elaboración de pan, pasteles y productos de panadería artesanal e industrial.',
    keywords: ['panadero', 'baker', 'bakery', 'pastelero', 'repostero', 'pastry chef', 'pan', 'pastries'],
  },
  {
    id: 'ga-carniceria', number: 17,
    name: 'Carnicería',
    category: 'Gastronomía & Alimentos',
    icon: '🥩',
    description: 'Corte, procesamiento y manejo de carnes en carnicerías, supermercados y plantas de alimentos.',
    keywords: ['carnicero', 'butcher', 'meat cutter', 'deshuese', 'corte de carne', 'meatpacking'],
  },
  {
    id: 'ga-matadero', number: 47,
    name: 'Matadero',
    category: 'Gastronomía & Alimentos',
    icon: '🏭',
    description: 'Operaciones en plantas de sacrificio y procesamiento de carnes.',
    keywords: ['matadero', 'slaughterhouse', 'meatpacking', 'plant worker', 'procesamiento de carne', 'abattoir'],
  },
  {
    id: 'ga-asistente-cocina', number: 48,
    name: 'Asistente de Cocina',
    category: 'Gastronomía & Alimentos',
    icon: '👨‍🍳',
    description: 'Apoyo en cocina: mise en place, limpieza, preparaciones básicas y manejo de insumos.',
    keywords: ['asistente de cocina', 'kitchen helper', 'prep cook', 'ayudante cocina', 'kitchen staff', 'auxiliar cocina'],
  },
  {
    id: 'ga-chef', number: 49,
    name: 'Chef',
    category: 'Gastronomía & Alimentos',
    icon: '👨‍🍳',
    description: 'Cocinero profesional con experiencia en cocina caliente, fría y gestión de cocina.',
    keywords: ['chef', 'cocinero', 'cook', 'head cook', 'culinary', 'cuisine', 'jefe de cocina', 'line cook'],
  },
  {
    id: 'ga-pizzero', number: 50,
    name: 'Pizzero',
    category: 'Gastronomía & Alimentos',
    icon: '🍕',
    description: 'Elaboración de pizzas artesanales e industriales, manejo de horno y masas.',
    keywords: ['pizzero', 'pizza maker', 'pizza chef', 'pizzaiolo', 'pizza'],
  },
  {
    id: 'ga-bartenders', number: 16,
    name: 'Bartenders',
    category: 'Gastronomía & Alimentos',
    icon: '🍸',
    description: 'Preparación de bebidas, cócteles y atención de barra en bares, restaurantes y eventos.',
    keywords: ['bartender', 'barman', 'barista', 'mixologist', 'bar staff', 'barra', 'cocktails', 'bebidas', 'bar tender'],
  },

  // ── Logística & Transporte ────────────────────────────────────────────────────
  {
    id: 'lg-montacargas', number: 2,
    name: 'Operadores de Montacargas',
    category: 'Logística & Transporte',
    icon: '🏗️',
    description: 'Operación certificada de montacargas contrabalanceado y retráctil en bodegas y plantas.',
    keywords: ['montacargas', 'forklift operator', 'forklift driver', 'operador montacargas', 'fork lift', 'reach truck', 'estibador'],
  },
  {
    id: 'lg-conductores', number: 3,
    name: 'Conductores de Vehículos de Carga',
    category: 'Logística & Transporte',
    icon: '🚛',
    description: 'Conducción de camiones, tractomulas y vehículos de distribución con licencias de transporte.',
    keywords: ['conductor', 'chofer', 'truck driver', 'CDL', 'driver', 'camionero', 'repartidor', 'delivery driver', 'transporte', 'vehículo de carga'],
  },
  {
    id: 'lg-carga-descarga', number: 7,
    name: 'Carga y Descarga',
    category: 'Logística & Transporte',
    icon: '📦',
    description: 'Cargue y descargue de mercancía en muelles, bodegas y centros de distribución.',
    keywords: ['carga y descarga', 'loader', 'unloader', 'dock worker', 'warehouse labor', 'estibador', 'descargue'],
  },
  {
    id: 'lg-mudanzas', number: 32,
    name: 'Mudanzas',
    category: 'Logística & Transporte',
    icon: '🚚',
    description: 'Personal para servicios de mudanza residencial y comercial, carga y embalaje.',
    keywords: ['mudanza', 'mover', 'moving crew', 'relocation', 'furniture mover', 'mudanzas'],
  },
  {
    id: 'lg-domiciliario', number: 40,
    name: 'Domiciliario',
    category: 'Logística & Transporte',
    icon: '🛵',
    description: 'Entrega de pedidos a domicilio en moto o bicicleta para restaurantes, tiendas y plataformas.',
    keywords: ['domiciliario', 'delivery', 'courier', 'repartidor', 'mensajero', 'dispatch', 'last mile'],
  },
  {
    id: 'lg-almacen', number: 18,
    name: 'Almacén',
    category: 'Logística & Transporte',
    icon: '🏭',
    description: 'Gestión de inventarios, recepción, despacho y organización de mercancía en bodega.',
    keywords: ['almacén', 'warehouse worker', 'bodeguero', 'stock clerk', 'inventory', 'almacenista', 'bodega', 'stocking'],
  },

  // ── Construcción & Oficios ────────────────────────────────────────────────────
  {
    id: 'co-soldador', number: 23,
    name: 'Soldador',
    category: 'Construcción & Oficios',
    icon: '🔥',
    description: 'Soldadura MIG, TIG y por arco en estructuras metálicas, tuberías y maquinaria.',
    keywords: ['soldador', 'welder', 'welding', 'MIG', 'TIG', 'soldadura', 'arco', 'metal fabrication'],
  },
  {
    id: 'co-remocion-nieve', number: 25,
    name: 'Remoción de Nieve',
    category: 'Construcción & Oficios',
    icon: '❄️',
    description: 'Limpieza y remoción de nieve en estacionamientos, entradas y propiedades comerciales.',
    keywords: ['remoción de nieve', 'snow removal', 'snow plow', 'salting', 'grounds crew', 'nieve', 'deicing'],
  },
  {
    id: 'co-plomero', number: 26,
    name: 'Plomero',
    category: 'Construcción & Oficios',
    icon: '🚿',
    description: 'Instalación y reparación de redes hidrosanitarias en proyectos residenciales e industriales.',
    keywords: ['plomero', 'plumber', 'gasfitero', 'pipefitter', 'plumbing', 'tubería', 'hidráulica'],
  },
  {
    id: 'co-pintor', number: 27,
    name: 'Pintor',
    category: 'Construcción & Oficios',
    icon: '🎨',
    description: 'Pintura residencial, comercial e industrial. Aplicación de epóxicos y anticorrosivos.',
    keywords: ['pintor', 'painter', 'painting', 'decorator', 'paint', 'painting contractor', 'industrial painter'],
  },
  {
    id: 'co-excavacion', number: 37,
    name: 'Excavación',
    category: 'Construcción & Oficios',
    icon: '🚜',
    description: 'Operación de retroexcavadoras, bulldozers y maquinaria pesada para excavación.',
    keywords: ['excavación', 'excavator', 'heavy equipment operator', 'excavador', 'retroexcavadora', 'earthwork', 'grading'],
  },
  {
    id: 'co-construccion', number: 38,
    name: 'Construcción',
    category: 'Construcción & Oficios',
    icon: '🏗️',
    description: 'Obreros y ayudantes de construcción para proyectos residenciales, comerciales e industriales.',
    keywords: ['construcción', 'construction worker', 'obrero', 'builder', 'laborer', 'albañil', 'mason', 'general contractor'],
  },
  {
    id: 'co-carpintero', number: 52,
    name: 'Carpintero',
    category: 'Construcción & Oficios',
    icon: '🪚',
    description: 'Carpintería en obra, acabados, encofrados y estructuras en madera.',
    keywords: ['carpintero', 'carpenter', 'framer', 'woodworker', 'finish carpenter', 'carpintería', 'formwork'],
  },
  {
    id: 'co-ebanista', number: 20,
    name: 'Ebanista',
    category: 'Construcción & Oficios',
    icon: '🪵',
    description: 'Fabricación de muebles, gabinetes y acabados en madera fina.',
    keywords: ['ebanista', 'cabinet maker', 'furniture maker', 'woodworker', 'millwork', 'joiner', 'muebles'],
  },
  {
    id: 'co-carroceria', number: 19,
    name: 'Carrocería',
    category: 'Construcción & Oficios',
    icon: '🚗',
    description: 'Reparación y pintura de carrocería automotriz, enderezado y latonería.',
    keywords: ['carrocero', 'auto body', 'body shop', 'latonería', 'enderezado', 'collision repair', 'bodywork'],
  },

  // ── Industria & Producción ────────────────────────────────────────────────────
  {
    id: 'in-operario-produccion', number: 30,
    name: 'Operario de Producción',
    category: 'Industria & Producción',
    icon: '⚙️',
    description: 'Operación de líneas de ensamblaje, producción industrial y control de calidad.',
    keywords: ['operario de producción', 'production worker', 'line worker', 'manufactura', 'assembly', 'plant worker', 'production operator'],
  },
  {
    id: 'in-operario-maquinaria', number: 31,
    name: 'Operario de Maquinaria',
    category: 'Industria & Producción',
    icon: '🏭',
    description: 'Operación de maquinaria industrial, tornos, fresadoras y equipos de producción.',
    keywords: ['operario de maquinaria', 'machine operator', 'equipment operator', 'CNC operator', 'torno', 'fresadora', 'industrial machine'],
  },
  {
    id: 'in-operador-laser', number: 42,
    name: 'Operador Laser',
    category: 'Industria & Producción',
    icon: '🔆',
    description: 'Operación de cortadoras y grabadoras láser industriales, CNC y plasma.',
    keywords: ['operador laser', 'laser operator', 'laser cutter', 'CNC', 'plasma cutter', 'corte láser', 'fabricación'],
  },

  // ── Mecánica & Técnica ────────────────────────────────────────────────────────
  {
    id: 'mt-electricista', number: 5,
    name: 'Electricista',
    category: 'Mecánica & Técnica',
    icon: '⚡',
    description: 'Instalación y mantenimiento eléctrico residencial, comercial e industrial.',
    keywords: ['electricista', 'electrician', 'electrical', 'wiring', 'eléctrico', 'instalaciones eléctricas', 'journeyman electrician'],
  },
  {
    id: 'mt-reparadores-refrigeradoras', number: 13,
    name: 'Reparadores de Refrigeradoras',
    category: 'Mecánica & Técnica',
    icon: '🔧',
    description: 'Diagnóstico y reparación de refrigeradores, aires acondicionados y equipos de refrigeración.',
    keywords: ['reparador refrigeradora', 'appliance repair', 'refrigerator technician', 'HVAC', 'refrigeration', 'aire acondicionado', 'appliance technician'],
  },
  {
    id: 'mt-mecanico-forklift', number: 14,
    name: 'Mecánico Fork Lift',
    category: 'Mecánica & Técnica',
    icon: '🛠️',
    description: 'Mantenimiento y reparación de montacargas y equipos de manejo de materiales.',
    keywords: ['mecánico montacargas', 'forklift mechanic', 'heavy equipment mechanic', 'fork lift repair', 'material handling'],
  },
  {
    id: 'mt-tecnico-elevadores', number: 15,
    name: 'Técnico en Reparación de Elevadores',
    category: 'Mecánica & Técnica',
    icon: '🛗',
    description: 'Instalación, mantenimiento y reparación de elevadores y escaleras eléctricas.',
    keywords: ['técnico elevadores', 'elevator technician', 'lift repair', 'elevator mechanic', 'escalera eléctrica', 'ascensor'],
  },
  {
    id: 'mt-mecanico', number: 33,
    name: 'Mecánico',
    category: 'Mecánica & Técnica',
    icon: '🔩',
    description: 'Mecánica automotriz general: diagnóstico, reparación de motores y sistemas vehiculares.',
    keywords: ['mecánico', 'mechanic', 'auto mechanic', 'car repair', 'automotive', 'taller mecánico', 'diesel mechanic'],
  },
  {
    id: 'mt-mecanico-industrial', number: 41,
    name: 'Mecánico Industrial',
    category: 'Mecánica & Técnica',
    icon: '⚙️',
    description: 'Mantenimiento preventivo y correctivo de maquinaria industrial pesada.',
    keywords: ['mecánico industrial', 'industrial mechanic', 'plant mechanic', 'mantenimiento maquinaria', 'millwright', 'industrial maintenance'],
  },

  // ── Limpieza & Mantenimiento ──────────────────────────────────────────────────
  {
    id: 'lm-limpieza-industrial', number: 43,
    name: 'Limpieza Industrial',
    category: 'Limpieza & Mantenimiento',
    icon: '🧹',
    description: 'Limpieza y desinfección de plantas industriales, bodegas y espacios de producción.',
    keywords: ['limpieza industrial', 'industrial cleaner', 'janitorial', 'sanitation', 'cleaning crew', 'aseo industrial', 'pressure washing'],
  },
  {
    id: 'lm-limpieza', number: 44,
    name: 'Limpieza',
    category: 'Limpieza & Mantenimiento',
    icon: '🧽',
    description: 'Servicios de aseo y limpieza en oficinas, comercios y áreas comunes.',
    keywords: ['limpieza', 'cleaner', 'cleaning staff', 'janitor', 'aseo', 'housekeeping', 'custodian', 'cleaning service'],
  },
  {
    id: 'lm-mantenimiento', number: 34,
    name: 'Mantenimiento',
    category: 'Limpieza & Mantenimiento',
    icon: '🔧',
    description: 'Mantenimiento general de instalaciones: pintura, plomería básica y reparaciones menores.',
    keywords: ['mantenimiento', 'maintenance worker', 'handyman', 'facility maintenance', 'building maintenance', 'operario mantenimiento', 'general maintenance'],
  },
  {
    id: 'lm-lavanderia', number: 35,
    name: 'Lavandería',
    category: 'Limpieza & Mantenimiento',
    icon: '👕',
    description: 'Lavado, secado, planchado y clasificación de ropa en lavanderías y hoteles.',
    keywords: ['lavandería', 'laundry worker', 'dry cleaning', 'lavandera', 'laundry attendant', 'linen', 'pressing'],
  },

  // ── Agricultura & Campo ───────────────────────────────────────────────────────
  {
    id: 'ag-recolectores', number: 8,
    name: 'Recolectores de Frutas y Vegetales',
    category: 'Agricultura & Campo',
    icon: '🍎',
    description: 'Recolección manual de frutas, verduras y productos agrícolas en granjas.',
    keywords: ['recolector', 'fruit picker', 'vegetable picker', 'farm worker', 'harvester', 'crop picker', 'cosechador'],
  },
  {
    id: 'ag-invernaderos', number: 9,
    name: 'Trabajadores de Invernaderos',
    category: 'Agricultura & Campo',
    icon: '🌱',
    description: 'Siembra, cuidado y cosecha de plantas en invernaderos y viveros.',
    keywords: ['invernadero', 'greenhouse worker', 'horticulture', 'greenhouse', 'nursery worker', 'floricultura', 'vivero'],
  },
  {
    id: 'ag-operario-agricola', number: 10,
    name: 'Operario Agrícola',
    category: 'Agricultura & Campo',
    icon: '🌾',
    description: 'Labores de campo: siembra, fumigación, riego y mantenimiento de cultivos.',
    keywords: ['operario agrícola', 'farm hand', 'agricultural worker', 'field worker', 'farm laborer', 'jornalero', 'crop worker'],
  },
  {
    id: 'ag-paisajismo', number: 29,
    name: 'Paisajismo',
    category: 'Agricultura & Campo',
    icon: '🌿',
    description: 'Diseño, instalación y mantenimiento de jardines, zonas verdes y paisajes exteriores.',
    keywords: ['paisajismo', 'landscaper', 'lawn care', 'gardener', 'jardinero', 'groundskeeper', 'landscaping', 'grounds maintenance'],
  },
  {
    id: 'ag-agricultor', number: 46,
    name: 'Agricultor',
    category: 'Agricultura & Campo',
    icon: '👨‍🌾',
    description: 'Producción agrícola general: cultivo, mantenimiento y gestión de fincas.',
    keywords: ['agricultor', 'farmer', 'grower', 'farm operator', 'crop farmer', 'rancher', 'agriculture'],
  },

  // ── Servicios al Hogar ────────────────────────────────────────────────────────
  {
    id: 'sh-empleada-domestica', number: 12,
    name: 'Empleada Doméstica',
    category: 'Servicios al Hogar',
    icon: '🏠',
    description: 'Aseo del hogar, cuidado de niños, cocina y labores domésticas generales.',
    keywords: ['empleada doméstica', 'domestic worker', 'housekeeper', 'nanny', 'caregiver', 'limpieza hogar', 'house cleaner'],
  },
  {
    id: 'sh-mucama', number: 45,
    name: 'Mucama',
    category: 'Servicios al Hogar',
    icon: '🛏️',
    description: 'Limpieza y arreglo de habitaciones en hoteles, moteles y alojamientos.',
    keywords: ['mucama', 'room attendant', 'maid', 'hotel maid', 'housekeeping', 'chambermaids', 'hotel housekeeping'],
  },

  // ── Hostelería & Turismo ──────────────────────────────────────────────────────
  {
    id: 'ht-hotel', number: 36,
    name: 'Hotel',
    category: 'Hostelería & Turismo',
    icon: '🏨',
    description: 'Personal de hotel: recepción, botones, conserje, y servicios de atención al huésped.',
    keywords: ['hotel', 'hospitality worker', 'hotel staff', 'front desk hotel', 'bellboy', 'concierge', 'lodge', 'resort staff'],
  },
  {
    id: 'ht-recepcionista', number: 4,
    name: 'Recepcionista',
    category: 'Hostelería & Turismo',
    icon: '☎️',
    description: 'Atención presencial y telefónica de visitantes, manejo de agenda y correspondencia.',
    keywords: ['recepcionista', 'receptionist', 'front desk', 'office clerk', 'administrative', 'secretary', 'customer service'],
  },

  // ── Comercio & Retail ─────────────────────────────────────────────────────────
  {
    id: 'cr-tienda-comestibles', number: 21,
    name: 'Tienda de Comestibles',
    category: 'Comercio & Retail',
    icon: '🏪',
    description: 'Atención al cliente, caja y reposición de productos en tiendas de conveniencia y abarrotes.',
    keywords: ['tienda comestibles', 'grocery store', 'convenience store', 'cashier', 'cajero', 'retail', 'abarrotes', 'bodega'],
  },
  {
    id: 'cr-supermercado', number: 22,
    name: 'Supermercado',
    category: 'Comercio & Retail',
    icon: '🛒',
    description: 'Cajero, reponedor, empacador y atención al cliente en cadenas de supermercados.',
    keywords: ['supermercado', 'supermarket', 'grocery clerk', 'cashier', 'stock boy', 'bagger', 'retail worker'],
  },

  // ── Seguridad ─────────────────────────────────────────────────────────────────
  {
    id: 'se-seguridad', number: 11,
    name: 'Personal de Seguridad',
    category: 'Seguridad',
    icon: '🛡️',
    description: 'Control de acceso, rondas de vigilancia, manejo de CCTV y seguridad física.',
    keywords: ['seguridad', 'security guard', 'vigilante', 'guardia', 'security officer', 'surveillance', 'access control', 'watchman'],
  },

  // ── Diseño ────────────────────────────────────────────────────────────────────
  {
    id: 'ds-disenador-interiores', number: 39,
    name: 'Diseñador de Interiores',
    category: 'Diseño',
    icon: '🛋️',
    description: 'Diseño y decoración de espacios interiores residenciales, comerciales y corporativos.',
    keywords: ['diseñador de interiores', 'interior designer', 'decorator', 'interior design', 'space planning', 'decorador'],
  },

  // ── General ───────────────────────────────────────────────────────────────────
  {
    id: 'gn-general', number: 51,
    name: 'General',
    category: 'General',
    icon: '👷',
    description: 'Trabajador polivalente para labores generales de apoyo en cualquier área o industria.',
    keywords: ['general laborer', 'general worker', 'helper', 'obrero general', 'handy man', 'todo en uno', 'multi-task', 'apoyo general'],
  },
];

/** Todas las categorías únicas, en el orden de aparición */
export const EMPLOYEE_CATEGORIES = [...new Set(EMPLOYEE_TYPES.map(e => e.category))];

/** Mapa rápido por id */
export const EMPLOYEE_TYPE_BY_ID = Object.fromEntries(EMPLOYEE_TYPES.map(e => [e.id, e]));

/** Total de servicios */
export const TOTAL_SERVICES = EMPLOYEE_TYPES.length;
