// XSS test listing for the frontend escape-helper check (2026-10-16).
// Creates ONE active listing on UAT whose title / description / address /
// price label contain harmless HTML: before the fix the browser runs it (an
// alert pops up, text turns bold); after the fix it shows as plain text.
//   node -r dotenv/config scripts/security/xss-test-listing.js create
//   node -r dotenv/config scripts/security/xss-test-listing.js delete
// UAT only (guard on the local .env). Seller = the oldest non-admin UAT account.
const path = require('path');
const { supabaseAdmin } = require(path.join(process.cwd(), 'src/config/supabase'));
const { isAdminEmail } = require(path.join(process.cwd(), 'src/middleware/auth'));

const UAT_REF = process.env.UAT_PROJECT_REF || 'xesekrkxbtybbxpsvxuz';
const MARK = 'XSSTEST';

(async () => {
  const ref = (process.env.SUPABASE_URL || '').split('//')[1]?.split('.')[0];
  if (ref !== UAT_REF) throw new Error(`ABORT: local .env points at "${ref}", not UAT "${UAT_REF}".`);
  const mode = process.argv[2];

  if (mode === 'delete') {
    const { data, error } = await supabaseAdmin.from('listings').delete().like('reference_code', `${MARK}%`).select('id');
    if (error) throw error;
    console.log(`Deleted ${data.length} XSS test listing(s).`);
    return;
  }
  if (mode !== 'create') throw new Error('Usage: xss-test-listing.js create|delete');

  const { data: users, error: uErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
  if (uErr) throw uErr;
  const seller = users.users.filter(u => !isAdminEmail(u.email))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0];
  if (!seller) throw new Error('No non-admin UAT account to own the listing.');

  const { data, error } = await supabaseAdmin.from('listings').insert({
    seller_id: seller.id, category: 'hh', subcategory: 'Furniture', status: 'active',
    title: `<b>XSS</b> chair <img src=x onerror="alert('XSS in title')">`,
    description: `Plain line one.\n<img src=x onerror="alert('XSS in description')"><i>italic?</i>`,
    address: `<u>Koramangala</u> test address`,
    price: 1500, lat: 12.9352, lng: 77.6245, reference_code: `${MARK}-${Date.now().toString(36).toUpperCase()}`,
  }).select('id, reference_code').single();
  if (error) throw error;
  console.log(`Created XSS test listing ${data.reference_code} (id ${data.id}) at Koramangala — delete with: ... delete`);
})().catch(e => { console.error('💥 ' + e.message); process.exit(1); });
