/**
 * Envío de prueba a UN solo correo.
 * Lista 30 (Quebec), Segmento 753 (Mechanic), Plantilla: Mecanico fork lift ingles
 */
const PASSWORD    = process.env.MDIRECTOR_PASSWORD;
const USERNAME    = process.env.MDIRECTOR_USERNAME || '107843';
const FROM_NAME   = process.env.MDIRECTOR_FROM_NAME || 'VSM Services';
const REPLY_TO    = process.env.MDIRECTOR_REPLY_TO  || 'info@vsmservices.ca';
const OAUTH_URL   = 'https://app.mdirector.com/oauth2/token';
const API_URL     = 'https://api.mdirector.com';

const TEMPLATE_ID = '29e8adf3-077c-3db1-9512-b70ec6919091'; // Mecanico fork lift ingles
const LIST_ID     = '30';   // Quebec
const SEGMENT_ID  = '753';  // Mechanic / Fork Lift
const SUBJECT     = '[TEST] Mecanico Fork Lift — VSM Services';

const CONTACT = { email: 'lozanoreiber1@gmail.com', name: 'Maple Leaf Logistics Inc.' };

if (!PASSWORD) { console.error('❌ Falta MDIRECTOR_PASSWORD'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 1. Token
console.log('1. OAuth...');
const tokenRes = await fetch(OAUTH_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'password', client_id: 'webapp', username: USERNAME, password: PASSWORD }).toString(),
}).then(r => r.json());

if (!tokenRes.access_token) { console.error('❌ Token fallido:', JSON.stringify(tokenRes)); process.exit(1); }
const token = tokenRes.access_token;
console.log('   Token OK');

const hform = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' };
const hjson = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

// 2. Suscribir contacto
console.log(`\n2. Suscribiendo ${CONTACT.email} (${CONTACT.name})...`);
const subRes = await fetch(`${API_URL}/api_contact`, {
  method: 'POST', headers: hform,
  body: new URLSearchParams({ email: CONTACT.email, name: CONTACT.name, listId: LIST_ID, segmentId: SEGMENT_ID }).toString(),
}).then(r => r.json());
console.log('   ', subRes.response, subRes.message || subRes.txt || JSON.stringify(subRes).substring(0, 120));

// 3. Crear delivery
await sleep(1000);
const campName = `TEST_SINGLE_${Date.now()}`;
console.log('\n3. Creando delivery...');
const delRes = await fetch(`${API_URL}/api_delivery`, {
  method: 'POST', headers: hjson,
  body: JSON.stringify({
    type: 'email',
    name: campName,
    campaignName: campName,
    subject: SUBJECT,
    language: 'en',
    segments: JSON.stringify([SEGMENT_ID]),
    templateId: TEMPLATE_ID,
    templateVariables: {},
    fromName: FROM_NAME,
    replyToName: FROM_NAME,
    replyToEmail: REPLY_TO,
  }),
}).then(r => r.json());

const envId = String(delRes?.data?.envId ?? '');
console.log(`   ${delRes?.response} envId="${envId}" ${delRes?.message || ''}`);
if (!envId) { console.error('❌ Sin envId:', JSON.stringify(delRes)); process.exit(1); }

// 4. Enviar ahora
await sleep(1000);
console.log('\n4. Enviando con "now"...');
const schedRes = await fetch(`${API_URL}/api_delivery`, {
  method: 'PUT', headers: hjson,
  body: JSON.stringify({ envId, date: 'now' }),
}).then(r => r.json());
console.log(`   ${schedRes?.response} ${schedRes?.message || schedRes?.txt || ''}`);

console.log('\n─────────────────────────────────────');
console.log('✅ LISTO');
console.log('   Para:', CONTACT.email, '/', CONTACT.name);
console.log('   envId:', envId);
console.log('   Template: Mecanico fork lift ingles');
console.log('   El correo debería llegar en ~2 min');
console.log('─────────────────────────────────────');
