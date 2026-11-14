// UAT review-queue practice data (Session 9L step 6 — approvers' UAT, 2026-11-06).
// Pending listings for the /review page, in batches, so approvers have work
// on each day of a multi-day test. Run from the project root:
//   node -r dotenv/config scripts/uat/review-seed.js seed 1   → day 1 batch (12)
//   node -r dotenv/config scripts/uat/review-seed.js seed 2   → day 2 top-up (6)
//   node -r dotenv/config scripts/uat/review-seed.js seed 3   → day 3 top-up (5)
//   node -r dotenv/config scripts/uat/review-seed.js status   → what was decided so far
//   node -r dotenv/config scripts/uat/review-seed.js cleanup  → delete everything it created
//
// SAFETY
//   • UAT only: refuses to start unless SUPABASE_URL is the UAT project.
//   • Sellers are fake @example.com accounts → approve / change / reject sends
//     no real email. Every title ends in "(TEST)".
//   • Photos re-use public URLs of existing UAT photos (new listing_photos
//     ROWS only, fake storage_path) — storage files are never touched, so
//     cleanup can't delete a real photo.
//   • State (seller + listing IDs) in scripts/uat/.review-seed.json — git-ignored;
//     cleanup deletes it. Don't lose it before cleanup (titles end in "(TEST)"
//     as a fallback).
//
// `expect` = the decision a careful approver should make (answer key for
// Nagesh/Arun only; the approvers don't see it). Photo sets are matched to the
// item on purpose, except where the mismatch IS the test.
const path = require('path'), fs = require('fs'), crypto = require('crypto');
const ROOT = process.cwd();
const { supabaseAdmin: db } = require(path.join(ROOT, 'src/config/supabase'));
if (!(process.env.SUPABASE_URL || '').includes('xesekrkxbtybbxpsvxuz')) { console.error('ABORT: .env is not the UAT project'); process.exit(1); }
const STATE = path.join(__dirname, '.review-seed.json');

// Existing UAT photo sets, found by the title of the listing that owns them.
const PHOTO_SETS = {
  house2:    '2BHK indep house',
  house2b:   '2BHK intermediate house',
  housePut:  '2BHK house Putanna road',
  house4:    '4BHK East-Facing Independent House',
  flat:      '2BHK North facing Builder Flat',
  wagonr:    'Wagon R petrol',
  swift:     'Hyundai Swift 2008',
  swift2:    'Maruti Swift Original car',
  maruti:    'Maruthi Suziki 2012',
  apache:    'Honda Apache quick sale',
  bed:       'Zuari Queen size bed',
  pg:        'Ladies PG Veg',
};

const SELLERS = [
  { key: 'ramesh', full_name: 'Ramesh Gowda', nickname: 'Ramesh' },
  { key: 'priya',  full_name: 'Priya Nair',   nickname: 'Priya' },
];

// lat/lng = exact pin; the display point is offset ~150 m like a fuzzed listing.
const AREAS = {
  jayanagar:    [12.9250, 77.5938, 'Jayanagar 4th Block, Bengaluru 560011'],
  whitefield:   [12.9698, 77.7500, 'Whitefield, Bengaluru 560066'],
  koramangala:  [12.9352, 77.6245, 'Koramangala 5th Block, Bengaluru 560095'],
  hsr:          [12.9116, 77.6474, 'HSR Layout Sector 2, Bengaluru 560102'],
  indiranagar:  [12.9719, 77.6412, 'Indiranagar, Bengaluru 560038'],
  malleshwaram: [13.0035, 77.5710, 'Malleshwaram, Bengaluru 560003'],
  btm:          [12.9166, 77.6101, 'BTM Layout 2nd Stage, Bengaluru 560076'],
  yelahanka:    [13.1007, 77.5963, 'Yelahanka New Town, Bengaluru 560064'],
  ecity:        [12.8452, 77.6602, 'Electronic City Phase 1, Bengaluru 560100'],
  rajajinagar:  [12.9910, 77.5525, 'Rajajinagar, Bengaluru 560010'],
  banashankari: [12.9255, 77.5468, 'Banashankari 3rd Stage, Bengaluru 560085'],
  hebbal:       [13.0358, 77.5970, 'Hebbal, Bengaluru 560024'],
  marathahalli: [12.9569, 77.7011, 'Marathahalli, Bengaluru 560037'],
  basavanagudi: [12.9422, 77.5755, 'Basavanagudi, Bengaluru 560004'],
  mysuru:       [12.2958, 76.6394, null],   // pin far from the typed address (location test)
};

