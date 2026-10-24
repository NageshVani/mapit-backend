// One-off repair (pre-listing audit, 2026-10-24): listings whose public
// address still holds the seller's private saved-location label
// ("Home · Bangalore · Bangalore") get the server-derived area name
// instead — same rule as POST/PUT /api/listings (src/utils/areaName.js).
//
//   node -r dotenv/config scripts/maintenance/fix-listing-addresses.js          (dry run, lists rows)
//   node -r dotenv/config scripts/maintenance/fix-listing-addresses.js --apply  (writes, by ID)
//
// UAT only: refuses to run unless SUPABASE_URL is the UAT project.
// Production needs its own explicit go (Rule 10) — not via this script.
const path = require('path');
const ROOT = process.cwd();
if (!(process.env.SUPABASE_URL || '').includes('xesekrkxbtybbxpsvxuz')) {
  console.log('Refusing: SUPABASE_URL is not the UAT project.'); process.exit(1);
}
const { supabaseAdmin } = require(path.join(ROOT, 'src/config/supabase'));
const { areaName } = require(path.join(ROOT, 'src/utils/areaName'));
const { fuzzLocation } = require(path.join(ROOT, 'src/utils/geo'));
const APPLY = process.argv.includes('--apply');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const { data, error } = await supabaseAdmin.from('listings')
    .select('id, lat, lng, display_lat, display_lng, show_exact_location, address')
    .like('address', '%·%');
  if (error) { console.log('ERROR', error.message); process.exit(1); }
  console.log(`${data.length} listing(s) with a label-style address${APPLY ? '' : ' (dry run — add --apply to write)'}`);
  for (const l of data) {
    const pt = l.show_exact_location ? { lat: l.lat, lng: l.lng }
      : l.display_lat != null ? { lat: l.display_lat, lng: l.display_lng }
      : fuzzLocation(Number(l.lat), Number(l.lng), l.id);
    const area = await areaName(pt.lat, pt.lng);
    console.log(`${l.id}  "${l.address}"  →  "${area}"`);
    if (APPLY) {
      const { error: e } = await supabaseAdmin.from('listings').update({ address: area }).eq('id', l.id);
      if (e) console.log('  ERROR', e.message);
    }
    await sleep(1100);   // Nominatim usage policy: ≤ 1 request/second
  }
})();
