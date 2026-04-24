import ExcelJS from 'exceljs';

const file = 'C:\\Users\\ripre\\OneDrive\\SmartFlow\\Proyecto Canada\\✅ Acton Vale.xlsx';
console.log('Reading:', file);

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);

wb.eachSheet((ws) => {
  console.log(`\n===== Sheet: ${ws.name} =====`);
  console.log('Row count:', ws.rowCount, 'Col count:', ws.columnCount);
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const values = [];
    for (let c = 1; c <= ws.columnCount; c++) {
      const v = row.getCell(c).value;
      values.push(v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v)));
    }
    console.log(`Row ${r}:`, JSON.stringify(values));
  }
});