const BATCHES = {
  1: [
    { seller: 'ramesh', area: 'jayanagar', photos: 'house2', expect: 'Approve',
      category: 're', subcategory: 'Individual House', title: '2BHK independent house for sale, east facing (TEST)', price: 8500000,
      description: 'Ground floor 2BHK on a 30x40 site, 12 years old.\nCar parking, Cauvery water, 5 min walk to the 4th Block complex.',
      details: { bhk: '2 BHK', facing: 'East', floors: '1', plot_area: '1200', built_area: '1050', age: '12', road_width: '30', plot_type: 'Intermediate', transaction_type: 'Sale', total_price: '8500000' } },
    { seller: 'priya', area: 'whitefield', photos: 'wagonr', expect: 'Approve',
      category: 'veh', subcategory: 'Cars', title: 'Maruti Wagon R VXi 2016, petrol, 52,000 km (TEST)', price: 310000,
      description: 'Single owner, all services at the Maruti showroom. Insurance valid till March.\nReason for sale: moving abroad.',
      details: { brand: 'Maruti Suzuki', model: 'Wagon R VXi', year: '2016', kms: '52000', fuel: 'Petrol', owners: '1', total_price: '310000' } },
    { seller: 'ramesh', area: 'btm', photos: 'apache', expect: 'Approve',
      category: 'veh', subcategory: '2 Wheelers', title: 'TVS Apache RTR 160, 2020, 18,000 km (TEST)', price: 72000,
      description: 'Well maintained, new tyres and battery last year. Papers clear.',
      details: { brand: 'TVS', model: 'Apache RTR 160', year: '2020', kms: '18000', fuel: 'Petrol', owners: '1', total_price: '72000' } },
    { seller: 'priya', area: 'koramangala', photos: 'bed', expect: 'Approve',
      category: 'hh', subcategory: 'Furniture', title: 'Queen size cot with storage, 6 x 5 ft (TEST)', price: 9500,
      description: 'Engineered wood, hydraulic storage. 4 years old, no damage. Mattress not included.',
      details: { item: 'Queen size cot', age: '4', total_price: '9500' } },
    { seller: 'priya', area: 'hsr', photos: 'flat', expect: 'Approve',
      category: 're', subcategory: 'Builder Flat', title: '2BHK builder flat for rent, north facing, 1st floor (TEST)', price: 24000,
      description: 'Semi furnished, 2 bathrooms, covered bike parking. Family preferred. Deposit 2 months.',
      details: { bhk: '2 BHK', facing: 'North', floor_no: '1', total_floors: '3', carpet_area: '950', age: '6', transaction_type: 'Rent', total_price: '24000' } },
    { seller: 'priya', area: 'indiranagar', photos: 'pg', expect: 'Approve',
      category: 're', subcategory: 'PG', title: 'Ladies PG, twin sharing, veg meals (TEST)', price: 9000,
      description: 'Clean rooms, Wi-Fi, washing machine, 24x7 security. 10 min to Indiranagar metro.',
      details: { pg_for: 'Girls', sharing: 'Twin', meals: 'Yes', food_type: 'Veg only', deposit: '18000', furnishing: 'Fully Furnished', amenities: 'Wi-Fi, laundry', notice_period: '1 month', transaction_type: 'Rent', total_price: '9000' } },
    { seller: 'ramesh', area: 'rajajinagar', photos: 'swift', expect: 'Needs change → Phone number, email or links',
      category: 'veh', subcategory: 'Cars', title: 'Maruti Swift VDi 2014, diesel, good condition (TEST)', price: 285000,
      description: 'Second owner, new clutch. For quick sale call 98450 12345 or mail ramesh.cars@gmail.com',
      details: { brand: 'Maruti Suzuki', model: 'Swift VDi', year: '2014', kms: '96000', fuel: 'Diesel', owners: '2', total_price: '285000' },
      moderation_verdict: 'flagged', moderation_reason: 'phone number and email in the description' },
    { seller: 'priya', area: 'yelahanka', photos: null, expect: 'Needs change → Price missing or unrealistic',
      category: 're', subcategory: 'Plots', title: 'BDA approved 30x40 site for sale, Yelahanka (TEST)', price: 1,
      description: 'East facing corner site, khata ready, 40 ft road. Price negotiable.',
      details: { area: '1200', facing: 'East', plot_type: 'Corner', road_width: '40', transaction_type: 'Sale', total_price: '1' } },
    { seller: 'ramesh', area: 'malleshwaram', photos: 'maruti', expect: 'Needs change → Wrong category',
      category: 'hh', subcategory: 'Home Decor', title: 'Maruti Alto 800, 2012, petrol (TEST)', price: 135000,
      description: 'Running condition, AC works, 68,000 km. Insurance till June.',
      details: { item: 'Car', total_price: '135000' } },
    { seller: 'priya', area: 'banashankari', photos: 'house2b', expect: 'Needs change → Photos don\'t match',
      category: 'hh', subcategory: 'Furniture', title: '3+1+1 fabric sofa set, grey (TEST)', price: 15000,
      description: 'Five-seater sofa, 3 years old, cushions in good shape.',
      details: { item: 'Sofa set', age: '3', total_price: '15000' } },
    { seller: 'ramesh', area: 'hebbal', photos: null, expect: 'Reject → Looks like spam or a fake listing',
      category: 'hh', subcategory: 'Home Decor', title: 'Earn ₹50,000 every week from home!!! (TEST)', price: 999,
      description: 'No experience needed. Pay ₹999 registration and start earning today. Limited seats, join our Telegram group.',
      details: { item: 'Work from home kit', total_price: '999' },
      moderation_verdict: 'flagged', moderation_reason: 'looks like a work-from-home scheme, not an item for sale' },
    { seller: 'priya', area: 'basavanagudi', photos: null, expect: 'Reject → This item is not allowed (wildlife)',
      category: 'hh', subcategory: 'Home Decor', title: 'Antique ivory elephant figurine, 8 inch (TEST)', price: 45000,
      description: 'Real ivory, carved by hand, from my grandfather\'s collection. Very rare.',
      details: { item: 'Ivory figurine', age: '60', total_price: '45000' } },
  ],
  2: [
    { seller: 'priya', area: 'whitefield', photos: 'wagonr', expect: 'Reject → Duplicate (same as batch 1 Wagon R)',
      category: 'veh', subcategory: 'Cars', title: 'Maruti Wagon R VXi 2016, petrol, 52,000 km (TEST)', price: 310000,
      description: 'Single owner, all services at the Maruti showroom. Insurance valid till March.\nReason for sale: moving abroad.',
      details: { brand: 'Maruti Suzuki', model: 'Wagon R VXi', year: '2016', kms: '52000', fuel: 'Petrol', owners: '1', total_price: '310000' } },
    { seller: 'ramesh', area: 'basavanagudi', photos: 'housePut', expect: 'Approve',
      category: 're', subcategory: 'Individual House', title: '2BHK house for rent near Puttanna Road (TEST)', price: 22000,
      description: 'First floor, separate entrance, 2 bathrooms. Bike parking only. Vegetarians preferred.',
      details: { bhk: '2 BHK', facing: 'West', floors: '2', plot_area: '1200', built_area: '1000', age: '15', road_width: '30', plot_type: 'Intermediate', transaction_type: 'Rent', total_price: '22000' } },
    { seller: 'priya', area: 'marathahalli', photos: 'swift2', expect: 'Approve',
      category: 'veh', subcategory: 'Cars', title: 'Maruti Swift ZXi 2017, petrol, single owner (TEST)', price: 495000,
      description: 'Original paint, no accidents, 40,000 km. Service records available.',
      details: { brand: 'Maruti Suzuki', model: 'Swift ZXi', year: '2017', kms: '40000', fuel: 'Petrol', owners: '1', total_price: '495000' } },
    { seller: 'ramesh', area: 'mysuru', addressOverride: 'Jayanagar 9th Block, Bengaluru 560069', photos: 'house4', expect: 'Needs change → Location looks wrong',
      category: 're', subcategory: 'Individual House', title: '4BHK east facing house for sale, Jayanagar 9th Block (TEST)', price: 32500000,
      description: 'G+2, 40x60 site, 4 bedrooms, terrace garden. Close to Jayanagar 9th Block park.',
      details: { bhk: '4 BHK', facing: 'East', floors: '3', plot_area: '2400', built_area: '3600', age: '8', road_width: '40', plot_type: 'Intermediate', transaction_type: 'Sale', total_price: '32500000' } },
    { seller: 'priya', area: 'ecity', photos: null, expect: 'Approve (no photo is allowed)',
      category: 're', subcategory: 'Office Space', title: 'Furnished office space, 25 seats, Electronic City (TEST)', price: 85000,
      description: '1,500 sq ft, 25 workstations, 1 cabin, meeting room, power backup. Lease 3 years.',
      details: { total_price: '85000', transaction_type: 'Rent' } },
    { seller: 'ramesh', area: 'indiranagar', photos: null, expect: 'Reject → This item is not allowed (counterfeit)',
      category: 'hh', subcategory: 'Home Decor', title: 'Rolex Submariner first copy watch, boxed (TEST)', price: 3500,
      description: 'Master copy, looks exactly like original. Box and papers included.',
      details: { item: 'Watch', total_price: '3500' } },
  ],
  3: [
    { seller: 'priya', area: 'jayanagar', photos: 'house2', expect: 'Approve',
      category: 're', subcategory: 'Individual House', title: '2BHK ground floor house for rent, Jayanagar (TEST)', price: 26000,
      description: 'Independent ground floor, small garden, 1 car parking. Available from 1 December.',
      details: { bhk: '2 BHK', facing: 'East', floors: '2', plot_area: '1200', built_area: '1050', age: '12', road_width: '30', plot_type: 'Intermediate', transaction_type: 'Rent', total_price: '26000' } },
    { seller: 'ramesh', area: 'hsr', photos: 'apache', expect: 'Needs change → Details are incomplete or misleading',
      category: 'veh', subcategory: '2 Wheelers', title: 'Brand new bike, 0 km, 2009 model (TEST)', price: 95000,
      description: 'Brand new, never used.',
      details: { brand: 'TVS', model: 'Apache', year: '2009', kms: '0', fuel: 'Petrol', owners: '3', total_price: '95000' } },
    { seller: 'priya', area: 'koramangala', photos: null, expect: 'Approve',
      category: 'hh', subcategory: 'Electronic Appliances', title: 'LG 8 kg front load washing machine (TEST)', price: 14000,
      description: '5 years old, works perfectly. Inlet pipe and stand included.',
      details: { brand: 'LG', model: 'FHM1408BDL', total_price: '14000', condition_type: 'Good' } },
    { seller: 'ramesh', area: 'yelahanka', photos: null, expect: 'Approve',
      category: 'veh', subcategory: 'Cycles', title: 'Hero Sprint 26T geared cycle (TEST)', price: 6500,
      description: '21 gears, disc brakes, used for one year. Lock and stand included.',
      details: { brand: 'Hero', model: 'Sprint 26T', total_price: '6500', condition_type: 'Good' } },
    { seller: 'priya', area: 'banashankari', photos: 'flat', expect: 'Approve',
      category: 're', subcategory: 'Builder Flat', title: '2BHK flat for sale, Banashankari 3rd Stage (TEST)', price: 7200000,
      description: '1,050 sq ft, 1st floor, lift, covered car parking. OC and khata available.',
      details: { bhk: '2 BHK', facing: 'North', floor_no: '1', total_floors: '4', carpet_area: '1050', age: '6', transaction_type: 'Sale', total_price: '7200000' } },
  ],
};

