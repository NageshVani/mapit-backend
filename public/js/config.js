// MapIt frontend: config.js. Split from MapIt_MVP_v1.html lines 1522-1956 on 2026-11-15. Load order is set in public/index.html. Functions are global on purpose (inline onclick=).
// ═══════════════════════════════════════════════
// API_URL auto-detects environment — no manual changes needed
// ═══════════════════════════════════════════════
const API_URL = (() => {
  const h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:3001';
  if (h === 'www.mapit.co.in' || h === 'mapit.co.in') return 'https://api.mapit.co.in';
  return ''; // UAT / Vercel preview → same-origin API
})();

// ═══════════════════════════════════════════════
// RUNTIME CONFIG — public-by-design values (Supabase anon key, CARTO tile
// key, Mapbox token) fetched once from the backend rather than hardcoded
// into this file.
// Fetched eagerly at load time (not lazily on first use) so it's usually
// already resolved by the time initMap() needs a tile URL.
// ═══════════════════════════════════════════════
let RUNTIME_CFG = null;
const runtimeCfgPromise = fetch(`${API_URL}/api/config`).then(r=>r.json()).then(cfg=>{
  RUNTIME_CFG = cfg;
  return cfg;
}).catch(()=>({}));

// CARTO's free basemap tiles started requiring an API key (2026-08-29) —
// same public-key trust model as the Supabase anon key below, not a secret.
// Builds the tile URL with whatever key is currently known; callers that
// run before the config fetch resolves should re-apply this via
// tileLayer.setUrl(cartoTileUrl()) once runtimeCfgPromise settles.
// Superseded by mapboxTileUrl() below (Session 9D, 2026-08-29) — kept
// defined, unused, as a one-line rollback if the Mapbox switch needs undoing.
function cartoTileUrl(){
  const key = RUNTIME_CFG && RUNTIME_CFG.cartoApiKey;
  const base = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  return key ? `${base}?key=${key}` : base;
}

