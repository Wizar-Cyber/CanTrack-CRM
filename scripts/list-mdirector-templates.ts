/**
 * Script: Listar cartas/templates disponibles en mDirector
 * Uso: npx tsx scripts/list-mdirector-templates.ts
 */

import 'dotenv/config';
import { MDirectorService } from '../server/services/mdirector.service.js';

async function run() {
  if (!MDirectorService.isConfigured()) {
    console.error('❌ mDirector no está configurado (.env)');
    process.exit(1);
  }

  console.log('📧 Listando cartas/templates en mDirector');
  console.log('═'.repeat(60));

  try {
    // Obtener envíos/campañas visibles por API. El ID real de Plantilla se copia
    // desde mDirector > Plantillas; la API pública de lectura no lo lista.
    console.log('\n[1/2] Obteniendo envíos...');
    const deliveries = await MDirectorService.getDeliveries();
    const items = deliveries.data?.data || [];
    
    if (!items.length) {
      console.log('⚠️  No hay envíos disponibles');
      process.exit(0);
    }

    console.log(`✅ ${items.length} envíos encontrados\n`);

    // Listar las más recientes
    const sorted = items
      .sort((a: any, b: any) => {
        return String(b.creationDate || '').localeCompare(String(a.creationDate || ''));
      })
      .slice(0, 30);

    console.log('📋 ENVÍOS DISPONIBLES COMO REFERENCIA:');
    console.log('─'.repeat(60));
    
    sorted.forEach((item: any, idx: number) => {
      console.log(`\n${idx + 1}. ${item.name || item.campaignName || `Delivery ${item.envId}`}`);
      console.log(`   envId: ${item.envId} | camId: ${item.camId} | subId: ${item.subId}`);
      console.log(`   Nombre: ${item.name || item.campaignName}`);
      console.log(`   Campaña: ${item.campaignName || '(sin campaña)'}`);
      console.log(`   Asunto: ${item.subject || '(sin asunto)'}`);
      console.log(`   Idioma: ${item.language || '-'}`);
      console.log(`   Estado: ${item.status || '-'}`);
      console.log(`   Entregas: ${item.deliveries || '0'}`);
      if (item.creationDate) console.log(`   Creada: ${item.creationDate}`);
    });

    console.log('\n' + '═'.repeat(60));
    console.log('⚠️  Para enviar con plantilla necesitas el templateId UUID copiado desde mDirector > Plantillas.\n');
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

run().catch(console.error);