// Short price like the page writes it: ₹3.1L, ₹9.5K, ₹3.25Cr.
function shortPrice(p) {
  const f = (n, u) => '₹' + String(+n.toFixed(2)).replace(/\.0+$/, '') + u;
  if (p >= 1e7) return f(p / 1e7, 'Cr');
  if (p >= 1e5) return f(p / 1e5, 'L');
  if (p >= 1e3) return f(p / 1e3, 'K');
  return '₹' + p;
}

const loadState = () => fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { sellers: {}, listings: [] };
const saveState = s => fs.writeFileSync(STATE, JSON.stringify(s, null, 2));

async function ensureSellers(state) {
  for (const s of SELLERS) {
    if (state.sellers[s.key]) continue;
    const email = `review-uat-${s.key}-${Date.now()}@example.com`;
    const { data, error } = await db.auth.admin.createUser({ email, password: 'Seed!' + crypto.randomBytes(8).toString('hex'), email_confirm: true });
    if (error) throw error;
    await db.from('profiles').upsert({ id: data.user.id, full_name: s.full_name, nickname: s.nickname });
    state.sellers[s.key] = data.user.id;
    saveState(state);
  }
}

async function photoUrls() {
  const out = {};
  for (const [key, title] of Object.entries(PHOTO_SETS)) {
    const { data } = await db.from('listings').select('id, listing_photos(public_url, sort_order)')
      .ilike('title', `${title}%`).not('title', 'ilike', '%(TEST)%').limit(1);
    out[key] = (data?.[0]?.listing_photos || []).filter(p => p.public_url)
      .sort((a, b) => a.sort_order - b.sort_order).map(p => p.public_url);
  }
  return out;
}

