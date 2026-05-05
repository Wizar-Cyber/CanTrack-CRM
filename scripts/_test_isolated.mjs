/**
 * Test aislado: crea lista nueva → suscribe SOLO el correo de prueba → envía.
 * Nunca toca segmentos compartidos, así que no llega a contactos reales.
 */
const PASSWORD  = process.env.MDIRECTOR_PASSWORD;
const USERNAME  = process.env.MDIRECTOR_USERNAME || '107843';
const FROM_NAME = process.env.MDIRECTOR_FROM_NAME || 'VSM Services';
const REPLY_TO  = process.env.MDIRECTOR_REPLY_TO  || 'info@vsmservices.ca';
const OAUTH_URL = 'https://app.mdirector.com/oauth2/token';
const API_URL   = 'https://api.mdirector.com';

const TEMPLATE_ID = '29e8adf3-077c-3db1-9512-b70ec6919091'; // Mecanico fork lift ingles
const SUBJECT     = '[TEST] Fork Lift Mechanic — VSM Services';
const TO_EMAIL    = 'lozanoreiber1@gmail.com';
const TO_NAME     = 'Maple Leaf Logistics Inc.';

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

// 2. Nueva lista exclusiva para este test
const ts = Date.now();
const listName = `_TEST_ISOLATED_${ts}`;
console.log(`\n2. Creando lista "${listName}"...`);
const listRes = await fetch(`${API_URL}/api_list`, {
  method: 'POST', headers: hform,
  body: new URLSearchParams({ listName, language: 'en' }).toString(),
}).then(r => r.json());
console.log('   ', listRes.response, listRes.message || '');
const listId = String(listRes.listId ?? listRes.data?.listId ?? '');
if (!listId) { console.error('❌ Sin listId:', JSON.stringify(listRes)); process.exit(1); }
console.log('   listId:', listId);

// 3. Suscribir SOLO el correo de prueba (sin segmentId → solo pertenece a esta lista)
await sleep(1500);
console.log(`\n3. Suscribiendo ${TO_EMAIL}...`);
const subRes = await fetch(`${API_URL}/api_contact`, {
  method: 'POST', headers: hform,
  body: new URLSearchParams({ email: TO_EMAIL, name: TO_NAME, listId }).toString(),
}).then(r => r.json());
console.log('   ', subRes.response, subRes.message || subRes.txt || JSON.stringify(subRes).substring(0, 200));

// 4. Crear delivery apuntando a la lista completa (sin segmento)
await sleep(1500);
const campName = `_TEST_ISO_${ts}`;
console.log('\n4. Creando delivery (lista exclusiva, sin segmentos compartidos)...');
const delRes = await fetch(`${API_URL}/api_delivery`, {
  method: 'POST', headers: hjson,
  body: JSON.stringify({
    type: 'email',
    name: campName,
    campaignName: campName,
    subject: SUBJECT,
    language: 'en',
    listId,                            // apunta a la lista nueva, no al segmento 753
    templateId: TEMPLATE_ID,
    templateVariables: {},
    fromName: FROM_NAME,
    replyToName: FROM_NAME,
    replyToEmail: REPLY_TO,
  }),
}).then(r => r.json());

console.log('   Respuesta delivery:', JSON.stringify(delRes).substring(0, 400));
const envId = String(delRes?.data?.envId ?? delRes?.envId ?? '');
if (!envId) { console.error('❌ Sin envId. Respuesta completa:', JSON.stringify(delRes)); process.exit(1); }
console.log('   envId:', envId);

// 5. Enviar ahora
await sleep(1500);
console.log('\n5. Enviando...');
const schedRes = await fetch(`${API_URL}/api_delivery`, {
  method: 'PUT', headers: hjson,
  body: JSON.stringify({ envId, date: 'now' }),
}).then(r => r.json());
console.log('   ', schedRes?.response, schedRes?.message || schedRes?.txt || '');

console.log('\n─────────────────────────────────────');
console.log('✅ LISTO');
console.log('   Para  :', TO_EMAIL, '/', TO_NAME);
console.log('   ListId :', listId, '(exclusiva, solo tu correo)');
console.log('   envId  :', envId);
console.log('   Revisa inbox + spam en ~2 min');
console.log('─────────────────────────────────────');
