/**
 * Script: Diagnosticar campañas en mDirector
 * Uso: npx tsx scripts/diagnose-mdirector.ts [campaignId]
 */

import 'dotenv/config';
import { MDirectorService } from '../server/services/mdirector.service.js';

async function run() {
  const campaignId = process.argv[2] || '49';
  
  if (!MDirectorService.isConfigured()) {
    console.error('❌ mDirector no está configurado (.env)');
    process.exit(1);
  }

  console.log('🔍 Diagnóstico mDirector');
  console.log('═'.repeat(50));
  console.log(`Campaña ID: ${campaignId}\n`);

  try {
    // 1. Obtener token
    console.log('[1/3] Obteniendo token OAuth...');
    const token = await MDirectorService.getToken();
    console.log(`✅ Token obtenido: ${token.substring(0, 20)}...\n`);

    // 2. Obtener todas las campañas
    console.log('[2/3] Obteniendo todas las campañas...');
    const campaigns = await MDirectorService.getCampaigns();
    console.log(`✅ ${campaigns.data?.length || 0} campañas encontradas\n`);
    
    // Buscar la campaña específica
    if (campaigns.data) {
      const campaign = campaigns.data.find((c: any) => String(c.id) === String(campaignId));
      if (campaign) {
        console.log(`📧 Campaña ${campaignId}:`);
        console.log(JSON.stringify(campaign, null, 2));
      } else {
        console.log(`⚠️  Campaña ${campaignId} no encontrada en lista`);
        console.log('Campañas disponibles:');
        campaigns.data.slice(0, 5).forEach((c: any) => {
          console.log(`  - ID: ${c.id}, Nombre: ${c.name}`);
        });
      }
    }

    // 3. Obtener listas
    console.log('\n[3/3] Obteniendo listas y segmentos...');
    const lists = await MDirectorService.getLists();
    console.log(`✅ ${lists.data?.length || 0} listas encontradas\n`);
    
    // Buscar lista 28
    if (lists.data) {
      const list28 = lists.data.find((l: any) => String(l.id) === '28');
      if (list28) {
        console.log('📋 Lista 28 (Ontario):');
        console.log(`  - Nombre: ${list28.name}`);
        console.log(`  - Contactos: ${list28.numContacts}`);
        console.log(`  - Activos: ${list28.numActiveContacts}`);
        console.log(`  - Inactivos: ${list28.numInactiveContacts}`);
        console.log(`  - Segmentos: ${list28.segments?.length || 0}`);
        
        if (list28.segments) {
          const seg712 = list28.segments.find((s: any) => String(s.id) === '712');
          if (seg712) {
            console.log(`\n  🎯 Segmento 712 (General):`);
            console.log(`     - Nombre: ${seg712.name}`);
            console.log(`     - Contactos: ${seg712.numContacts}`);
          }
        }
      }
    }

    console.log('\n═'.repeat(50));
    console.log('✅ Diagnóstico completado');
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

run().catch(console.error);