async function seed(batch) {
  const items = BATCHES[batch];
  if (!items) throw new Error(`Unknown batch "${batch}" — use 1, 2 or 3`);
  const state = loadState();
  if (state.listings.some(l => l.batch === +batch)) throw new Error(`Batch ${batch} already seeded (see status)`);
  await ensureSellers(state);
  const photos = await photoUrls();
  const now = Date.now();
  let made = 0, photoRows = 0;
  for (const [i, it] of items.entries()) {
    const [lat, lng, addr] = AREAS[it.area];
    const row = {
      seller_id: state.sellers[it.seller], category: it.category, subcategory: it.subcategory,
      title: it.title, description: it.description, price: it.price, price_label: shortPrice(it.price),
      details: it.details, address: it.addressOverride || addr,
      lat, lng, display_lat: +(lat + 0.0011).toFixed(6), display_lng: +(lng - 0.0009).toFixed(6),
      status: 'pending', show_phone: 'never',
      moderation_verdict: it.moderation_verdict || 'clean', moderation_reason: it.moderation_reason || null,
      // Staggered "waiting since" so the queue order looks real (oldest first).
      created_at: new Date(now - (items.length - i) * 7 * 60e3).toISOString(),
    };
    const { data: l, error } = await db.from('listings').insert(row).select('id').single();
    if (error) throw new Error(`${it.title}: ${error.message}`);
    const urls = it.photos ? photos[it.photos] || [] : [];
    if (it.photos && !urls.length) console.warn(`  ⚠️  no photos found for set "${it.photos}" — listing has none`);
    if (urls.length) {
      const { error: pErr } = await db.from('listing_photos').insert(urls.slice(0, 5).map((u, k) =>
        ({ listing_id: l.id, storage_path: `review-seed/${l.id}/${k}.jpg`, public_url: u, sort_order: k })));
      if (pErr) throw new Error(`${it.title} photos: ${pErr.message}`);
      photoRows += Math.min(urls.length, 5);
    }
    state.listings.push({ id: l.id, batch: +batch, title: it.title, expect: it.expect });
    saveState(state);
    made++;
  }
  console.log(`Batch ${batch}: ${made} pending listings, ${photoRows} photo rows.\n`);
  printKey(state.listings.filter(l => l.batch === +batch));
}

