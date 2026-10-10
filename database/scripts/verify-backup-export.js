// Verifies a CSV downloaded from session-9k-prod-backup-export.sql.
// Prints ONLY table names and counts (never row contents — the file holds PII).
// Usage: node database/scripts/verify-backup-export.js <path-to.csv>
const fs = require('fs');

const file = process.argv[2];
if (!file) { console.error('Usage: node verify-backup-export.js <file.csv>'); process.exit(2); }
const text = fs.readFileSync(file, 'utf8');

// Minimal RFC 4180 parser: quoted fields, "" escapes, newlines inside quotes.
const rows = []; let row = []; let field = ''; let inQ = false;
for (let i = 0; i < text.length; i++) {
  const c = text[i];
  if (inQ) {
    if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
    else if (c === '"') inQ = false;
    else field += c;
  } else if (c === '"') inQ = true;
  else if (c === ',') { row.push(field); field = ''; }
  else if (c === '\n' || c === '\r') {
    if (c === '\r' && text[i + 1] === '\n') i++;
    row.push(field); field = ''; if (row.some(f => f !== '')) rows.push(row); row = [];
  } else field += c;
}
if (field !== '' || row.length) { row.push(field); rows.push(row); }

const [header, ...body] = rows;
const iName = header.indexOf('table_name'), iCount = header.indexOf('row_count'), iData = header.indexOf('data');
if (iName < 0 || iCount < 0 || iData < 0) { console.error('Unexpected header:', header.join(',')); process.exit(1); }

let ok = true;
for (const r of body) {
  let parsed = null;
  try { parsed = JSON.parse(r[iData]); } catch { /* truncated or malformed */ }
  const n = Array.isArray(parsed) ? parsed.length : 'INVALID JSON';
  const match = n === Number(r[iCount]);
  if (!match) ok = false;
  console.log(`${match ? 'OK  ' : 'FAIL'} ${r[iName].padEnd(18)} row_count=${String(r[iCount]).padStart(5)}  json_rows=${n}`);
}
console.log(`\n${body.length} tables · ${ok ? 'export complete — every JSON array matches its row_count' : 'MISMATCH — do not delete anything; re-export'}`);
process.exit(ok ? 0 : 1);
