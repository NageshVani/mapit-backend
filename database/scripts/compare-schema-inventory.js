// Session 9K — compare two schema inventories produced by
// session-9k-schema-inventory.sql (e.g. production vs mapit-uat).
// Usage: node database/scripts/compare-schema-inventory.js <expected.json> <actual.json>
// Exit code 0 = identical (ignoring generated_at), 1 = differences printed.
// Schema metadata only — the inputs contain no user data.

const fs = require('fs');

const [expectedPath, actualPath] = process.argv.slice(2);
if (!expectedPath || !actualPath) {
  console.error('Usage: node compare-schema-inventory.js <expected.json> <actual.json>');
  process.exit(2);
}

const load = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
const expected = load(expectedPath);
const actual = load(actualPath);

// Identity of an item within each section, so order changes are not reported
const keyOf = {
  extensions: (x) => x.name,
  tables: (x) => x.table,
  columns: (x) => `${x.table}.${x.column}`,
  constraints: (x) => `${x.table}.${x.name}`,
  indexes: (x) => `${x.table}.${x.name}`,
  policies: (x) => `${x.schema}.${x.table}.${x.name}`,
  table_grants: (x) => `${x.table}.${x.role}`,
  functions: (x) => `${x.name}(${x.args})`,
  triggers: (x) => `${x.table}.${x.name}`,
  views: (x) => x.name,
  enum_types: (x) => x.name,
  storage_buckets: (x) => x.id,
  realtime_tables: (x) => x,
};

// CRLF vs LF in function bodies is not a real difference
const norm = (v) => JSON.stringify(v, (k, val) => (typeof val === 'string' ? val.replace(/\r\n/g, '\n') : val));

let diffs = 0;
for (const section of Object.keys(keyOf)) {
  const toMap = (arr) => new Map((arr || []).map((x) => [keyOf[section](x), x]));
  const exp = toMap(expected[section]);
  const act = toMap(actual[section]);
  for (const [k, v] of exp) {
    if (!act.has(k)) { console.log(`MISSING  ${section}: ${k}`); diffs++; }
    else if (norm(v) !== norm(act.get(k))) {
      console.log(`CHANGED  ${section}: ${k}\n  expected: ${norm(v)}\n  actual:   ${norm(act.get(k))}`);
      diffs++;
    }
  }
  for (const k of act.keys()) {
    if (!exp.has(k)) { console.log(`EXTRA    ${section}: ${k}`); diffs++; }
  }
}
if (expected.server_version !== actual.server_version) {
  console.log(`NOTE     server_version: ${expected.server_version} vs ${actual.server_version}`);
}

console.log(diffs === 0 ? '✅ Schemas match (ignoring generated_at).' : `❌ ${diffs} difference(s).`);
process.exit(diffs === 0 ? 0 : 1);