function printKey(list) {
  console.log('Answer key (for Nagesh/Arun — not for the approvers):');
  list.forEach((l, i) => console.log(`  ${String(i + 1).padStart(2)}. ${l.title.replace(' (TEST)', '')}\n      → ${l.expect}`));
}

async function status() {
  const state = loadState();
  if (!state.listings.length) return console.log('Nothing seeded.');
  const { data } = await db.from('listings').select('id, status, rejection_reason').in('id', state.listings.map(l => l.id));
  const byId = Object.fromEntries((data || []).map(r => [r.id, r]));
  const { data: rev } = await db.from('listing_reviews').select('listing_id, decision, reason_code, reviewer_id, created_at')
    .in('listing_id', state.listings.map(l => l.id)).order('created_at');
  const { data: staff } = await db.from('staff_members').select('user_id, display_name');
  const who = Object.fromEntries((staff || []).map(s => [s.user_id, s.display_name]));
  const last = {};
  (rev || []).forEach(r => { last[r.listing_id] = r; });
  for (const l of state.listings) {
    const r = byId[l.id], d = last[l.id];
    const got = !r ? 'DELETED' : r.status === 'pending' ? '⏳ waiting'
      : `${r.status}${d ? ` · ${d.decision}${d.reason_code ? ' / ' + d.reason_code : ''} by ${who[d.reviewer_id] || 'unknown'}` : ''}`;
    console.log(`[b${l.batch}] ${l.title.replace(' (TEST)', '')}\n      expected: ${l.expect}\n      actual  : ${got}`);
  }
}

async function cleanup() {
  const state = loadState();
  const ids = state.listings.map(l => l.id);
  if (ids.length) {
    await db.from('listing_photos').delete().in('listing_id', ids);
    const { error } = await db.from('listings').delete().in('id', ids);
    if (error) throw error;
  }
  for (const id of Object.values(state.sellers)) await db.auth.admin.deleteUser(id);
  if (fs.existsSync(STATE)) fs.unlinkSync(STATE);
  console.log(`Deleted ${ids.length} listings + ${Object.keys(state.sellers).length} sellers.`);
}

const [cmd, arg] = process.argv.slice(2);
({ seed: () => seed(arg), status, cleanup }[cmd] || (() => { console.log('Usage: seed <1|2|3> | status | cleanup'); }))()
  .catch(e => { console.error('ERROR', e.message); process.exit(1); });
