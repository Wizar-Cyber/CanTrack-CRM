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
  'GENERAL':                                   '712', // General
};
