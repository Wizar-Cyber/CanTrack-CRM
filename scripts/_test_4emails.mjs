/**
 * Envío de prueba a 3 correos específicos.
 * Crea lista + segmento temporal, suscribe solo esos correos, envía en 5 min.
 */
const PASSWORD  = process.env.MDIRECTOR_PASSWORD;
const USERNAME  = process.env.MDIRECTOR_USERNAME || '107843';
const FROM_NAME = process.env.MDIRECTOR_FROM_NAME || 'VSM Services';
const REPLY_TO  = process.env.MDIRECTOR_REPLY_TO  || 'info@vsmservices.ca';
const OAUTH_URL = 'https://app.mdirector.com/oauth2/token';
const API_URL   = 'https://api.mdirector.com';

const TEMPLATE_ID = '29e8adf3-077c-3db1-9512-b70ec6919091'; // Mecanico fork lift ingles
const SUBJECT     = '[TEST] Mecanico fork lift — VSM Services';
const TEST_CONTACTS = [
  { email: 'lozanoreiber1@gmail.com',   name: 'Reiber Test 1' },
  { email: 'ripreverse03@gmail.com',    name: 'Reiber Test 2' },
  { email: 'smartflow062025@gmail.com', name: 'SmartFlow Test' },
];
const WAIT_MS = 5 * 60 * 1000; // 5 minutos

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 1. Token
console.log('1. OAuth...');
const { access_token: token } = await fetch(OAUTH_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type:'password', client_id:'webapp', username:USERNAME, password:PASSWORD }).toString(),
}).then(r => r.json());
console.log('   Token OK');

const hform = { Authorization:`Bearer ${token}`, 'Content-Type':'application/x-www-form-urlencoded' };
const hjson = { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' };

// 2. Crear lista temporal
const ts = Date.now();
const listName = `TEST_${ts}`;
console.log(`\n2. Creando lista "${listName}"...`);
const listRes  = await fetch(`${API_URL}/api_list`, {
  method: 'POST', headers: hform,
  body: new URLSearchParams({ listName, language:'en' }).toString(),
}).then(r => r.json());
console.log('   ', listRes.response, listRes.message || '');
const listId = String(listRes.listId ?? listRes.data?.listId ?? '');
if (!listId) { console.error('❌ Sin listId:', JSON.stringify(listRes)); process.exit(1); }
console.log('   listId:', listId);

// 3. Crear segmento en esa lista
await sleep(1000);
console.log(`\n3. Creando segmento en lista ${listId}...`);
const segRes = await fetch(`${API_URL}/api_segment`, {
  method: 'POST', headers: hform,
  body: new URLSearchParams({ listId, segmentName: `test_seg_${ts}` }).toString(),
}).then(r => r.json());
console.log('   ', segRes.response, segRes.message || JSON.stringify(segRes).substring(0,150));
const segmentId = String(segRes.segmentId ?? segRes.data?.segmentId ?? segRes.data?.id ?? '');
if (!segmentId) { console.error('❌ Sin segmentId:', JSON.stringify(segRes)); process.exit(1); }
console.log('   segmentId:', segmentId);

// 4. Suscribir contactos
await sleep(1000);
console.log('\n4. Suscribiendo contactos...');
for (const { email, name } of TEST_CONTACTS) {
  const r = await fetch(`${API_URL}/api_contact`, {
    method: 'POST', headers: hform,
    body: new URLSearchParams({ email, name, listId, segmentId }).toString(),
  }).then(r => r.json());
  console.log(`   ${email}: ${r.response} ${r.message || r.txt || ''}`);
  await sleep(300);
}

// 5. Crear delivery
await sleep(1000);
const campName = `TEST4_${ts}`;
console.log('\n5. Creando delivery...');
const delRes = await fetch(`${API_URL}/api_delivery`, {
  method: 'POST', headers: hjson,
  body: JSON.stringify({
    type: 'email', name: campName, subject: SUBJECT,
    campaignName: campName, language: 'en',
    segments: JSON.stringify([segmentId]),
    templateId: TEMPLATE_ID, templateVariables: {},
    fromName: FROM_NAME, replyToName: FROM_NAME, replyToEmail: REPLY_TO,
  }),
}).then(r => r.json());
const envId = String(delRes?.data?.envId ?? '');
console.log(`   ${delRes?.response} envId="${envId}" ${delRes?.message || ''}`);
if (!envId) { console.error('❌ Sin envId:', JSON.stringify(delRes)); process.exit(1); }

// 6. Esperar y enviar
console.log(`\n6. Esperando 5 minutos para enviar (envId=${envId})...`);
const end = Date.now() + WAIT_MS;
while (Date.now() < end) {
  const left = Math.ceil((end - Date.now()) / 1000);
  process.stdout.write(`\r   ${left}s restantes...   `);
  await sleep(5000);
}

console.log('\n   Enviando con "now"...');
const schedRes = await fetch(`${API_URL}/api_delivery`, {
  method: 'PUT', headers: hjson,
  body: JSON.stringify({ envId, date: 'now' }),
}).then(r => r.json());
console.log(`   ${schedRes?.response} ${schedRes?.message || schedRes?.txt || ''}`);

console.log('\n─────────────────────────────────────');
console.log('✅ LISTO');
console.log('   envId    :', envId);
console.log('   listId   :', listId, '(temporal)');
console.log('   segmentId:', segmentId);
console.log('   Correos  :', TEST_CONTACTS.map(c => c.email).join(', '));
console.log('   Revisa tu correo en ~2 min');
console.log('─────────────────────────────────────');
