/**
 * MDirector list and segment ID constants.
 *
 * Quebec list  (id=30): english language template
 * Ontario list (id=28): french language template
 *
 * Keys are CRM `work` field values in UPPERCASE.
 * Multiple CRM labels mapping to the same segment are listed as separate keys.
 */

export const QUEBEC_LIST_ID  = '30';
export const ONTARIO_LIST_ID = '28';

/**
 * Quebec segments (English segment names)
 */
export const QUEBEC_SEGMENTS: Record<string, string> = {
  'EMPACADORES':                               '755', // Packing
  'CARGA Y DESCARGA':                          '755', // Packing
  'OPERADORES DE MONTEACARGA':                 '753', // Mechanic
  'MECANICO FORK LIFT':                        '753', // Mechanic
  'OPERARIO DE MAQUINARIA':                    '753', // Mechanic
  'MECANICO':                                  '753', // Mechanic
  'MECANICO INDUSTRIAL':                       '753', // Mechanic
  'CONDUCTORES DE VEHICULOS DE CARGA':         '773', // General
  'RECEPCIONISTA':                             '770', // Receptionist
  'ELECTRICISTA':                              '744', // Electrician
  'MESEROS':                                   '766', // Waitress
  'RECOLECTORES DE FRUTAS Y VEGETALES':        '723', // Agriculture
  'TRABAJADORES DE INVERNADEROS':              '723', // Agriculture
  'OPERARIO AGRICOLA':                         '723', // Agriculture
  'AGRICULTOR':                                '723', // Agriculture
  'PERSONAL DE SEGURIDAD':                     '773', // General
  'EMPLEADA DOMESTICA':                        '739', // Cleaning
  'LIMPIEZA':                                  '739', // Cleaning
  'LIMPIEZA INDUSTRIAL':                       '739', // Cleaning
  'LAVANDERIA':                                '739', // Cleaning
  'MUCAMA':                                    '739', // Cleaning
  'REPARADORES DE REFRIGERADORAS':             '769', // Refrigeration
  'TECNICO EN REPARACION DE ELEVADORES':       '773', // General
  'OPERADOR LASER':                            '773', // General
  'MANTENIMIENTO':                             '773', // General
  'BARTENDERS':                                '727', // Bar
  'CARNICERIA':                                '731', // Butcher shop
  'MATADERO':                                  '731', // Butcher shop
  'ALMACEN':                                   '767', // Warehouse
  'CARROCERIA':                                '729', // Body shop
  'EBANISTA':                                  '735', // Carpentry
  'CARPINTERO':                                '735', // Carpentry
  'TIENDA DE COMESTIBLES':                     '773', // General
  'SUPERMERCADO':                              '765', // Supermarket
  'SOLDADOR':                                  '768', // Welder
  'RESTAURANTE':                               '762', // Restaurant
  'REMOCION DE NIEVE':                         '764', // Snow Removal
  'PLOMERO':                                   '771', // plumber
  'PINTOR':                                    '757', // Painter
  'PANADERIA':                                 '725', // Bakery
  'PAISAJISMO':                                '773', // General
  'OPERARIO DE PRODUCCION':                    '760', // Production Operator
  'MUDANZAS':                                  '772', // Moving
  'HOTEL':                                     '748', // Hotel
  'EXCAVACION':                                '746', // Excavation
  'CONSTRUCCION':                              '742', // Construction
  'DISEÑADOR DE INTERIORES':                   '751', // Interior Decoration
  'DOMICILIARIO':                              '773', // General
  'ASISTENTE DE COCINA':                       '736', // chef
  'CHEF':                                      '736', // chef
  'PIZZERO':                                   '759', // Pizza
  // ── English/Scraper work types ──
  'RETAIL':                                    '773', // General
  'MANUFACTURING':                             '753', // Mechanic
  'TECHNOLOGY':                                '773', // General
  'DEFENSE':                                   '773', // General
  'GOVERNMENT':                                '773', // General
  'FINANCIERO':                                '773', // General
  'HOSPITALITY':                               '748', // Hotel
  'HEALTHCARE':                                '773', // General
  'TRANSPORT':                                 '689', // Driver
  'HEALTH AND WELLNESS':                       '773', // General
  'STAFFING':                                  '773', // General
  'CONSTRUCTION':                              '742', // Construction
  'FACILITIES SERVICES':                       '685', // Limpeza
  'FOOD SERVICE':                              '710', // Restaurant
  'TELECOMMUNICATIONS':                        '773', // General
  'FOOD DISTRIBUTION':                         '670', // Carnicero
  'CLEANING SERVICES':                         '685', // Limpeza
  'SECURITY':                                  '773', // General
  'TRANSPORTATION & LOGISTICS':                '689', // Driver
  'DAIRY MANUFACTURING':                       '670', // Carnicero
  'INSURANCE':                                 '773', // General
  'FINANCIAL SERVICES':                        '773', // General
  'REAL ESTATE BROKERAGE':                     '773', // General
  'LEASING':                                   '773', // General
  'CONSUMER PRODUCTS':                         '773', // General
  'DISTRIBUTION':                              '773', // General
  'FORESTRY':                                  '663', // Agricultura
  'EDUCATION':                                 '773', // General
  'ENGINEERING & CONSTRUCTION':                '742', // Construction
  'FOOD PROCESSING':                           '670', // Carnicero
  'CANNABIS CULTIVATION AND PROCESSING':       '663', // Agricultura
  'ENVIRONMENTAL SERVICES':                    '699', // Landscape
  'AGRICULTURE':                               '663', // Agricultura
  'FOOD AND BEVERAGE':                         '710', // Restaurant
  'CHILD DAY CARE SERVICES':                   '773', // General
  'ENERGY & UTILITIES':                        '773', // General
  'AEROSPACE & MANUFACTURING':                 '753', // Mechanic
  'WHOLESALE':                                 '773', // General
  'AUTOMOTIVE':                                '773', // General
  'LANDSCAPING':                               '699', // Landscape
  'IMMIGRATION SERVICES':                      '773', // General
  // ── Typo variants ──
  'VALIDAR':                                   '773', // General (typo of GENERAL)
  'RECOLECTORESS Y VEGETALES':                 '663', // Agricultura (typo)
  'TRABAJADORES DE IVERNADEROS':               '663', // Agricultura (typo)
  'ASISTENTE SE COCINA':                       '736', // chef (typo)
  'CONDUCTORES VEHICULOS DE CARGA':            '689', // Driver (typo)
  'TECNICO EN ELEVADORES':                     '694', // entretien (typo)
  'REPARADORES DE REFRIGERADOES':              '694', // entretien (typo)
  'VALIDAR CARGO':                             '773', // General
  'RETAIL GROCERY':                            '681', // Supermarket
  'GENERAL':                                   '773', // General
};

