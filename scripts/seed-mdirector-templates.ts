/**
 * Seed script: inserta todos los mapeos region+work → templateId UUID de mDirector.
 * Extraídos directamente del panel mDirector > Mis plantillas.
 *
 * Uso:
 *   $env:DATABASE_URL='postgresql://casaos:casaos@127.0.0.1:5434/casaos'
 *   npx tsx scripts/seed-mdirector-templates.ts
 */

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// [region, work_label, template_id, template_name, language]
const MAPPINGS: [string, string, string, string, string][] = [
  // ─────────────────────────────────────────────────────────────────────────
  // ONTARIO — plantillas en FRANCÉS
  // ─────────────────────────────────────────────────────────────────────────
  ['ontario', 'OPERARIO AGRICOLA',                     '4243aa55-aaf1-3b7c-988c-a10fa856b11d', '10.Operario Agricola Frances',                                      'fr'],
  ['ontario', 'AGRICULTOR',                            '4243aa55-aaf1-3b7c-988c-a10fa856b11d', '10.Operario Agricola Frances',                                      'fr'],
  ['ontario', 'EMPLEADA DOMESTICA',                    '9a37baa0-2250-3936-b2a0-11ad16cf860e', '12.Empleada domestica Frances',                                     'fr'],
  ['ontario', 'REPARADORES DE REFRIGERADORAS',         '330d39d7-729d-3d0f-926c-98cf5482d18c', '13.Reparadores de aires acondicionados y refrigeradores frances',    'fr'],
  ['ontario', 'TECNICO EN REPARACION DE ELEVADORES',   '6138de8f-6910-3b56-80bb-7abec897584b', '13.Tecnico en reparadores de elevadores frances',                   'fr'],
  ['ontario', 'MECANICO FORK LIFT',                    'b1d28958-4444-378d-b93d-d9180f6b50c7', '14.Mecanico fork lift frances',                                     'fr'],
  ['ontario', 'CARNICERIA',                            'e0eb8984-68b7-325d-afae-6842d148e575', '17.Carnicero frances',                                              'fr'],
  ['ontario', 'CARROCERIA',                            'af34fdd9-009c-38a7-8d6a-de7392847f1e', '19. Carroceria frances',                                            'fr'],
  ['ontario', 'OPERADORES DE MONTEACARGA',             '973a0289-e3ac-3372-82f3-0e06eaa3f534', '2.Operadores de montecarga Frances',                                'fr'],
  ['ontario', 'TIENDA DE COMESTIBLES',                 '8554e62f-58f9-3b37-94d6-f6c4846d8fd3', '21.Tienda de comestibles frances',                                  'fr'],
  ['ontario', 'SUPERMERCADO',                          'd8be3c99-5852-35f5-b987-22579e8e790b', '22.Supermercado frances',                                           'fr'],
  ['ontario', 'SOLDADOR',                              '9c80b2bf-6980-3897-9792-6af76b452520', '23.Soldador frances',                                               'fr'],
  ['ontario', 'RESTAURANTE',                           '6691f2d3-0664-311f-aa79-e543835de1c8', '24.Restaurante frances',                                            'fr'],
  ['ontario', 'REMOCION DE NIEVE',                     'c43365de-b53d-3c0f-90c5-7b1482a37b26', '25.Remocion de nieve frances',                                      'fr'],
  ['ontario', 'CONDUCTORES DE VEHICULOS DE CARGA',     'bf443ea5-10bd-365b-8d30-5efc684f3d03', '3.Conductores de camiones de vehiculos de carga Frances',           'fr'],
  ['ontario', 'MUDANZAS',                              '5f47f17e-f8d6-3258-aab2-7da331e5c765', '32.Mudanzas Frances',                                               'fr'],
  ['ontario', 'MECANICO',                              'bc17e6f4-6457-349c-b662-896bf67f1b6b', '33.Mecanico Frances',                                               'fr'],
  ['ontario', 'MANTENIMIENTO',                         '38cad024-8f7a-3efd-9c3c-1f8babeada3a', '34.Mantenimiento Frances',                                          'fr'],
  ['ontario', 'LAVANDERIA',                            '42d39e06-82c2-3df0-81a6-6fcf769abbc6', '35.Lavanderia Frances',                                             'fr'],
  ['ontario', 'HOTEL',                                 '759e8893-5b32-3d34-b364-5fab726f66e5', '36.Hotel Frances',                                                  'fr'],
  ['ontario', 'EXCAVACION',                            'f95fee8f-9176-3d23-9e7c-8c4dbf9ff9dc', '37.Excavacion Frances',                                             'fr'],
  ['ontario', 'CONSTRUCCION',                          '7690b9c4-fd15-3600-b291-362216c1c687', '38.Construccion Frances',                                           'fr'],
  ['ontario', 'DISEÑADOR DE INTERIORES',               '518b9118-a2ba-3fec-bef9-b1bb5f5b309d', '39.Disenador de interiores Frances',                                'fr'],
  ['ontario', 'RECEPCIONISTA',                         '75f95fff-06be-3cf4-b293-852c3aad0dea', '4.Recepcionista Frances',                                           'fr'],
  ['ontario', 'DOMICILIARIO',                          '567c90f1-ff98-3407-9bfb-afc2505abcf1', '40.Domiciliario Frances',                                           'fr'],
  ['ontario', 'EBANISTA',                              'e9cece28-767a-312b-b660-60da88f288bf', '40.Ebanista frances',                                               'fr'],
  ['ontario', 'MECANICO INDUSTRIAL',                   '04eb378c-16df-3db0-aa7f-fccfa0c8f304', '41.Mecanico industrial Frances',                                    'fr'],
  ['ontario', 'OPERADOR LASER',                        '14ccb104-4296-398f-b78c-6fe9f4365639', '42.Operador Laser Frances',                                         'fr'],
  ['ontario', 'LIMPIEZA INDUSTRIAL',                   '19179833-1058-3ad8-b827-2250c8a73b5e', '43.Limpieza industrial Frances',                                    'fr'],
  ['ontario', 'LIMPIEZA',                              'ad2a4897-9d0e-3128-b388-b1d9f7b0f2f7', '44.Limpieza Frances',                                               'fr'],
  ['ontario', 'MUCAMA',                                '7e6a6963-1796-31ea-89d0-6f2feade28c9', '45.Mucama Frances',                                                 'fr'],
  ['ontario', 'MATADERO',                              '3ddba6fd-351c-3347-af82-8424f7319bb5', '47.Matadero Frances',                                               'fr'],
  ['ontario', 'CHEF',                                  'fed32508-682d-31bc-9172-d20e8b8c10bc', '49.Chef Frances',                                                   'fr'],
  ['ontario', 'ASISTENTE DE COCINA',                   'fed32508-682d-31bc-9172-d20e8b8c10bc', '49.Chef Frances',                                                   'fr'],
  ['ontario', 'ELECTRICISTA',                          '52cba22c-e620-3fa0-961f-56436321478d', '5.Electricista Frances',                                            'fr'],
  ['ontario', 'PIZZERO',                               '0f265f61-3bbc-3f27-a2e8-2fcb6f10a8a5', '50.Pizzero Frances',                                                'fr'],
  ['ontario', 'GENERAL',                               '922aa84a-e0f5-3dae-8fe8-2abb7670effd', '51.General Frances',                                                'fr'],
  ['ontario', 'ALMACEN',                               '922aa84a-e0f5-3dae-8fe8-2abb7670effd', '51.General Frances',                                                'fr'],
  ['ontario', 'BARTENDERS',                            '922aa84a-e0f5-3dae-8fe8-2abb7670effd', '51.General Frances',                                                'fr'],
  ['ontario', 'CARPINTERO',                            'dff9b2b7-b688-3127-93e1-afac96d5df9c', '52.Carpintero Frances',                                             'fr'],
  ['ontario', 'MESEROS',                               '65f24871-2c5c-3d1d-81a9-225b8bbc751b', '6.Meseros Frances',                                                 'fr'],
  ['ontario', 'CARGA Y DESCARGA',                      'f58fe5c5-99e6-330f-a4a3-49744afd5b44', '7. CARGA Y DESCARGA Frances',                                       'fr'],
  ['ontario', 'EMPACADORES',                           'f58fe5c5-99e6-330f-a4a3-49744afd5b44', '7. CARGA Y DESCARGA Frances',                                       'fr'],
  ['ontario', 'RECOLECTORES DE FRUTAS Y VEGETALES',    'a1cc6084-6fac-35de-8d5c-a524458bfadd', '8.Recolectores de Frutas y Vegetales Frances',                      'fr'],
  ['ontario', 'TRABAJADORES DE INVERNADEROS',          '6f95f40d-4f04-3509-aa13-0b9bbcef41d5', 'Trabajadores en invernaderos Frances',                              'fr'],
  ['ontario', 'OPERARIO DE MAQUINARIA',                '5b1f6a71-9a6f-3b37-99fb-90f5c696cfd7', 'Operario de maquinaria Frances',                                    'fr'],
  ['ontario', 'OPERARIO DE PRODUCCION',                'fee31d36-8b1b-318a-845f-244d050c5b5f', 'Operario de produccion Frances',                                    'fr'],
  ['ontario', 'PAISAJISMO',                            '2bcf32d1-0e78-31be-b535-07ff2a192938', 'Paisajismo Frances',                                                'fr'],
  ['ontario', 'PANADERIA',                             '0228392b-f6ca-3ca0-b854-706f1e8641be', 'Panadero frances',                                                  'fr'],
  ['ontario', 'PERSONAL DE SEGURIDAD',                 'c66e977b-76fd-3264-af86-dbe4ec791cc5', 'Personal de Seguridad Frances',                                     'fr'],
  ['ontario', 'PINTOR',                                'f7f61d5c-fc08-3c9f-91a2-096772f02ea8', 'Pintor frances',                                                    'fr'],
  ['ontario', 'PLOMERO',                               '8aa03d04-ac72-3c35-b32e-16b0d905fe75', 'Plomero frances',                                                   'fr'],

  // ─────────────────────────────────────────────────────────────────────────
  // QUEBEC — plantillas en INGLÉS
  // ─────────────────────────────────────────────────────────────────────────
  ['quebec', 'CARGA Y DESCARGA',                       '99e7b836-d667-306f-809e-c5d5865fe864', 'Carga y Descarga Ingles',                                           'en'],
  ['quebec', 'EMPACADORES',                            '07ffffa4-7d6c-378b-a84e-4b5b0765486a', 'Empacadores Ingles',                                                'en'],
  ['quebec', 'CARNICERIA',                             'a2d47842-7639-3734-994b-308eece2dc3e', 'Carnicero Ingles',                                                  'en'],
  ['quebec', 'MATADERO',                               '5b372149-2e7d-3f7e-89d1-a273b6d0aa03', 'Matadero Ingles',                                                   'en'],
  ['quebec', 'CARPINTERO',                             '7f0c4b2a-b997-3c73-b9b9-a8668338cf3e', 'Carpintero Ingles',                                                 'en'],
  ['quebec', 'EBANISTA',                               '028d690e-65c0-346b-965b-4fe36d1c85e0', 'Ebanista Ingles',                                                   'en'],
  ['quebec', 'CARROCERIA',                             'cb3ccf1c-fdfb-3838-99dc-ceb0b00c6257', 'Carroceria Ingles',                                                 'en'],
  ['quebec', 'CHEF',                                   '1ee77853-ab95-3c51-a5fb-effe8f66a8e9', 'Chef Ingles',                                                       'en'],
  ['quebec', 'ASISTENTE DE COCINA',                    '1ee77853-ab95-3c51-a5fb-effe8f66a8e9', 'Chef Ingles',                                                       'en'],
  ['quebec', 'CONDUCTORES DE VEHICULOS DE CARGA',      '290f1c8e-f9b0-3404-afd0-fe44b2b02581', 'Conductores de camiones de vehiculos de carga Ingles',              'en'],
  ['quebec', 'CONSTRUCCION',                           'f51297c0-cf63-331a-af33-289e610f7744', 'Construccion Ingles',                                               'en'],
  ['quebec', 'DISEÑADOR DE INTERIORES',                '6cd1cc0e-2f6f-3f1c-8215-01c63675b9a8', 'Disenador de interiores Ingles',                                    'en'],
  ['quebec', 'DOMICILIARIO',                           '1e658c78-930c-3d7a-b0b3-0bf90449e217', 'Domiciliario Ingles',                                               'en'],
  ['quebec', 'ELECTRICISTA',                           '14ef6674-7678-3589-8087-b7b0d494b030', 'Electricista Ingles',                                               'en'],
  ['quebec', 'EMPLEADA DOMESTICA',                     '45ddd691-357d-3bfe-8305-61e42f242a91', 'Empleada domestica ingles',                                         'en'],
  ['quebec', 'EXCAVACION',                             '56244b48-0262-370a-bb17-59e8e5d95d07', 'Excavacion Ingles',                                                 'en'],
  ['quebec', 'GENERAL',                                '946452bf-3660-39ec-aa64-53f709fa1246', 'General Ingles',                                                    'en'],
  ['quebec', 'ALMACEN',                                '946452bf-3660-39ec-aa64-53f709fa1246', 'General Ingles',                                                    'en'],
  ['quebec', 'BARTENDERS',                             '946452bf-3660-39ec-aa64-53f709fa1246', 'General Ingles',                                                    'en'],
  ['quebec', 'HOTEL',                                  '5daae70d-4c27-34cc-8bb6-f269bb90d0c8', 'Hotel Ingles',                                                      'en'],
  ['quebec', 'LAVANDERIA',                             'a06a815a-fc60-3926-b76f-60968ebaa5f3', 'Lavanderia Ingles',                                                 'en'],
  ['quebec', 'LIMPIEZA INDUSTRIAL',                    '093b6070-416c-33e8-9dc2-a5286791fa9f', 'Limpieza industrial Ingles',                                        'en'],
  ['quebec', 'LIMPIEZA',                               '268aa4a2-4e4b-3d75-9f3a-502b37f5874e', 'Limpieza Ingles',                                                   'en'],
  ['quebec', 'MUCAMA',                                 'f74f3c36-2108-38a0-9b63-370b13e84aac', 'Mucama Ingles',                                                     'en'],
  ['quebec', 'MANTENIMIENTO',                          'a1fd0976-dbcf-3c2b-b5c6-3025854b7a92', 'Mantenimiento Ingles',                                              'en'],
  ['quebec', 'MECANICO FORK LIFT',                     '29e8adf3-077c-3db1-9512-b70ec6919091', 'Mecanico fork lift ingles',                                         'en'],
  ['quebec', 'MECANICO INDUSTRIAL',                    '8028a622-8a3c-3a38-a0e4-15b8324c6a82', 'Mecanico industrial Ingles',                                        'en'],
  ['quebec', 'MECANICO',                               '6944c804-21f8-3ac9-ad0d-7a9c050b556c', 'Mecanico Ingles',                                                   'en'],
  ['quebec', 'MESEROS',                                'ca47df14-3aa5-3b85-838b-cfa57b101e39', 'Meseros Ingles',                                                    'en'],
  ['quebec', 'MUDANZAS',                               'e4671798-8e86-38d6-b397-cab12f110f6f', 'Mudanzas Ingles',                                                   'en'],
  ['quebec', 'OPERADOR LASER',                         '9658b5ab-4964-345e-99e8-ce55f60e0a28', 'Operador Laser Ingles',                                             'en'],
  ['quebec', 'OPERADORES DE MONTEACARGA',              'beb381b3-2675-3b8b-a51f-ed9950aeeb39', 'Operadores de montecarga Ingles',                                   'en'],
  ['quebec', 'OPERARIO AGRICOLA',                      '744dcee3-677c-31ab-8fdb-5148760e0444', 'Operario Agricola Ingles',                                          'en'],
  ['quebec', 'AGRICULTOR',                             '744dcee3-677c-31ab-8fdb-5148760e0444', 'Operario Agricola Ingles',                                          'en'],
  ['quebec', 'OPERARIO DE MAQUINARIA',                 '3b512624-3434-32f3-99a3-8d5b028748f2', 'Operario de maquinaria Ingles',                                     'en'],
  ['quebec', 'OPERARIO DE PRODUCCION',                 '820a1857-909f-3413-9bb9-fa5ae22f019c', 'Operario de produccion Ingles',                                     'en'],
  ['quebec', 'PAISAJISMO',                             '071124e3-f2de-30ed-9efc-97a3ded613fd', 'Paisajismo Ingles',                                                 'en'],
  ['quebec', 'PANADERIA',                              '01c1224e-947d-31d0-8c15-eb5a936a07c6', 'Panadero ingles',                                                   'en'],
  ['quebec', 'PERSONAL DE SEGURIDAD',                  '39c932d2-dc16-353b-bca6-d2e1233dd13b', 'Personal de Seguridad Ingles',                                      'en'],
  ['quebec', 'PINTOR',                                 'c5ed5401-d57d-3a25-a57c-7b08b2263c85', 'Pintor Ingles',                                                     'en'],
  ['quebec', 'PIZZERO',                                'a1e57c16-2e7f-3739-826c-e1dd1843703e', 'Pizzero Ingles',                                                    'en'],
  ['quebec', 'PLOMERO',                                '102d61f9-0c6e-36e3-90a9-c1d8e878ee68', 'Plomero Ingles',                                                    'en'],
  ['quebec', 'RECEPCIONISTA',                          '8e0480f4-ddb1-3753-9fda-ae529c464af3', 'Recepcionista Ingles',                                              'en'],
  ['quebec', 'RECOLECTORES DE FRUTAS Y VEGETALES',     '4069f432-351e-34de-88f0-58a0885fadac', 'Recolectores de Frutas y Vegetales Ingles',                         'en'],
  ['quebec', 'TRABAJADORES DE INVERNADEROS',           'e82ea0fa-07ef-3abc-93d9-01951c892b8a', 'Trabajadores en invernaderos Ingles',                               'en'],
  ['quebec', 'REMOCION DE NIEVE',                      'b117f8ff-46f6-368a-a725-a9f9e7e6a1cf', 'Remocion de nieve Ingles',                                          'en'],
  ['quebec', 'REPARADORES DE REFRIGERADORAS',          '92cd2ed4-0297-330b-b092-86208dcd88ab', 'Reparadores de aires acondicionados y refrigeradores ingles',       'en'],
  ['quebec', 'RESTAURANTE',                            'bf29c396-5efd-3833-8892-ce2d1a123e28', 'Restaurante ingles',                                                'en'],
  ['quebec', 'SOLDADOR',                               'ddf57eb2-fdd0-37c8-b169-a71341ca79ee', 'Soldador Ingles',                                                   'en'],
  ['quebec', 'SUPERMERCADO',                           '014c7f4c-81c4-3ec3-b9ee-8e3c5ffdd2a0', 'Supermercado Ingles',                                               'en'],
  ['quebec', 'TECNICO EN REPARACION DE ELEVADORES',    'bcf0a7e7-8d18-3508-9f56-fe402c0e27cb', 'Tecnico en reparadores de elevadores Ingles',                       'en'],
  ['quebec', 'TIENDA DE COMESTIBLES',                  'e5898872-0ea3-3cee-8254-e9aadda5a7e2', 'Tienda de comestibles ingles',                                      'en'],
];

