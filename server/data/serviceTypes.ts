/**
 * Los 52 servicios oficiales de CanTrack — versión servidor.
 * Usados por el clasificador de vacantes y el agente de sugerencias.
 */
export interface ServiceType {
  id: string;
  number: number;
  name: string;
  category: string;
  description: string;
  keywords: string[];        // sinónimos/términos para matching semántico
  industries: string[];      // industrias donde típicamente se necesita este servicio
}

export const SERVICE_TYPES: ServiceType[] = [
  // ── Gastronomía & Alimentos ───────────────────────────────────────────────────
  {
    id: 'ga-empacadores', number: 1,
    name: 'Empacadores',
    category: 'Gastronomía & Alimentos',
    description: 'Personal para empaque, etiquetado y preparación de productos alimenticios en línea de producción.',
    keywords: ['empacador', 'packer', 'packaging', 'embalaje', 'etiquetado', 'picking', 'packing', 'packager', 'wrapping'],
    industries: ['Food & Beverage', 'Manufacturing', 'Retail', 'Logistics', 'Agriculture'],
  },
  {
    id: 'ga-meseros', number: 6,
    name: 'Meseros',
    category: 'Gastronomía & Alimentos',
    description: 'Atención de mesas, toma de órdenes y servicio al cliente en restaurantes, cafeterías y eventos.',
    keywords: ['mesero', 'waiter', 'server', 'camarero', 'mozo', 'food service', 'servicios de mesa', 'banquetes', 'waitress', 'serving staff'],
    industries: ['Hospitality', 'Food & Beverage', 'Events', 'Catering'],
  },
  {
    id: 'ga-restaurante', number: 24,
    name: 'Restaurante',
    category: 'Gastronomía & Alimentos',
    description: 'Personal de restaurante: atención al cliente, caja, limpieza y apoyo general.',
    keywords: ['restaurante', 'restaurant worker', 'food service', 'cafetería', 'diner', 'food court', 'fast food', 'dining'],
    industries: ['Food & Beverage', 'Hospitality'],
  },
  {
    id: 'ga-panaderia', number: 28,
    name: 'Panadería',
    category: 'Gastronomía & Alimentos',
    description: 'Elaboración de pan, pasteles y productos de panadería artesanal e industrial.',
    keywords: ['panadero', 'baker', 'bakery', 'pastelero', 'repostero', 'pastry chef', 'pan', 'pastries', 'baking', 'confectionery'],
    industries: ['Food & Beverage', 'Retail', 'Manufacturing'],
  },
  {
    id: 'ga-carniceria', number: 17,
    name: 'Carnicería',
    category: 'Gastronomía & Alimentos',
    description: 'Corte, procesamiento y manejo de carnes en carnicerías, supermercados y plantas.',
    keywords: ['carnicero', 'butcher', 'meat cutter', 'deshuese', 'corte de carne', 'meatpacking', 'deli worker', 'charcuterie'],
    industries: ['Food & Beverage', 'Retail', 'Manufacturing'],
  },
  {
    id: 'ga-matadero', number: 47,
    name: 'Matadero',
    category: 'Gastronomía & Alimentos',
    description: 'Operaciones en plantas de sacrificio y procesamiento de carnes.',
    keywords: ['matadero', 'slaughterhouse', 'meatpacking', 'plant worker', 'procesamiento carne', 'abattoir', 'kill floor'],
    industries: ['Food & Beverage', 'Manufacturing', 'Agriculture'],
  },
  {
    id: 'ga-asistente-cocina', number: 48,
    name: 'Asistente de Cocina',
    category: 'Gastronomía & Alimentos',
    description: 'Apoyo en cocina: mise en place, limpieza, preparaciones básicas y manejo de insumos.',
    keywords: ['asistente de cocina', 'kitchen helper', 'prep cook', 'ayudante cocina', 'kitchen staff', 'auxiliar cocina', 'kitchen assistant', 'food prep'],
    industries: ['Food & Beverage', 'Hospitality', 'Healthcare'],
  },
  {
    id: 'ga-chef', number: 49,
    name: 'Chef',
    category: 'Gastronomía & Alimentos',
    description: 'Cocinero profesional con experiencia en cocina caliente, fría y gestión de cocina.',
    keywords: ['chef', 'cocinero', 'cook', 'head cook', 'culinary', 'cuisine', 'jefe de cocina', 'line cook', 'sous chef', 'executive chef'],
    industries: ['Food & Beverage', 'Hospitality', 'Healthcare', 'Education'],
  },
  {
    id: 'ga-pizzero', number: 50,
    name: 'Pizzero',
    category: 'Gastronomía & Alimentos',
    description: 'Elaboración de pizzas artesanales e industriales, manejo de horno y masas.',
    keywords: ['pizzero', 'pizza maker', 'pizza chef', 'pizzaiolo', 'pizza cook', 'oven operator'],
    industries: ['Food & Beverage', 'Hospitality'],
  },
  {
    id: 'ga-bartenders', number: 16,
    name: 'Bartenders',
    category: 'Gastronomía & Alimentos',
    description: 'Preparación de bebidas, cócteles y atención de barra en bares, restaurantes y eventos.',
    keywords: ['bartender', 'barman', 'barista', 'mixologist', 'bar staff', 'barra', 'cocktails', 'bebidas', 'bar tender', 'beverage server'],
    industries: ['Hospitality', 'Food & Beverage', 'Events', 'Entertainment'],
  },

  // ── Logística & Transporte ────────────────────────────────────────────────────
  {
    id: 'lg-montacargas', number: 2,
    name: 'Operadores de Montacargas',
    category: 'Logística & Transporte',
    description: 'Operación certificada de montacargas contrabalanceado y retráctil.',
    keywords: ['montacargas', 'forklift operator', 'forklift driver', 'fork lift', 'reach truck', 'estibador', 'sit-down forklift', 'order picker'],
    industries: ['Logistics', 'Manufacturing', 'Retail', 'Warehousing', 'Construction'],
  },
  {
    id: 'lg-conductores', number: 3,
    name: 'Conductores de Vehículos de Carga',
    category: 'Logística & Transporte',
    description: 'Conducción de camiones, tractomulas y vehículos de distribución con licencias.',
    keywords: ['conductor', 'chofer', 'truck driver', 'CDL', 'driver', 'camionero', 'repartidor', 'delivery driver', 'transporte', 'over the road', 'flatbed', 'tanker'],
    industries: ['Logistics', 'Transport', 'Retail', 'Construction', 'Food & Beverage'],
  },
  {
    id: 'lg-carga-descarga', number: 7,
    name: 'Carga y Descarga',
    category: 'Logística & Transporte',
    description: 'Cargue y descargue de mercancía en muelles, bodegas y centros de distribución.',
    keywords: ['carga y descarga', 'loader', 'unloader', 'dock worker', 'warehouse labor', 'estibador', 'lumper', 'shipping receiving'],
    industries: ['Logistics', 'Warehousing', 'Retail', 'Manufacturing'],
  },
  {
    id: 'lg-mudanzas', number: 32,
    name: 'Mudanzas',
    category: 'Logística & Transporte',
    description: 'Personal para servicios de mudanza residencial y comercial.',
    keywords: ['mudanza', 'mover', 'moving crew', 'relocation', 'furniture mover', 'packer mover', 'household goods'],
    industries: ['Logistics', 'Real Estate'],
  },
  {
    id: 'lg-domiciliario', number: 40,
    name: 'Domiciliario',
    category: 'Logística & Transporte',
    description: 'Entrega de pedidos a domicilio en moto o bicicleta.',
    keywords: ['domiciliario', 'delivery', 'courier', 'repartidor', 'mensajero', 'dispatch', 'last mile', 'bike messenger', 'e-commerce delivery'],
    industries: ['Food & Beverage', 'E-commerce', 'Retail', 'Healthcare'],
  },
  {
    id: 'lg-almacen', number: 18,
    name: 'Almacén',
    category: 'Logística & Transporte',
    description: 'Gestión de inventarios, recepción, despacho y organización de mercancía en bodega.',
    keywords: ['almacén', 'warehouse worker', 'bodeguero', 'stock clerk', 'inventory', 'almacenista', 'stocking', 'receiving clerk', 'put-away'],
    industries: ['Logistics', 'Retail', 'Manufacturing', 'Wholesale'],
  },

  // ── Construcción & Oficios ────────────────────────────────────────────────────
  {
    id: 'co-soldador', number: 23,
    name: 'Soldador',
    category: 'Construcción & Oficios',
    description: 'Soldadura MIG, TIG y por arco en estructuras metálicas, tuberías y maquinaria.',
    keywords: ['soldador', 'welder', 'welding', 'MIG', 'TIG', 'soldadura', 'arco', 'metal fabrication', 'pipe welder', 'structural welder'],
    industries: ['Manufacturing', 'Construction', 'Oil & Gas', 'Mining', 'Automotive'],
  },
  {
    id: 'co-remocion-nieve', number: 25,
    name: 'Remoción de Nieve',
    category: 'Construcción & Oficios',
    description: 'Limpieza y remoción de nieve en estacionamientos, entradas y propiedades comerciales.',
    keywords: ['remoción nieve', 'snow removal', 'snow plow', 'salting', 'grounds crew', 'deicing', 'snow blowing'],
    industries: ['Property Management', 'Construction', 'Municipalities', 'Retail'],
  },
  {
    id: 'co-plomero', number: 26,
    name: 'Plomero',
    category: 'Construcción & Oficios',
    description: 'Instalación y reparación de redes hidrosanitarias residenciales e industriales.',
    keywords: ['plomero', 'plumber', 'gasfitero', 'pipefitter', 'plumbing', 'tubería', 'hidráulica', 'pipe fitter', 'drain specialist'],
    industries: ['Construction', 'Property Management', 'Manufacturing'],
  },
  {
    id: 'co-pintor', number: 27,
    name: 'Pintor',
    category: 'Construcción & Oficios',
    description: 'Pintura residencial, comercial e industrial. Aplicación de epóxicos y anticorrosivos.',
    keywords: ['pintor', 'painter', 'painting', 'decorator', 'paint', 'industrial painter', 'spray painter', 'drywall painter'],
    industries: ['Construction', 'Property Management', 'Manufacturing'],
  },
  {
    id: 'co-excavacion', number: 37,
    name: 'Excavación',
    category: 'Construcción & Oficios',
    description: 'Operación de retroexcavadoras, bulldozers y maquinaria pesada para excavación.',
    keywords: ['excavación', 'excavator', 'heavy equipment operator', 'excavador', 'retroexcavadora', 'earthwork', 'grading', 'bulldozer operator'],
    industries: ['Construction', 'Mining', 'Oil & Gas', 'Municipalities'],
  },
  {
    id: 'co-construccion', number: 38,
    name: 'Construcción',
    category: 'Construcción & Oficios',
    description: 'Obreros y ayudantes de construcción para proyectos residenciales, comerciales e industriales.',
    keywords: ['construcción', 'construction worker', 'obrero', 'builder', 'laborer', 'albañil', 'mason', 'concrete worker', 'framer', 'general contractor'],
    industries: ['Construction', 'Real Estate', 'Property Management'],
  },
  {
    id: 'co-carpintero', number: 52,
    name: 'Carpintero',
    category: 'Construcción & Oficios',
    description: 'Carpintería en obra, acabados, encofrados y estructuras en madera.',
    keywords: ['carpintero', 'carpenter', 'framer', 'woodworker', 'finish carpenter', 'carpintería', 'formwork', 'trim carpenter'],
    industries: ['Construction', 'Manufacturing', 'Property Management'],
  },
  {
    id: 'co-ebanista', number: 20,
    name: 'Ebanista',
    category: 'Construcción & Oficios',
    description: 'Fabricación de muebles, gabinetes y acabados en madera fina.',
    keywords: ['ebanista', 'cabinet maker', 'furniture maker', 'woodworker', 'millwork', 'joiner', 'muebles', 'casework'],
    industries: ['Manufacturing', 'Construction', 'Retail'],
  },
  {
    id: 'co-carroceria', number: 19,
    name: 'Carrocería',
    category: 'Construcción & Oficios',
    description: 'Reparación y pintura de carrocería automotriz, enderezado y latonería.',
    keywords: ['carrocero', 'auto body', 'body shop', 'latonería', 'enderezado', 'collision repair', 'bodywork', 'auto paint'],
    industries: ['Automotive', 'Transport'],
  },

  // ── Industria & Producción ────────────────────────────────────────────────────
  {
    id: 'in-operario-produccion', number: 30,
    name: 'Operario de Producción',
    category: 'Industria & Producción',
    description: 'Operación de líneas de ensamblaje, producción industrial y control de calidad.',
    keywords: ['operario producción', 'production worker', 'line worker', 'manufactura', 'assembly', 'plant worker', 'production operator', 'assembly line', 'factory worker'],
    industries: ['Manufacturing', 'Food & Beverage', 'Automotive', 'Electronics', 'Pharmaceuticals'],
  },
  {
    id: 'in-operario-maquinaria', number: 31,
    name: 'Operario de Maquinaria',
    category: 'Industria & Producción',
    description: 'Operación de maquinaria industrial, tornos, fresadoras y equipos de producción.',
    keywords: ['operario maquinaria', 'machine operator', 'equipment operator', 'CNC operator', 'torno', 'fresadora', 'industrial machine', 'press operator'],
    industries: ['Manufacturing', 'Mining', 'Automotive', 'Plastics'],
  },
  {
    id: 'in-operador-laser', number: 42,
    name: 'Operador Laser',
    category: 'Industria & Producción',
    description: 'Operación de cortadoras y grabadoras láser industriales, CNC y plasma.',
    keywords: ['operador laser', 'laser operator', 'laser cutter', 'CNC', 'plasma cutter', 'corte láser', 'laser technician', 'water jet operator'],
    industries: ['Manufacturing', 'Metal Fabrication', 'Signage', 'Automotive'],
  },

  // ── Mecánica & Técnica ────────────────────────────────────────────────────────
  {
    id: 'mt-electricista', number: 5,
    name: 'Electricista',
    category: 'Mecánica & Técnica',
    description: 'Instalación y mantenimiento eléctrico residencial, comercial e industrial.',
    keywords: ['electricista', 'electrician', 'electrical', 'wiring', 'eléctrico', 'instalaciones eléctricas', 'journeyman electrician', 'master electrician', 'power distribution'],
    industries: ['Construction', 'Manufacturing', 'Property Management', 'Utilities'],
  },
  {
    id: 'mt-reparadores-refrigeradoras', number: 13,
    name: 'Reparadores de Refrigeradoras',
    category: 'Mecánica & Técnica',
    description: 'Diagnóstico y reparación de refrigeradores, aires acondicionados y equipos de refrigeración.',
    keywords: ['reparador refrigeradora', 'appliance repair', 'refrigerator technician', 'HVAC', 'refrigeration', 'aire acondicionado', 'appliance technician', 'AC technician'],
    industries: ['Property Management', 'Food & Beverage', 'Healthcare', 'Hospitality'],
  },
  {
    id: 'mt-mecanico-forklift', number: 14,
    name: 'Mecánico Fork Lift',
    category: 'Mecánica & Técnica',
    description: 'Mantenimiento y reparación de montacargas y equipos de manejo de materiales.',
    keywords: ['mecánico montacargas', 'forklift mechanic', 'heavy equipment mechanic', 'fork lift repair', 'material handling', 'equipment technician'],
    industries: ['Logistics', 'Manufacturing', 'Warehousing'],
  },
  {
    id: 'mt-tecnico-elevadores', number: 15,
    name: 'Técnico en Reparación de Elevadores',
    category: 'Mecánica & Técnica',
    description: 'Instalación, mantenimiento y reparación de elevadores y escaleras eléctricas.',
    keywords: ['técnico elevadores', 'elevator technician', 'lift repair', 'elevator mechanic', 'escalera eléctrica', 'ascensor', 'elevator installer'],
    industries: ['Construction', 'Property Management', 'Hospitality'],
  },
  {
    id: 'mt-mecanico', number: 33,
    name: 'Mecánico',
    category: 'Mecánica & Técnica',
    description: 'Mecánica automotriz general: diagnóstico, reparación de motores y sistemas vehiculares.',
    keywords: ['mecánico', 'mechanic', 'auto mechanic', 'car repair', 'automotive', 'taller mecánico', 'diesel mechanic', 'lube technician', 'shop mechanic'],
    industries: ['Automotive', 'Transport', 'Logistics', 'Construction'],
  },
  {
    id: 'mt-mecanico-industrial', number: 41,
    name: 'Mecánico Industrial',
    category: 'Mecánica & Técnica',
    description: 'Mantenimiento preventivo y correctivo de maquinaria industrial pesada.',
    keywords: ['mecánico industrial', 'industrial mechanic', 'plant mechanic', 'mantenimiento maquinaria', 'millwright', 'industrial maintenance', 'machinery maintenance'],
    industries: ['Manufacturing', 'Mining', 'Oil & Gas', 'Food & Beverage'],
  },

  // ── Limpieza & Mantenimiento ──────────────────────────────────────────────────
  {
    id: 'lm-limpieza-industrial', number: 43,
    name: 'Limpieza Industrial',
    category: 'Limpieza & Mantenimiento',
    description: 'Limpieza y desinfección de plantas industriales, bodegas y espacios de producción.',
    keywords: ['limpieza industrial', 'industrial cleaner', 'janitorial', 'sanitation', 'cleaning crew', 'aseo industrial', 'pressure washing', 'deep cleaning'],
    industries: ['Manufacturing', 'Food & Beverage', 'Healthcare', 'Logistics'],
  },
  {
    id: 'lm-limpieza', number: 44,
    name: 'Limpieza',
    category: 'Limpieza & Mantenimiento',
    description: 'Servicios de aseo y limpieza en oficinas, comercios y áreas comunes.',
    keywords: ['limpieza', 'cleaner', 'cleaning staff', 'janitor', 'aseo', 'housekeeping', 'custodian', 'cleaning service', 'office cleaner'],
    industries: ['Property Management', 'Hospitality', 'Healthcare', 'Education', 'Retail'],
  },
  {
    id: 'lm-mantenimiento', number: 34,
    name: 'Mantenimiento',
    category: 'Limpieza & Mantenimiento',
    description: 'Mantenimiento general de instalaciones: pintura, plomería básica y reparaciones menores.',
    keywords: ['mantenimiento', 'maintenance worker', 'handyman', 'facility maintenance', 'building maintenance', 'operario mantenimiento', 'general maintenance', 'porter'],
    industries: ['Property Management', 'Hospitality', 'Retail', 'Manufacturing'],
  },
  {
    id: 'lm-lavanderia', number: 35,
    name: 'Lavandería',
    category: 'Limpieza & Mantenimiento',
    description: 'Lavado, secado, planchado y clasificación de ropa en lavanderías y hoteles.',
    keywords: ['lavandería', 'laundry worker', 'dry cleaning', 'lavandera', 'laundry attendant', 'linen', 'pressing', 'laundromat'],
    industries: ['Hospitality', 'Healthcare', 'Property Management'],
  },

  // ── Agricultura & Campo ───────────────────────────────────────────────────────
  {
    id: 'ag-recolectores', number: 8,
    name: 'Recolectores de Frutas y Vegetales',
    category: 'Agricultura & Campo',
    description: 'Recolección manual de frutas, verduras y productos agrícolas en granjas.',
    keywords: ['recolector', 'fruit picker', 'vegetable picker', 'farm worker', 'harvester', 'crop picker', 'cosechador', 'berry picker'],
    industries: ['Agriculture', 'Food & Beverage'],
  },
  {
    id: 'ag-invernaderos', number: 9,
    name: 'Trabajadores de Invernaderos',
    category: 'Agricultura & Campo',
    description: 'Siembra, cuidado y cosecha de plantas en invernaderos y viveros.',
    keywords: ['invernadero', 'greenhouse worker', 'horticulture', 'nursery worker', 'floricultura', 'vivero', 'plant care', 'greenhouse grower'],
    industries: ['Agriculture', 'Floriculture', 'Food & Beverage'],
  },
  {
    id: 'ag-operario-agricola', number: 10,
    name: 'Operario Agrícola',
    category: 'Agricultura & Campo',
    description: 'Labores de campo: siembra, fumigación, riego y mantenimiento de cultivos.',
    keywords: ['operario agrícola', 'farm hand', 'agricultural worker', 'field worker', 'farm laborer', 'jornalero', 'crop worker', 'tractor operator'],
    industries: ['Agriculture', 'Food & Beverage'],
  },
  {
    id: 'ag-paisajismo', number: 29,
    name: 'Paisajismo',
    category: 'Agricultura & Campo',
    description: 'Diseño, instalación y mantenimiento de jardines, zonas verdes y paisajes exteriores.',
    keywords: ['paisajismo', 'landscaper', 'lawn care', 'gardener', 'jardinero', 'groundskeeper', 'landscaping', 'grounds maintenance', 'sod installer'],
    industries: ['Property Management', 'Construction', 'Municipalities', 'Hospitality'],
  },
  {
    id: 'ag-agricultor', number: 46,
    name: 'Agricultor',
    category: 'Agricultura & Campo',
    description: 'Producción agrícola general: cultivo, mantenimiento y gestión de fincas.',
    keywords: ['agricultor', 'farmer', 'grower', 'farm operator', 'crop farmer', 'rancher', 'agriculture', 'farm manager'],
    industries: ['Agriculture', 'Food & Beverage'],
  },

  // ── Servicios al Hogar ────────────────────────────────────────────────────────
  {
    id: 'sh-empleada-domestica', number: 12,
    name: 'Empleada Doméstica',
    category: 'Servicios al Hogar',
    description: 'Aseo del hogar, cuidado de niños, cocina y labores domésticas generales.',
    keywords: ['empleada doméstica', 'domestic worker', 'housekeeper', 'nanny', 'caregiver', 'limpieza hogar', 'house cleaner', 'home care'],
    industries: ['Domestic Services', 'Healthcare', 'Property Management'],
  },
  {
    id: 'sh-mucama', number: 45,
    name: 'Mucama',
    category: 'Servicios al Hogar',
    description: 'Limpieza y arreglo de habitaciones en hoteles, moteles y alojamientos.',
    keywords: ['mucama', 'room attendant', 'maid', 'hotel maid', 'housekeeping', 'chambermaids', 'hotel housekeeping', 'turn-down service'],
    industries: ['Hospitality', 'Property Management'],
  },

  // ── Hostelería & Turismo ──────────────────────────────────────────────────────
  {
    id: 'ht-hotel', number: 36,
    name: 'Hotel',
    category: 'Hostelería & Turismo',
    description: 'Personal de hotel: recepción, botones, conserje y servicios de atención al huésped.',
    keywords: ['hotel', 'hospitality worker', 'hotel staff', 'front desk hotel', 'bellboy', 'concierge', 'lodge', 'resort staff', 'valet', 'guest services'],
    industries: ['Hospitality', 'Tourism'],
  },
  {
    id: 'ht-recepcionista', number: 4,
    name: 'Recepcionista',
    category: 'Hostelería & Turismo',
    description: 'Atención presencial y telefónica de visitantes, manejo de agenda y correspondencia.',
    keywords: ['recepcionista', 'receptionist', 'front desk', 'office clerk', 'administrative', 'secretary', 'customer service', 'greeter', 'switchboard'],
    industries: ['Hospitality', 'Healthcare', 'Professional Services', 'Corporate'],
  },

  // ── Comercio & Retail ─────────────────────────────────────────────────────────
  {
    id: 'cr-tienda-comestibles', number: 21,
    name: 'Tienda de Comestibles',
    category: 'Comercio & Retail',
    description: 'Atención al cliente, caja y reposición de productos en tiendas de conveniencia.',
    keywords: ['tienda comestibles', 'grocery store', 'convenience store', 'cashier', 'cajero', 'retail', 'abarrotes', 'stock shelves', 'c-store'],
    industries: ['Retail', 'Food & Beverage'],
  },
  {
    id: 'cr-supermercado', number: 22,
    name: 'Supermercado',
    category: 'Comercio & Retail',
    description: 'Cajero, reponedor, empacador y atención al cliente en cadenas de supermercados.',
    keywords: ['supermercado', 'supermarket', 'grocery clerk', 'cashier', 'stock boy', 'bagger', 'retail worker', 'produce clerk', 'deli clerk'],
    industries: ['Retail', 'Food & Beverage'],
  },

  // ── Seguridad ─────────────────────────────────────────────────────────────────
  {
    id: 'se-seguridad', number: 11,
    name: 'Personal de Seguridad',
    category: 'Seguridad',
    description: 'Control de acceso, rondas de vigilancia, manejo de CCTV y seguridad física.',
    keywords: ['seguridad', 'security guard', 'vigilante', 'guardia', 'security officer', 'surveillance', 'access control', 'watchman', 'loss prevention', 'bouncer'],
    industries: ['Security', 'Retail', 'Hospitality', 'Construction', 'Healthcare', 'Events'],
  },

  // ── Diseño ────────────────────────────────────────────────────────────────────
  {
    id: 'ds-disenador-interiores', number: 39,
    name: 'Diseñador de Interiores',
    category: 'Diseño',
    description: 'Diseño y decoración de espacios interiores residenciales, comerciales y corporativos.',
    keywords: ['diseñador interiores', 'interior designer', 'decorator', 'interior design', 'space planning', 'decorador', 'furniture consultant', 'staging'],
    industries: ['Real Estate', 'Construction', 'Hospitality', 'Retail'],
  },

  // ── General ───────────────────────────────────────────────────────────────────
  {
    id: 'gn-general', number: 51,
    name: 'General',
    category: 'General',
    description: 'Trabajador polivalente para labores generales de apoyo en cualquier área.',
    keywords: ['general laborer', 'general worker', 'helper', 'obrero general', 'handyman', 'multi-task', 'apoyo general', 'casual labor', 'temp worker'],
    industries: ['Manufacturing', 'Construction', 'Logistics', 'Agriculture', 'Retail'],
  },
];

/** Mapa rápido id → servicio */
export const SERVICE_TYPE_BY_ID = Object.fromEntries(SERVICE_TYPES.map(s => [s.id, s]));

/** Lista compacta para prompts de IA (solo id, número y nombre) */
export const SERVICE_TYPES_COMPACT = SERVICE_TYPES.map(s => ({
  id: s.id,
  number: s.number,
  name: s.name,
  category: s.category,
  keywords: s.keywords.slice(0, 5).join(', '),
}));