/**
 * Ontario segments (mixed Spanish/English segment names)
 */
export const ONTARIO_SEGMENTS: Record<string, string> = {
  'EMPACADORES':                               '675', // packer
  'CARGA Y DESCARGA':                          '675', // packer
  'OPERADORES DE MONTEACARGA':                 '703', // Mechanic
  'MECANICO FORK LIFT':                        '703', // Mechanic
  'MECANICO':                                  '703', // Mechanic
  'MECANICO INDUSTRIAL':                       '703', // Mechanic
  'OPERARIO DE MAQUINARIA':                    '703', // Mechanic
  'CONDUCTORES DE VEHICULOS DE CARGA':         '689', // Driver
  'RECEPCIONISTA':                             '679', // Receptionist
  'ELECTRICISTA':                              '691', // Electrician
  'MESEROS':                                   '710', // Restaurant
  'RECOLECTORES DE FRUTAS Y VEGETALES':        '663', // Agricultura
  'TRABAJADORES DE INVERNADEROS':              '663', // Agricultura
  'OPERARIO AGRICOLA':                         '663', // Agricultura
  'AGRICULTOR':                                '663', // Agricultura
  'PERSONAL DE SEGURIDAD':                     '712', // General
  'EMPLEADA DOMESTICA':                        '685', // Limpeza
  'LIMPIEZA':                                  '685', // Limpeza
  'LIMPIEZA INDUSTRIAL':                       '685', // Limpeza
  'LAVANDERIA':                                '685', // Limpeza
  'MUCAMA':                                    '685', // Limpeza
  'REPARADORES DE REFRIGERADORAS':             '694', // entretien
  'MANTENIMIENTO':                             '694', // entretien
  'TECNICO EN REPARACION DE ELEVADORES':       '694', // entretien
  'OPERADOR LASER':                            '694', // entretien
  'BARTENDERS':                                '667', // Bar
  'CARNICERIA':                                '670', // Carnicero
  'MATADERO':                                  '670', // Carnicero
  'ALMACEN':                                   '712', // General
  'CARROCERIA':                                '668', // Body Shop
  'EBANISTA':                                  '672', // Carpintero
  'CARPINTERO':                                '672', // Carpintero
  'TIENDA DE COMESTIBLES':                     '682', // Store
  'SUPERMERCADO':                              '681', // Supermarket
  'SOLDADOR':                                  '711', // Welder
  'RESTAURANTE':                               '710', // Restaurant
  'REMOCION DE NIEVE':                         '712', // General
  'PLOMERO':                                   '706', // Plumber
  'PINTOR':                                    '704', // Painter
  'PANADERIA':                                 '665', // Panaderia
  'PAISAJISMO':                                '699', // Landscape
  'OPERARIO DE PRODUCCION':                    '700', // Operator
  'MUDANZAS':                                  '712', // General
  'HOTEL':                                     '695', // Hotel
  'EXCAVACION':                                '712', // General
  'CONSTRUCCION':                              '673', // Construccion
  'DISEÑADOR DE INTERIORES':                   '697', // interior design
  'DOMICILIARIO':                              '712', // General
  'ASISTENTE DE COCINA':                       '677', // chef
  'CHEF':                                      '677', // chef
  'PIZZERO':                                   '710', // Restaurant
  // ── English/Scraper work types ──
  'RETAIL':                                    '712', // General
  'MANUFACTURING':                             '703', // Mechanic
  'TECHNOLOGY':                                '712', // General
  'DEFENSE':                                   '712', // General
  'GOVERNMENT':                                '712', // General
  'FINANCIERO':                                '712', // General
  'HOSPITALITY':                               '695', // Hotel
  'HEALTHCARE':                                '712', // General
  'TRANSPORT':                                 '689', // Driver
  'HEALTH AND WELLNESS':                       '712', // General
  'STAFFING':                                  '712', // General
  'CONSTRUCTION':                              '673', // Construccion
  'FACILITIES SERVICES':                       '685', // Limpeza
  'FOOD SERVICE':                              '710', // Restaurant
  'TELECOMMUNICATIONS':                        '712', // General
  'FOOD DISTRIBUTION':                         '670', // Carnicero
  'CLEANING SERVICES':                         '685', // Limpeza
  'SECURITY':                                  '712', // General
  'TRANSPORTATION & LOGISTICS':                '689', // Driver
  'DAIRY MANUFACTURING':                       '670', // Carnicero
  'INSURANCE':                                 '712', // General
  'FINANCIAL SERVICES':                        '712', // General
  'REAL ESTATE BROKERAGE':                     '712', // General
  'LEASING':                                   '712', // General
  'CONSUMER PRODUCTS':                         '712', // General
  'DISTRIBUTION':                              '712', // General
  'FORESTRY':                                  '663', // Agricultura
  'EDUCATION':                                 '712', // General
  'ENGINEERING & CONSTRUCTION':                '673', // Construccion
  'FOOD PROCESSING':                           '670', // Carnicero
  'CANNABIS CULTIVATION AND PROCESSING':       '663', // Agricultura
  'ENVIRONMENTAL SERVICES':                    '699', // Landscape
  'AGRICULTURE':                               '663', // Agricultura
  'FOOD AND BEVERAGE':                         '710', // Restaurant
  'CHILD DAY CARE SERVICES':                   '712', // General
  'ENERGY & UTILITIES':                        '712', // General
  'AEROSPACE & MANUFACTURING':                 '703', // Mechanic
  'WHOLESALE':                                 '712', // General
  'AUTOMOTIVE':                                '703', // Mechanic
  'LANDSCAPING':                               '699', // Landscape
  'IMMIGRATION SERVICES':                      '712', // General
  // ── Typo variants ──
  'VALIDAR':                                   '712', // General
  'RECOLECTORESS Y VEGETALES':                 '663', // Agricultura (typo)
  'TRABAJADORES DE IVERNADEROS':               '663', // Agricultura (typo)
  'ASISTENTE SE COCINA':                       '677', // chef (typo)
  'CONDUCTORES VEHICULOS DE CARGA':            '689', // Driver (typo)
  'TECNICO EN ELEVADORES':                     '694', // entretien (typo)
  'REPARADORES DE REFRIGERADOES':              '694', // entretien (typo)
  'VALIDAR CARGO':                             '712', // General
  'RETAIL GROCERY':                            '681', // Supermarket
  'GENERAL':                                   '712', // General
};