// Active basemap provider as of Session 9D (2026-08-29) — CARTO's raster
// tile product was deprecated/degraded (missing residential-street labels),
// so all 4 map inits now use Mapbox's raster Static/Streets tiles instead.
// Mapbox tiles are 512px (vs. CARTO's 256px) — every L.tileLayer() call
// using this URL must also set {tileSize:512, zoomOffset:-1} or the map
// renders zoomed-out/blurry. Token is a Mapbox *public* token (pk.*), same
// public-by-design trust model as cartoApiKey/supabaseAnonKey above.
function mapboxTileUrl(){
  const token = RUNTIME_CFG && RUNTIME_CFG.mapboxToken;
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/{z}/{x}/{y}{r}?access_token=${token}`;
}

// Session 9D item 7 (2026-08-31) — Bangalore-first launch: restrict every map
// surface to Bangalore + ~100km radius so users can't pan/zoom out to empty
// or irrelevant regions. This is the smallest rectangular lat/lng box that
// fully contains a 100km-radius circle centered on Bangalore (12.9716,
// 77.5946) — 100km ÷ ~111km/° latitude ≈ 0.90° lat; 100km ÷ (~111.3km/° ×
// cos(13°)) ≈ 0.92° lng. Viewport/UX-level only, as scoped with Nagesh — no
// server-side listing-coordinate validation (a separate future item if
// out-of-region listings actually turn up).
const MAPIT_REGION_BOUNDS = L.latLngBounds([12.07, 76.67], [13.87, 78.52]);

// Applied to every Leaflet map instance (browse map, home-location picker,
// post-listing picker, add-pin picker) right after it's created and sized.
// `maxBoundsViscosity: 1.0` is a hard stop, not an elastic bounce — the map
// simply won't pan past the box. `setMinZoom()` is computed from the box
// itself (via getBoundsZoom) rather than a fixed number, so zooming out
// can't shrink the bounded box down to a speck of empty space regardless of
// the viewer's screen size.
function _applyRegionBounds(map){
  map.setMaxBounds(MAPIT_REGION_BOUNDS);
  map.options.maxBoundsViscosity = 1.0;
  map.setMinZoom(map.getBoundsZoom(MAPIT_REGION_BOUNDS, false));
}

// Session 9F (2026-09-29) — fire-and-forget ping on each map init, one per
// Leaflet surface. This is the only server-side proxy for Mapbox tile-
// request volume that exists (Mapbox itself has no usage API at all) —
// logged into the existing audit_log table, read back by the admin
// Cost & Usage tab's estimate. Never awaited, never surfaces an error to
// the user — a failed ping just means one fewer data point for an
// internal estimate, never something worth interrupting map loading for.
function _pingMapLoad(surface){
  apiPost('/api/admin/map-load-ping', { surface }).catch(()=>{});
}

// SUPABASE CLIENT — Realtime chat only (all writes still go through the
// backend REST API above). Anon key is safe to expose — RLS is the boundary.
let sbClient = null;
let sbClientPromise = null;
function getSbClient(){
  if(sbClient) return Promise.resolve(sbClient);
  if(sbClientPromise) return sbClientPromise;
  sbClientPromise = runtimeCfgPromise.then(cfg=>{
    sbClient = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    return sbClient;
  });
  return sbClientPromise;
}

// ═══════════════════════════════════════════════
// CATEGORY DEFINITIONS
// ═══════════════════════════════════════════════
const CATS = [
  { id:'all', lbl:'All',             ico:'🗺️', col:'#F06030', subs:[] },
  { id:'re',  lbl:'Real Estate',     ico:'🏠',  col:'#F06030', subs:['All Types','Plots','Individual House','Builder Flat','Apartment','Commercial Building','Office Space','PG'] },
  { id:'veh', lbl:'Vehicles',        ico:'🚗',  col:'#3B82F6', subs:['All Types','Cars','2 Wheelers','Cycles','Trucks & Commercial'] },
  { id:'hh',  lbl:'Household Items', ico:'🏡',  col:'#22C55E', subs:['All Types','Electronic Appliances','Furniture','Home Decor'] },
];
// Session 9G — sidebar chips. Real Estate is split into Rent and Buy Property
// (rent is the most-searched in Bangalore); both map to category 're' plus a
// transaction filter. CATS above stays the data model (colours, labels, post form).
const BROWSE_CHIPS = [
  { id:'all',  cat:'all', txn:null,   lbl:'All',             ico:'🗺️' },
  { id:'rent', cat:'re',  txn:'Rent', lbl:'Rent Property',   ico:'🔑' },
  { id:'buy',  cat:'re',  txn:'Sell', lbl:'Buy Property',    ico:'🏠' },
  { id:'veh',  cat:'veh', txn:null,   lbl:'Vehicles',        ico:'🚗' },
  { id:'hh',   cat:'hh',  txn:null,   lbl:'Household',       ico:'🏡' },
];
const SUBCAT_MAP = {
  re:  ['Plots','Individual House','Builder Flat','Apartment','Commercial Building','Office Space','PG'],
  veh: ['Cars','2 Wheelers','Cycles','Trucks & Commercial'],
  hh:  ['Electronic Appliances','Furniture','Home Decor'],
};
const CAT_EMOJI = { re:'🏠', veh:'🚗', hh:'🏡' };
const SUBCAT_EMOJI = {
  'Plots':'🏗','Individual House':'🏠','Builder Flat':'🏢','Apartment':'🏢','Commercial Building':'🏬','Office Space':'💼','PG':'🛏️',
  'Cars':'🚗','2 Wheelers':'🛵','Cycles':'🚲','Trucks & Commercial':'🚛',
  'Electronic Appliances':'📺','Furniture':'🛋️','Home Decor':'🎨',
};

// ── TITLE PLACEHOLDER PER SUBCATEGORY ──
const TITLE_PLACEHOLDER = {
  re: {
    'Plots':               '30×40 North-facing Corner Plot, Ring Road Area',
    'Individual House':    '3BHK Independent House with Garden, Near School',
    'Builder Flat':        '2BHK Builder Flat, 3rd Floor, Park-Facing',
    'Apartment':           '2BHK Apartment in Prestige Society, Koramangala',
    'Commercial Building': '3-Storey Commercial Building on Main Road',
    'Office Space':        'Plug-and-Play Office Space, 20 Seats, Indiranagar',
    'PG':                  'Ladies PG, Double Sharing with Food, HSR Layout',
  },
  veh: {
    'Cars':               'Maruti Swift 2019 – Single Owner, 28k Kms',
    '2 Wheelers':         'Honda Activa 6G 2022 – Well Maintained, 8k Kms',
    'Cycles':             'Trek Mountain Bike – Barely Used',
    'Trucks & Commercial':'Tata 407 2018 – Good Condition, Ready to Transfer',
  },
  hh: {
    'Electronic Appliances':'LG 32-inch Smart TV – 2 Years Old, Works Perfectly',
    'Furniture':            'Solid Wood 3-Seater Sofa – Excellent Condition',
    'Home Decor':           'Set of 4 Decorative Wall Frames – Barely Used',
  },
};

// Half-room sizes are common in Bangalore (feedback FB-03, 2026-10-28).
// Keep '4+ BHK' as-is: edit-form prefill matches stored text exactly.
const BHK_OPTIONS = ['1 BHK','1.5 BHK','2 BHK','2.5 BHK','3 BHK','3.5 BHK','4 BHK','4.5 BHK','4+ BHK'];
// Real Estate types that can only be rented (FB-04). Keep in sync with
// RENT_ONLY_SUBCATEGORIES in src/config/listingRules.js (server enforces it).
const RENT_ONLY_SUBCATS = ['PG'];
// Types that may be posted without a photo (Plots: Session 9G; PG: Nagesh 2026-10-28)
const PHOTO_OPTIONAL_SUBCATS = ['Plots','PG'];
// Fields marked required:true must be filled/chosen (a required select starts
// at "— Select —"). Same rule in submitListing() and the step bar; the server
// re-checks via REQUIRED_DETAILS in src/config/listingRules.js.
function missingRequiredField(cat, sub){
  return ((LISTING_FIELDS[cat]||{})[sub] || []).find(f => f.required && !String(document.getElementById(`pf_${f.id}`)?.value || '').trim());
}

// ── CATEGORY-SPECIFIC LISTING FIELDS ──
// starred:true fields appear in map hover card
const LISTING_FIELDS = {
  re: {
    'Plots':               [
      { id:'area',        label:'Area (sq ft)',              type:'number', starred:true  },
      { id:'facing',      label:'Facing',                    type:'select', options:['North','South','East','West','North-East','North-West','South-East','South-West'], starred:true },
      { id:'plot_type',   label:'Intermediate or Corner',    type:'select', options:['Intermediate','Corner'] },
      { id:'road_width',  label:'Road Width (ft)',            type:'number' },
      { id:'total_price', label:'Total Price (₹)',            type:'number', starred:true  },
    ],
    'Individual House':    [
      { id:'plot_area',   label:'Plot Area (sq ft)',          type:'number', starred:true  },
      { id:'built_area',  label:'Constructed Area (sq ft)',   type:'number' },
      { id:'facing',      label:'Facing',                    type:'select', options:['North','South','East','West','North-East','North-West','South-East','South-West'], starred:true },
      { id:'plot_type',   label:'Intermediate or Corner',    type:'select', options:['Intermediate','Corner'] },
      { id:'road_width',  label:'Road Width (ft)',            type:'number' },
      { id:'floors',      label:'No. of Floors',              type:'number' },
      { id:'bhk',         label:'BHK',                       type:'select', options:BHK_OPTIONS, starred:true },
      { id:'age',         label:'Age of Building (years)',    type:'number', starred:true  },
      { id:'total_price', label:'Total Price (₹)',            type:'number', starred:true  },
    ],
    'Builder Flat':        [
      { id:'carpet_area', label:'Carpet Area (sq ft)',        type:'number', starred:true  },
      { id:'facing',      label:'Facing',                    type:'select', options:['North','South','East','West','North-East','North-West','South-East','South-West'], starred:true },
      { id:'floor_no',    label:'Floor Number',               type:'number' },
      { id:'total_floors',label:'Total No. of Floors',        type:'number' },
      { id:'bhk',         label:'BHK',                       type:'select', options:BHK_OPTIONS, starred:true },
      { id:'age',         label:'Age of Building (years)',    type:'number', starred:true  },
      { id:'total_price', label:'Total Price (₹)',            type:'number', starred:true  },
    ],
    'Apartment':           [
      { id:'carpet_area', label:'Carpet Area (sq ft)',        type:'number', starred:true  },
      { id:'facing',      label:'Facing',                    type:'select', options:['North','South','East','West','North-East','North-West','South-East','South-West'], starred:true },
      { id:'floor_no',    label:'Floor Number',               type:'number' },
      { id:'total_floors',label:'Total No. of Floors',        type:'number' },
      { id:'bhk',         label:'BHK',                       type:'select', options:BHK_OPTIONS, starred:true },
      { id:'age',         label:'Age of Building (years)',    type:'number', starred:true  },
      { id:'total_price', label:'Total Price (₹)',            type:'number', starred:true  },
    ],
    'Commercial Building': [
      { id:'plot_area',   label:'Plot Area (sq ft)',          type:'number', starred:true  },
      { id:'built_area',  label:'Constructed Area (sq ft)',   type:'number', starred:true  },
      { id:'facing',      label:'Facing',                    type:'select', options:['North','South','East','West','North-East','North-West','South-East','South-West'], starred:true },
      { id:'plot_type',   label:'Intermediate or Corner',    type:'select', options:['Intermediate','Corner'] },
      { id:'road_width',  label:'Road Width (ft)',            type:'number' },
      { id:'floors',      label:'No. of Floors',              type:'number' },
      { id:'age',         label:'Age of Building (years)',    type:'number', starred:true  },
      { id:'total_price', label:'Total Price (₹)',            type:'number', starred:true  },
    ],
    // Added 2026-09-29 (Session 9D item 8) — fields drafted by Nagesh, using
    // the Bare Shell → Plug-and-Play furnishing scale common to Indian
    // commercial office leasing rather than the residential
    // Furnished/Semi/Unfurnished scale used elsewhere in this app.
    'Office Space':        [
      { id:'carpet_area',        label:'Carpet Area (sq ft)',            type:'number', starred:true },
      { id:'super_built_up_area',label:'Super Built-up Area (sq ft)',    type:'number' },
      { id:'floor_no',           label:'Floor Number',                   type:'number' },
      { id:'furnishing',         label:'Furnishing Status',              type:'select', options:['Bare Shell','Warm Shell','Semi-Furnished','Fully Furnished','Plug-and-Play'], starred:true },
      // Nagesh's 2026-09-29 revision: washrooms/AC/lift/parking collapsed
      // from 4 separate fields into one free-text field with a tip, rather
      // than 4 separate Yes/No selects — same "no multi-select field type
      // exists yet" constraint as before, so this uses the existing
      // type:'text' + placeholder pattern (already used by brand/model
      // fields above) instead.
      { id:'essentials',         label:'Other Essentials',               type:'text', placeholder:'e.g. 2 Washrooms, AC, Lift, Covered Parking' },
      { id:'facing',             label:'Facing',                         type:'select', options:['North','South','East','West','North-East','North-West','South-East','South-West'] },
      { id:'age',                label:'Age of Building (years)',        type:'number' },
      { id:'total_price',        label:'Total Price (₹)',                type:'number', starred:true },
    ],
    // Added 2026-10-28 (feedback FB-04) — fields agreed by Nagesh. Rent only
    // (RENT_ONLY_SUBCATS). The rent keeps the id total_price so price, price
    // words and the "price required" check work unchanged; "/mo" comes from
    // transaction_type='Rent'. Meals = No locks Food Type to 'Not applicable'.
    'PG':                  [
      { id:'total_price',   label:'Monthly Rent per Bed (₹)',  type:'number', starred:true, required:true },
      { id:'sharing',       label:'Sharing',                   type:'select', options:['Single','Double','Triple','Dormitory'], starred:true },
      { id:'pg_for',        label:'PG For',                    type:'select', options:['Boys','Girls','Co-living (any)'], starred:true, required:true },
      { id:'meals',         label:'Meals Included',            type:'select', options:['Yes','No'], starred:true, required:true },
      { id:'food_type',     label:'Food Type',                 type:'select', options:['Veg only','Veg + Non-Veg','Not applicable'], required:true },
      { id:'furnishing',    label:'Furnishing Status',         type:'select', options:['Fully Furnished','Semi-Furnished','Unfurnished'] },
      { id:'deposit',       label:'Security Deposit (₹)',      type:'number' },
      { id:'amenities',     label:'Amenities',                 type:'text', placeholder:'e.g. WiFi, AC, Laundry, Housekeeping, Power Backup' },
      { id:'notice_period', label:'Notice Period',             type:'select', options:['15 days','1 month','2 months'] },
      { id:'available_from',label:'Available From',            type:'text', placeholder:'e.g. Immediately, 1 Nov' },
    ],
  },
  veh: {
    'Cars':               [
      { id:'brand',       label:'Brand',                     type:'text',   starred:true,  placeholder:'e.g. Maruti, Hyundai, Honda, Tata' },
      { id:'model',       label:'Model',                     type:'text',   starred:true,  placeholder:'e.g. Swift, i20, City, Nexon' },
      { id:'year',        label:'Year',                      type:'year',   starred:true  },
      { id:'kms',         label:'Kms Driven',                type:'number', starred:true  },
      { id:'owners',      label:'No. of Previous Owners',    type:'number', starred:true,  default:1 },
      { id:'fuel',        label:'Fuel Type / Electric?',     type:'select', options:['Petrol','Diesel','CNG','Electric','Hybrid'], starred:true },
      { id:'total_price', label:'Price (₹)',                  type:'number', starred:true  },
    ],
    '2 Wheelers':         [
      { id:'brand',       label:'Brand',                     type:'text',   starred:true,  placeholder:'e.g. Honda, TVS, Hero, Royal Enfield, Bajaj' },
      { id:'model',       label:'Model',                     type:'text',   starred:true,  placeholder:'e.g. Activa, Apache, Splendor, Bullet' },
      { id:'year',        label:'Year',                      type:'year',   starred:true  },
      { id:'kms',         label:'Kms Driven',                type:'number', starred:true  },
      { id:'owners',      label:'No. of Previous Owners',    type:'number', starred:true,  default:1 },
      { id:'fuel',        label:'Fuel / Electric?',          type:'select', options:['Petrol','Electric'], starred:true },
      { id:'total_price', label:'Price (₹)',                  type:'number', starred:true  },
    ],
    'Cycles':             [
      { id:'brand',       label:'Brand',                     type:'text',   starred:true,  placeholder:'e.g. Hero, BSA, Trek, Firefox' },
      { id:'model',       label:'Model',                     type:'text',   starred:true,  placeholder:'e.g. Sprint, Merlin, Ranger' },
      { id:'year',        label:'Year',                      type:'year'   },
      { id:'total_price', label:'Price (₹)',                  type:'number', starred:true  },
    ],
    'Trucks & Commercial':[
      { id:'brand',       label:'Brand',                     type:'text',   starred:true,  placeholder:'e.g. Tata, Mahindra, Ashok Leyland' },
      { id:'model',       label:'Model',                     type:'text',   starred:true,  placeholder:'e.g. Ace, Bolero, Dost, Eicher' },
      { id:'year',        label:'Year',                      type:'year',   starred:true  },
      { id:'kms',         label:'Kms Driven',                type:'number', starred:true  },
      { id:'owners',      label:'No. of Previous Owners',    type:'number', starred:true,  default:1 },
      { id:'fuel',        label:'Fuel Type / Electric?',     type:'select', options:['Diesel','Petrol','CNG','Electric'], starred:true },
      { id:'total_price', label:'Price (₹)',                  type:'number', starred:true  },
    ],
  },
  hh: {
    'Electronic Appliances':[
      { id:'item',        label:'Item',                      type:'text',   starred:true  },
      { id:'age',         label:'Age (years)',                type:'number', starred:true  },
      { id:'total_price', label:'Price (₹)',                  type:'number', starred:true  },
    ],
    'Furniture':          [
      { id:'item',        label:'Item',                      type:'text',   starred:true  },
      { id:'age',         label:'Age (years)',                type:'number', starred:true  },
      { id:'total_price', label:'Price (₹)',                  type:'number', starred:true  },
    ],
    'Home Decor':         [
      { id:'item',        label:'Item',                      type:'text',   starred:true  },
      { id:'age',         label:'Age (years)',                type:'number', starred:true  },
      { id:'total_price', label:'Price (₹)',                  type:'number', starred:true  },
    ],
  },
};

// ── AUTO-TITLE + "WRITE IT FOR ME" (Feedback Release 2, 2026-10-28) ──
// Rule-based templates built ONLY from the details the seller entered — no AI
// (no cost, no invented facts). Never uses the address, pin or phone, and
// leaves the price out of the description (it is shown anyway and goes stale).
// One builder per subcategory returns title parts; parts[0] is the core
// phrase, reused as the description's opening line. The 5-screen wizard
// will call the same buildAutoTitle()/buildAutoDescription().
const _inr = n => Number(n).toLocaleString('en-IN');
// Format by the field's unit (from its label), never every number: a Year
// must stay "2019", not "2,019".
// ── Vehicle year (Release 10A, Nagesh 2026-11-15) ──
// 4 digits, YEAR_MIN..this year. Older than OLD_VEHICLE_YEARS is allowed but
// shown with a "15+ years old" note. Same rules on the server (src/config/listingRules.js).
const YEAR_MIN = 1900, OLD_VEHICLE_YEARS = 15;
function yearIssue(v){
  v = String(v ?? '').trim();
  if(!v) return '';
  if(!/^\d{4}$/.test(v)) return 'Enter the year as 4 digits, e.g. 2019.';
  const y = Number(v), now = new Date().getFullYear();
  if(y > now) return `Year can't be later than ${now}.`;
  if(y < YEAR_MIN) return `Year can't be earlier than ${YEAR_MIN}.`;
  return '';
}
function isOldVehicleYear(v){
  return /^\d{4}$/.test(String(v ?? '').trim()) && !yearIssue(v) && new Date().getFullYear() - Number(v) > OLD_VEHICLE_YEARS;
}
function fmtDetailValue(f, v){
  if(f.type === 'year') return isOldVehicleYear(v) ? `${v} (${OLD_VEHICLE_YEARS}+ years old)` : v;
  const n = Number(v), isNum = f.type === 'number' && v !== '' && isFinite(n);
  if(!isNum) return v;
  if(/\(sq ft\)/.test(f.label)) return `${_inr(n)} sq ft`;
  if(/\(₹\)/.test(f.label))     return `₹${_inr(n)}`;
  if(/\(ft\)/.test(f.label))    return `${n} ft`;
  if(/\(years\)/.test(f.label)) return n < 1 ? 'less than a year' : `${n} year${n === 1 ? '' : 's'}`;
  if(f.id === 'kms')            return `${_inr(n)} km`;
  return v;
}
const _sqft = v => v ? `${_inr(v)} sq ft` : '';
const _facing = v => v ? `${v}-facing` : '';
const _flatTitle = kind => (d, tx) => [`${d.bhk || ''} ${kind} ${tx}`, _sqft(d.carpet_area), d.floor_no !== '' && d.floor_no != null ? `Floor ${d.floor_no}` : ''];
const _vehTitle = (d) => [[d.brand, d.model, d.year].filter(Boolean).join(' ') || 'Vehicle', d.kms ? `${_inr(d.kms)} km` : '', d.fuel];
const _itemTitle = (d) => [d.item || '', d.age === '' || d.age == null ? '' : (Number(d.age) < 1 ? 'less than a year old' : `${d.age} year${Number(d.age) === 1 ? '' : 's'} old`)];
const TITLE_BUILDERS = {
  'Plots':               (d, tx) => [`${_sqft(d.area)} ${d.plot_type === 'Corner' ? 'Corner ' : ''}Plot ${tx}`, _facing(d.facing)],
  'Individual House':    (d, tx) => [`${d.bhk || ''} Independent House ${tx}`, _facing(d.facing), d.plot_area ? `${_inr(d.plot_area)} sq ft plot` : ''],
  'Builder Flat':        _flatTitle('Builder Flat'),
  'Apartment':           _flatTitle('Apartment'),
  'Commercial Building': (d, tx) => [`${d.floors ? d.floors + '-Floor ' : ''}Commercial Building ${tx}`, _sqft(d.built_area)],
  'Office Space':        (d, tx) => [`${d.furnishing || ''} Office Space ${tx}`, _sqft(d.carpet_area)],
  'PG':                  (d) => [`${(d.pg_for || '').replace(' (any)', '')} PG`, d.sharing ? (d.sharing === 'Dormitory' ? 'Dormitory' : `${d.sharing} Sharing`) : '',
                                 d.meals === 'Yes' ? `with ${d.food_type === 'Veg + Non-Veg' ? 'Veg & Non-Veg' : d.food_type === 'Veg only' ? 'Veg' : ''} Meals`.replace('  ', ' ') : ''],
  'Cars':                _vehTitle,
  '2 Wheelers':          _vehTitle,
  'Trucks & Commercial': _vehTitle,
  'Cycles':              (d) => [`${[d.brand, d.model, d.year].filter(Boolean).join(' ')} Cycle`],
  'Electronic Appliances': _itemTitle,
  'Furniture':           _itemTitle,
  'Home Decor':          _itemTitle,
};
const DESC_CLOSING = {
  re:  'Message me on MapIt chat to know more or to arrange a visit.',
  veh: 'Message me on MapIt chat to know more or to arrange a test drive.',
  hh:  'Message me on MapIt chat to know more or to see it.',
};
// Reads the post form; returns { cat, sub, fields, d, tx } or null
function readPostDetails(){
  const cat = document.getElementById('postCat').value, sub = document.getElementById('postSubcat').value;
  if(!cat || !sub) return null;
  const fields = (LISTING_FIELDS[cat]||{})[sub] || [];
  const d = {};
  fields.forEach(f => { d[f.id] = String(document.getElementById(`pf_${f.id}`)?.value ?? '').trim(); });
  const txVal = document.querySelector('input[name="txType"]:checked')?.value;
  const tx = cat === 're' ? (txVal === 'Rent' ? 'for Rent' : 'for Sale') : '';
  return { cat, sub, fields, d, tx };
}
const _tidy = s => s.replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();
function autoTitleParts(p){
  const b = TITLE_BUILDERS[p.sub];
  return b ? b(p.d, p.tx).map(x => _tidy(x || '')).filter(Boolean) : [];
}
// Parts joined with ", ", dropping trailing parts until it fits the 80-char title limit
function buildAutoTitle(){
  const p = readPostDetails(); if(!p) return '';
  const parts = autoTitleParts(p);
  while(parts.length > 1 && parts.join(', ').length > 80) parts.pop();
  return parts.join(', ').slice(0, 80);
}
// Details are "Label: value" pairs joined with ", "; a new line starts only when
// a line would pass DESC_LINE_MAX chars (Feedback Release 3 — was one line per field).
const DESC_LINE_MAX = 70;
function buildAutoDescription(){
  const p = readPostDetails(); if(!p) return '';
  const pairs = p.fields
    .filter(f => f.id !== 'total_price' && p.d[f.id] !== '' && !(f.id === 'food_type' && p.d[f.id] === 'Not applicable'))
    // Label without its unit "(sq ft)" or a question tail "/ Electric?"
    .map(f => `${f.label.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s*\/\s*[^/]*\?$/, '')}: ${fmtDetailValue(f, p.d[f.id])}`);
  if(!pairs.length) return '';
  const lines = [];
  let cur = '';
  for(const pair of pairs){
    if(cur && cur.length + 2 + pair.length > DESC_LINE_MAX){ lines.push(cur + ','); cur = pair; }
    else cur = cur ? `${cur}, ${pair}` : pair;
  }
  lines.push(cur + '.');
  const parts = autoTitleParts(p);
  const core = p.sub === 'PG' ? parts.slice(0, 2).join(', ') : (parts[0] || p.sub);
  const opening = core + (p.cat === 're' ? '' : ' for sale') + '.';
  return [opening, '', ...lines, '', DESC_CLOSING[p.cat] || DESC_CLOSING.hh].join('\n').slice(0, 1000);
}
// Title follows the details while it is empty or still the last suggestion;
// once the seller types their own, it is left alone (force = ✨ Suggest button).
let _autoTitle = '';
function suggestTitle(force){
  const t = buildAutoTitle(), el = document.getElementById('postTitle');
  if(!t){ if(force) toast('Pick a type and fill in a few details first.'); return; }
  if(force || !el.value.trim() || el.value === _autoTitle){
    el.value = t; _autoTitle = t;
    if(typeof schedulePostSteps === 'function') schedulePostSteps();
  }
}
async function writeDescriptionForMe(){
  const text = buildAutoDescription(), el = document.getElementById('postDesc');
  if(!text){ toast('Pick a type and fill in a few details first.'); return; }
  if(el.value.trim() && el.value.trim() !== text){
    if(!(await mapitDialog({
      title: 'Replace your description?',
      message: 'Your text will be replaced with a description built from the details you entered. You can edit it afterwards.',
      okText: 'Replace',
    }))) return;
  }
  el.value = text;
  // Grow the box so the seller sees what was written (CSS caps it at 160px)
  el.style.maxHeight = '320px';
  el.style.height = Math.min(el.scrollHeight + 2, 320) + 'px';
  toast('✨ Description added. Check it and add anything a buyer should know.');
}
function listingEmoji(l){ return SUBCAT_EMOJI[l.subcategory||l.sub] || CAT_EMOJI[l.category||l.cat] || '📦'; }

function getInitials(name){
  if(!name || name === '—') return 'U';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if(parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

