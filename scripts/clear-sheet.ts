import 'dotenv/config';
import { google } from 'googleapis';

const sheetId = process.argv[2];
if (!sheetId) {
  console.error('Usage: npx tsx scripts/clear-sheet.ts <SHEET_ID>');
  process.exit(1);
}

const credJson = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;
if (!credJson) {
  console.error('GOOGLE_SERVICE_ACCOUNT_CREDENTIALS no configurado');
  process.exit(1);
}

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(credJson),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

async function main() {
  // Get sheet metadata to find all sheets
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const sheetNames = meta.data.sheets?.map(s => s.properties?.title) || [];
  
  for (const name of sheetNames) {
    if (!name) continue;
    console.log(`Clearing sheet: ${name}`);
    
    // Get the sheet to find how many rows
    const data = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${name}!A:Z`,
    });
    
    const rows = data.data.values || [];
    if (rows.length <= 1) {
      console.log(`  Only header row in ${name}, skipping`);
      continue;
    }
    
    // Clear all rows except header (row 1)
    await sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: `${name}!A2:Z${rows.length}`,
    });
    console.log(`  Cleared ${rows.length - 1} data rows (kept header)`);
  }
  
  console.log('Sheet cleared successfully');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