async function seed() {
  const client = await pool.connect();
  let inserted = 0;
  let updated = 0;

  try {
    for (const [region, work_label, template_id, template_name, language] of MAPPINGS) {
      const result = await client.query(
        `INSERT INTO mdirector_template_map (region, work_label, template_id, template_name, language)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (region, work_label) DO UPDATE
           SET template_id   = EXCLUDED.template_id,
               template_name = EXCLUDED.template_name,
               language      = EXCLUDED.language,
               active        = TRUE,
               updated_at    = NOW()`,
        [region, work_label, template_id, template_name, language],
      );
      if (result.rowCount === 1) inserted++;
      else updated++;
      process.stdout.write('.');
    }

    console.log(`\n✅ Seed completado: ${inserted} insertados, ${updated} actualizados`);
    console.log(`   Total mapeos: ${MAPPINGS.length} (Ontario: ${MAPPINGS.filter(m => m[0] === 'ontario').length}, Quebec: ${MAPPINGS.filter(m => m[0] === 'quebec').length})`);

    // Verificación
    const check = await client.query(
      `SELECT region, COUNT(*) as total FROM mdirector_template_map GROUP BY region ORDER BY region`,
    );
    console.log('\nMapeos en BD:');
    for (const row of check.rows) {
      console.log(`  ${row.region}: ${row.total} work_labels`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => {
  console.error('❌ Error en seed:', err.message);
  process.exit(1);
});
