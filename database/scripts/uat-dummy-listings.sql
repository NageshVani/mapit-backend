-- ============================================================
-- MapIt UAT — Dummy Listings Seed Script
-- Run in: Supabase Dashboard → SQL Editor → New Query → Paste → Run
-- Created: 2026-06-28
--
-- What this creates: 20 dummy listings across Bangalore
--   • 12 listings under Nagesh  (nagesh.aadi@gmail.com)
--   •  8 listings under Arun    (arun.bn1@gmail.com)
--
-- UAT scenarios covered:
--   • All 3 categories: Real Estate (re) · Vehicles (veh) · Household Items (hh)
--   • All major subcategories represented
--   • 3 listings at exact same GPS (Koramangala 5th Block) → tests T7-1 overlap pin
--   • Expiry states:  +20-28 days (normal) · +4-5 days (orange warning) ·
--                     +2 days (red danger) · past expiry (⚠️ Expired display)
--   • Status mix: active (shows in browse) · sold · pending (My Ads only)
--   • show_phone variety: always · on_agreement · never
--   • Realistic views_count so listing cards feel real
--   • No photos needed — app shows category emoji correctly for photo-less listings
--
-- CLEANUP (run when UAT done):
--   DELETE FROM listings WHERE reference_code LIKE 'MP-BLR-UAT%';
-- ============================================================


-- ============================================================
-- STEP 1 — VERIFY user IDs resolve before running inserts
--           (run these two lines alone first to confirm)
-- ============================================================
SELECT id AS nagesh_id, email FROM auth.users WHERE email = 'nagesh.aadi@gmail.com';
SELECT id AS arun_id,   email FROM auth.users WHERE email = 'arun.bn1@gmail.com';


-- ============================================================
-- STEP 2 — INSERT dummy listings
-- ============================================================


-- ──────────────────────────────────────────────────────────────
-- REAL ESTATE — 6 listings
-- ──────────────────────────────────────────────────────────────

-- RE-01 · 2BHK Apartment Rent · Koramangala 5th Block
-- ★ OVERLAP TEST POINT A (12.9352, 77.6245) — 3 listings share this pin
-- Nagesh | active | +20 days
INSERT INTO listings (
  seller_id, category, subcategory, title, description,
  price, price_label, lat, lng, address,
  specs, details, status,
  reference_code, expires_at, show_phone, views_count
) VALUES (
  (SELECT id FROM auth.users WHERE email = 'nagesh.aadi@gmail.com'),
  're', 'Apartment',
  '2BHK Semi-Furnished Apartment for Rent — Koramangala',
  'Spacious 2BHK semi-furnished apartment in prime Koramangala 5th Block. Walking distance to Forum Mall. Gated community with 24/7 security and power backup. Kitchen modular with chimney. 1 covered parking included.',
  28000, 'per month',
  12.9352, 77.6245,
  'Koramangala 5th Block, Bengaluru, Karnataka 560095',
  '[]'::jsonb,
  '{"transaction_type":"rent","floor_area_sqft":1050,"bedrooms":"2","bathrooms":"2","furnishing_status":"Semi-furnished","parking":"1","total_price":28000}'::jsonb,
  'active',
  'MP-BLR-UAT001', NOW() + INTERVAL '20 days', 'always', 45
);

-- RE-02 · 3BHK Builder Flat Sale · Whitefield
-- Nagesh | active | +4 days → ORANGE WARNING (≤5 days)
INSERT INTO listings (
  seller_id, category, subcategory, title, description,
  price, price_label, lat, lng, address,
  specs, details, status,
  reference_code, expires_at, show_phone, views_count
) VALUES (
  (SELECT id FROM auth.users WHERE email = 'nagesh.aadi@gmail.com'),
  're', 'Builder Flat',
  '3BHK Gated Community Flat for Sale — Whitefield',
  '1650 sqft 3BHK flat in a premium gated community near ITPL. 2 covered parking slots, clubhouse, swimming pool. BBMP approved. Close to Prestige Tech Park and Whitefield Metro. Genuine sale, no brokers.',
  8500000, 'negotiable',
  12.9698, 77.7500,
  'ITPL Main Road, Whitefield, Bengaluru, Karnataka 560066',
  '[]'::jsonb,
  '{"transaction_type":"sell","floor_area_sqft":1650,"bedrooms":"3","bathrooms":"3","furnishing_status":"Unfurnished","parking":"2","total_price":8500000}'::jsonb,
  'active',
  'MP-BLR-UAT002', NOW() + INTERVAL '4 days', 'on_agreement', 123
);

-- RE-03 · Independent House Sale · Jayanagar
-- Nagesh | active | +25 days
INSERT INTO listings (
  seller_id, category, subcategory, title, description,
  price, price_label, lat, lng, address,
  specs, details, status,
  reference_code, expires_at, show_phone, views_count
) VALUES (
  (SELECT id FROM auth.users WHERE email = 'nagesh.aadi@gmail.com'),
  're', 'Individual House',
  '4BHK East-Facing Independent House for Sale — Jayanagar',
  'Well-maintained 4BHK independent house on 1800 sqft plot in the heart of Jayanagar. East-facing, BDA approved layout. All 4 floors, 2200 sqft built-up. Quiet residential street, 5 min from Jayanagar Shopping Complex.',
  12500000, 'negotiable',
  12.9249, 77.5830,
  'Jayanagar 4th Block, Bengaluru, Karnataka 560011',
  '[]'::jsonb,
  '{"transaction_type":"sell","floor_area_sqft":2200,"plot_area_sqft":1800,"bedrooms":"4","bathrooms":"3","furnishing_status":"Semi-furnished","parking":"2","total_price":12500000}'::jsonb,
  'active',
  'MP-BLR-UAT003', NOW() + INTERVAL '25 days', 'always', 89
);

-- RE-04 · 1BHK Apartment Rent · BTM Layout
-- Nagesh | active | +2 days → RED DANGER (≤2 days)
INSERT INTO listings (
  seller_id, category, subcategory, title, description,
  price, price_label, lat, lng, address,
  specs, details, status,
  reference_code, expires_at, show_phone, views_count
) VALUES (
  (SELECT id FROM auth.users WHERE email = 'nagesh.aadi@gmail.com'),
  're', 'Apartment',
  '1BHK Fully Furnished Apartment for Rent — BTM Layout',
  'Ready-to-move fully furnished 1BHK in BTM 2nd Stage. Includes 1.5 Ton AC, 2-door fridge, washing machine, modular kitchen. Ideal for IT professionals. 10 min from Silk Board. Maintenance ₹1500/month extra.',
  15000, 'per month',
  12.9166, 77.6101,
  'BTM Layout 2nd Stage, Bengaluru, Karnataka 560076',
  '[]'::jsonb,
  '{"transaction_type":"rent","floor_area_sqft":580,"bedrooms":"1","bathrooms":"1","furnishing_status":"Furnished","parking":"0","total_price":15000}'::jsonb,
  'active',
  'MP-BLR-UAT004', NOW() + INTERVAL '2 days', 'never', 12
);

-- RE-05 · BDA Plot Sale · Yelahanka
-- Arun | active | +18 days
INSERT INTO listings (
  seller_id, category, subcategory, title, description,
  price, price_label, lat, lng, address,
  specs, details, status,
  reference_code, expires_at, show_phone, views_count
) VALUES (
  (SELECT id FROM auth.users WHERE email = 'arun.bn1@gmail.com'),
  're', 'Plot',
  'BDA Approved Corner Plot 1200 sqft — Yelahanka New Town',
  'East-facing BDA approved residential corner plot, 1200 sqft. 3-road access. All utilities available — electricity, water, drainage. Located in a developed layout with tarred roads. 5 min from Yelahanka New Town bus stand.',
  4200000, 'negotiable',
  13.1007, 77.5963,
  'Yelahanka New Town, Bengaluru, Karnataka 560064',
  '[]'::jsonb,
  '{"transaction_type":"sell","plot_area_sqft":1200,"total_price":4200000}'::jsonb,
  'active',
  'MP-BLR-UAT005', NOW() + INTERVAL '18 days', 'always', 67
);

-- RE-06 · Commercial Shop Rent · Electronic City
-- Arun | active | PAST EXPIRY (−3 days) → tests ⚠️ Expired display in My Ads
INSERT INTO listings (
  seller_id, category, subcategory, title, description,
  price, price_label, lat, lng, address,
  specs, details, status,
  reference_code, expires_at, show_phone, views_count
) VALUES (
  (SELECT id FROM auth.users WHERE email = 'arun.bn1@gmail.com'),
  're', 'Commercial Building',
  'Ground Floor Commercial Shop for Rent — Electronic City',
  '800 sqft ground floor commercial space on main road near Infosys campus. High footfall area. Suitable for pharmacy, retail shop, or small office. Floor-to-ceiling glass frontage. Generator backup available.',
  35000, 'per month',
  12.8399, 77.6770,
  'Electronic City Phase 1, Bengaluru, Karnataka 560100',
  '[]'::jsonb,
  '{"transaction_type":"rent","floor_area_sqft":800,"total_price":35000}'::jsonb,
  'active',
  'MP-BLR-UAT006', NOW() - INTERVAL '3 days', 'always', 34
);


-- ──────────────────────────────────────────────────────────────
-- VEHICLES — 7 listings
-- ──────────────────────────────────────────────────────────────

-- VEH-01 · Maruti Swift Dzire 2020 · Indiranagar
-- Nagesh | active | +22 days
INSERT INTO listings (
  seller_id, category, subcategory, title, description,
  price, price_label, lat, lng, address,
  specs, details, status,
  reference_code, expires_at, show_phone, views_count
) VALUES (
  (SELECT id FROM auth.users WHERE email = 'nagesh.aadi@gmail.com'),
  'veh', 'Cars',
  'Maruti Suzuki Swift Dzire VXI 2020 — Single Owner',
  'Well-maintained 2020 Swift Dzire VXI petrol, single owner. Full service history at Maruti authorised centre. No accidents, no repaint. Comprehensive insurance valid until Dec 2026. All original accessories.',
  650000, 'negotiable',
  12.9784, 77.6408,
  'Indiranagar 12th Main, Bengaluru, Karnataka 560038',
  '[]'::jsonb,
  '{"brand":"Maruti","model":"Swift Dzire VXI","year":"2020","fuel_type":"Petrol","km_driven":"38000","owners":"1","color":"Magma Grey","total_price":650000}'::jsonb,
  'active',
  'MP-BLR-UAT007', NOW() + INTERVAL '22 days', 'always', 156
);

-- VEH-02 · Royal Enfield Classic 350 2019 · JP Nagar
-- Nagesh | SOLD → tests ✅ Sold status display in My Ads
INSERT INTO listings (
  seller_id, category, subcategory, title, description,
  price, price_label, lat, lng, address,
  specs, details, status,
  reference_code, expires_at, show_phone, views_count
) VALUES (
  (SELECT id FROM auth.users WHERE email = 'nagesh.aadi@gmail.com'),
  'veh', '2 Wheelers',
  'Royal Enfield Classic 350 2019 — 2 Owners',
  'Classic 350 in good condition. New Ceat tyres and battery fitted 6 months ago. All documents clear — RC, insurance, PUC valid. Selling due to upgrade to Thunderbird. Price is firm.',
  175000, 'firm',
  12.9108, 77.5847,
  'JP Nagar 6th Phase, Bengaluru, Karnataka 560078',
  '[]'::jsonb,
  '{"brand":"Royal Enfield","model":"Classic 350","year":"2019","fuel_type":"Petrol","km_driven":"28000","owners":"2","total_price":175000}'::jsonb,
  'sold',
  'MP-BLR-UAT008', NOW() + INTERVAL '5 days', 'always', 45
);

-- VEH-03 · TVS Jupiter 125 2022 · Kumaraswamy Layout
-- Nagesh | active | +12 days
INSERT INTO listings (
  seller_id, category, subcategory, title, description,
  price, price_label, lat, lng, address,
  specs, details, status,
  reference_code, expires_at, show_phone, views_count
) VALUES (
  (SELECT id FROM auth.users WHERE email = 'nagesh.aadi@gmail.com'),
  'veh', '2 Wheelers',
  'TVS Jupiter 125 2022 — Single Owner Only 8500 KMs',
  'Barely used TVS Jupiter 125 in showroom condition. Single female owner, company transferred to Mumbai. All original parts, never repaired. Full fuel, ready to ride. Original purchase invoice available.',
  72000, NULL,
  12.8980, 77.5560,
  'Kumaraswamy Layout 2nd Stage, Bengaluru, Karnataka 560078',
  '[]'::jsonb,
  '{"brand":"TVS","model":"Jupiter 125","year":"2022","fuel_type":"Petrol","km_driven":"8500","owners":"1","total_price":72000}'::jsonb,
  'active',
  'MP-BLR-UAT009', NOW() + INTERVAL '12 days', 'always', 34
);

-- VEH-04 · Honda Activa 6G 2021 · Koramangala 5th Block
-- ★ OVERLAP TEST POINT A (12.9352, 77.6245) — same as RE-01
-- Arun | active | +15 days
INSERT INTO listings (
  seller_id, category, subcategory, title, description,
  price, price_label, lat, lng, address,
  specs, details, status,
  reference_code, expires_at, show_phone, views_count
) VALUES (
  (SELECT id FROM auth.users WHERE email = 'arun.bn1@gmail.com'),
  'veh', '2 Wheelers',
  'Honda Activa 6G 2021 — Excellent Condition All Original',
  'Honda Activa 6G, single owner from new, all original parts. Recent full service at Honda authorised centre. PUC valid 8 months. Both side visor guards, back carrier included. No scratches.',
  85000, NULL,
  12.9352, 77.6245,
  'Koramangala 5th Block, Bengaluru, Karnataka 560095',
  '[]'::jsonb,
  '{"brand":"Honda","model":"Activa 6G","year":"2021","fuel_type":"Petrol","km_driven":"12000","owners":"1","total_price":85000}'::jsonb,
  'active',
  'MP-BLR-UAT010', NOW() + INTERVAL '15 days', 'always', 78
);

-- VEH-05 · Hyundai Creta SX 2022 · HSR Layout
-- Arun | active | +28 days
INSERT INTO listings (
  seller_id, category, subcategory, title, description,
  price, price_label, lat, lng, address,
  specs, details, status,
  reference_code, expires_at, show_phone, views_count
) VALUES (
  (SELECT id FROM auth.users WHERE email = 'arun.bn1@gmail.com'),
  'veh', 'Cars',
  'Hyundai Creta SX(O) Diesel 2022 — Top Variant Single Owner',
  'Top-spec Creta SX(O) diesel, single owner, meticulous service history. Panoramic sunroof, ventilated seats, ADAS, wireless Android Auto. 360 camera. Comprehensive insurance with zero depreciation, valid until April 2027.',
  1250000, 'negotiable',
  12.9116, 77.6389,
  'HSR Layout Sector 2, Bengaluru, Karnataka 560102',
  '[]'::jsonb,
  '{"brand":"Hyundai","model":"Creta SX(O)","year":"2022","fuel_type":"Diesel","km_driven":"22000","owners":"1","color":"Polar White","total_price":1250000}'::jsonb,
  'active',
  'MP-BLR-UAT011', NOW() + INTERVAL '28 days', 'on_agreement', 210
);

-- VEH-06 · Tata Tiago XZ 2021 · Banashankari
-- Arun | PENDING → tests pending status in My Ads (awaiting admin review)
INSERT INTO listings (
  seller_id, category, subcategory, title, description,
  price, price_label, lat, lng, address,
  specs, details, status,
  reference_code, expires_at, show_phone, views_count
) VALUES (
  (SELECT id FROM auth.users WHERE email = 'arun.bn1@gmail.com'),
  'veh', 'Cars',
  'Tata Tiago XZ+ 2021 — Single Owner Connected Car',
  'Well-maintained Tata Tiago XZ+ petrol, 1 owner. Arkamys sound system, 7" touchscreen infotainment with connected car features. Full service at Tata authorised centre. Teal Blue exterior, no accidents.',
  550000, 'negotiable',
  12.9255, 77.5468,
  'Banashankari 3rd Stage, Bengaluru, Karnataka 560085',
  '[]'::jsonb,
  '{"brand":"Tata","model":"Tiago XZ+","year":"2021","fuel_type":"Petrol","km_driven":"18000","owners":"1","color":"Teal Blue","total_price":550000}'::jsonb,
  'pending',
  'MP-BLR-UAT012', NOW() + INTERVAL '30 days', 'always', 0
);

-- VEH-07 · Hero Sprint 26T Cycle · Malleshwaram
-- Arun | active | +10 days
INSERT INTO listings (
  seller_id, category, subcategory, title, description,
  price, price_label, lat, lng, address,
  specs, details, status,
  reference_code, expires_at, show_phone, views_count
) VALUES (
  (SELECT id FROM auth.users WHERE email = 'arun.bn1@gmail.com'),
  'veh', 'Cycles',
  'Hero Sprint 26T 21-Speed Mountain Cycle — Good Condition',
  'Hero Sprint 26T with Shimano 21-speed gearing. Adult size frame, good condition. Tyres have 60% tread remaining. Used for weekend rides. Suitable for daily commute or fitness. Self-pickup from Malleshwaram.',
  8500, NULL,
  13.0035, 77.5704,
  'Malleshwaram 18th Cross, Bengaluru, Karnataka 560003',
  '[]'::jsonb,
  '{"brand":"Hero","model":"Sprint 26T","condition_type":"Good","total_price":8500}'::jsonb,
  'active',
  'MP-BLR-UAT013', NOW() + INTERVAL '10 days', 'always', 23
);


-- ──────────────────────────────────────────────────────────────
-- HOUSEHOLD ITEMS — 7 listings
-- ──────────────────────────────────────────────────────────────

-- HH-01 · Samsung 55" 4K Smart TV · Koramangala 5th Block
-- ★ OVERLAP TEST POINT A (12.9352, 77.6245) — same as RE-01 and VEH-04
-- Nagesh | active | +20 days
-- (3 listings now share this exact pin — tests T7-1 same-location popup)
INSERT INTO listings (
  seller_id, category, subcategory, title, description,
  price, price_label, lat, lng, address,
  specs, details, status,
  reference_code, expires_at, show_phone, views_count
) VALUES (
  (SELECT id FROM auth.users WHERE email = 'nagesh.aadi@gmail.com'),
  'hh', 'Electronic Appliances',
  'Samsung 55" Crystal 4K UHD Smart TV — 2 Years Old',
  '2-year-old Samsung 55 inch 4K UHD Smart TV (Crystal Display technology). Excellent picture quality, no issues. All original accessories, remote, stand, and wall-mount bracket included. Sold as apartment is being vacated.',
  42000, 'negotiable',
  12.9352, 77.6245,
  'Koramangala 5th Block, Bengaluru, Karnataka 560095',
  '[]'::jsonb,
  '{"brand":"Samsung","model":"55 Crystal 4K UHD Smart TV","condition_type":"Good","total_price":42000}'::jsonb,
  'active',
  'MP-BLR-UAT014', NOW() + INTERVAL '20 days', 'always', 67
);

-- HH-02 · Teak Wood 5-Seater Sofa Set · Banashankari
-- Nagesh | active | +16 days
INSERT INTO listings (
  seller_id, category, subcategory, title, description,
  price, price_label, lat, lng, address,
  specs, details, status,
  reference_code, expires_at, show_phone, views_count
) VALUES (
  (SELECT id FROM auth.users WHERE email = 'nagesh.aadi@gmail.com'),
  'hh', 'Furniture',
  'Teak Wood 5-Seater Sofa Set with Centre Table — Like New',
  'Solid teak wood 3+1+1 sofa set with matching centre table. 3 years old, no damage, no stains. Cushion covers professionally dry-cleaned. Heavy-built, excellent craftsmanship. Selling as redecorating living room.',
  35000, 'negotiable',
  12.9255, 77.5468,
  'Banashankari 3rd Stage, Bengaluru, Karnataka 560085',
  '[]'::jsonb,
  '{"material":"Teak Wood","condition_type":"Like New","total_price":35000}'::jsonb,
  'active',
  'MP-BLR-UAT015', NOW() + INTERVAL '16 days', 'always', 44
);

-- HH-03 · LG 260L Double Door Refrigerator · HSR Layout
-- Arun | active | +7 days
INSERT INTO listings (
  seller_id, category, subcategory, title, description,
  price, price_label, lat, lng, address,
  specs, details, status,
  reference_code, expires_at, show_phone, views_count
) VALUES (
  (SELECT id FROM auth.users WHERE email = 'arun.bn1@gmail.com'),
  'hh', 'Electronic Appliances',
  'LG 260L Double Door Refrigerator — Works Perfectly',
  '5-star energy rated LG 260L double door fridge, 5 years old, no issues. Frost-free, vegetable crisper, tempered glass shelves. Selling as relocating abroad. Buyer to arrange transport (ground floor, easy access).',
  22000, 'negotiable',
  12.9116, 77.6389,
  'HSR Layout Sector 2, Bengaluru, Karnataka 560102',
  '[]'::jsonb,
  '{"brand":"LG","model":"GL-B281BBPX 260L","condition_type":"Good","total_price":22000}'::jsonb,
  'active',
  'MP-BLR-UAT016', NOW() + INTERVAL '7 days', 'on_agreement', 89
);

-- HH-04 · Dell Inspiron 15 Laptop · Indiranagar
-- Nagesh | active | +14 days
INSERT INTO listings (
  seller_id, category, subcategory, title, description,
  price, price_label, lat, lng, address,
  specs, details, status,
  reference_code, expires_at, show_phone, views_count
) VALUES (
  (SELECT id FROM auth.users WHERE email = 'nagesh.aadi@gmail.com'),
  'hh', 'Electronic Appliances',
  'Dell Inspiron 15 i5 11th Gen 8GB 512GB SSD — Like New',
  'Dell Inspiron 15 3511 laptop in like-new condition. i5 11th Gen processor, 8GB RAM, 512GB NVMe SSD, Windows 11 Home licensed. 1.5 years old. Original box, charger, and Dell laptop bag included. Battery holds 5+ hours.',
  38000, 'negotiable',
  12.9784, 77.6408,
  'Indiranagar 12th Main, Bengaluru, Karnataka 560038',
  '[]'::jsonb,
  '{"brand":"Dell","model":"Inspiron 15 3511 i5 11th Gen 8GB 512GB SSD","condition_type":"Like New","total_price":38000}'::jsonb,
  'active',
  'MP-BLR-UAT017', NOW() + INTERVAL '14 days', 'always', 132
);

-- HH-05 · Whirlpool 7.5 Kg Washing Machine · Whitefield
-- Arun | active | +9 days
INSERT INTO listings (
  seller_id, category, subcategory, title, description,
  price, price_label, lat, lng, address,
  specs, details, status,
  reference_code, expires_at, show_phone, views_count
) VALUES (
  (SELECT id FROM auth.users WHERE email = 'arun.bn1@gmail.com'),
  'hh', 'Electronic Appliances',
  'Whirlpool 7.5 Kg Semi-Automatic Washing Machine — Good Condition',
  '4-year-old Whirlpool 7.5 kg semi-automatic top-load washing machine. Both wash and spin tubs working perfectly. Regularly serviced. Selling as upgrading to fully automatic. Drain pipe and water inlet pipe included.',
  16000, NULL,
  12.9698, 77.7500,
  'ITPL Main Road, Whitefield, Bengaluru, Karnataka 560066',
  '[]'::jsonb,
  '{"brand":"Whirlpool","model":"7.5 Kg Semi-Automatic","condition_type":"Good","total_price":16000}'::jsonb,
  'active',
  'MP-BLR-UAT018', NOW() + INTERVAL '9 days', 'always', 51
);

-- HH-06 · 6-Seater Glass Top Dining Set · Malleshwaram
-- Arun | active | +21 days
INSERT INTO listings (
  seller_id, category, subcategory, title, description,
  price, price_label, lat, lng, address,
  specs, details, status,
  reference_code, expires_at, show_phone, views_count
) VALUES (
  (SELECT id FROM auth.users WHERE email = 'arun.bn1@gmail.com'),
  'hh', 'Furniture',
  '6-Seater Dining Table with Glass Top and Chairs — Good Condition',
  'Engineered wood 6-seater dining table with toughened glass top and 6 cushioned chairs. 3 years old, minor scratches on legs only (not visible from standing). Sturdy structure. Disassembles for transport.',
  18000, 'negotiable',
  13.0035, 77.5704,
  'Malleshwaram 18th Cross, Bengaluru, Karnataka 560003',
  '[]'::jsonb,
  '{"material":"Engineered Wood","condition_type":"Good","total_price":18000}'::jsonb,
  'active',
  'MP-BLR-UAT019', NOW() + INTERVAL '21 days', 'always', 29
);

-- HH-07 · Nilkamal 3-Door Wardrobe · Electronic City
-- Nagesh | active | +18 days
INSERT INTO listings (
  seller_id, category, subcategory, title, description,
  price, price_label, lat, lng, address,
  specs, details, status,
  reference_code, expires_at, show_phone, views_count
) VALUES (
  (SELECT id FROM auth.users WHERE email = 'nagesh.aadi@gmail.com'),
  'hh', 'Furniture',
  'Nilkamal 3-Door Wardrobe with Mirror — 2 Years Old',
  'Nilkamal Marvel 3-door plastic wardrobe with full-length mirror on centre door. 2 years old, no cracks or damage, hinges working perfectly. Easy to disassemble and transport. Suitable for bedroom or kids room.',
  8500, NULL,
  12.8399, 77.6770,
  'Electronic City Phase 1, Bengaluru, Karnataka 560100',
  '[]'::jsonb,
  '{"material":"Plastic/Fibre","condition_type":"Good","total_price":8500}'::jsonb,
  'active',
  'MP-BLR-UAT020', NOW() + INTERVAL '18 days', 'never', 17
);


-- ============================================================
-- STEP 3 — VERIFICATION
-- Run this after inserts to confirm all 20 listings are created
-- ============================================================
SELECT
  l.reference_code                                                  AS ref,
  l.category || '/' || l.subcategory                               AS category,
  LEFT(l.title, 45)                                                 AS title,
  l.status,
  TO_CHAR(l.price, 'FM₹99,99,999')                                 AS price,
  CASE
    WHEN l.expires_at < NOW() THEN '⚠️  EXPIRED'
    WHEN l.expires_at < NOW() + INTERVAL '3 days' THEN '🔴 ' || FLOOR(EXTRACT(EPOCH FROM (l.expires_at - NOW())) / 86400)::int || 'd left'
    WHEN l.expires_at < NOW() + INTERVAL '6 days' THEN '🟠 ' || FLOOR(EXTRACT(EPOCH FROM (l.expires_at - NOW())) / 86400)::int || 'd left'
    ELSE                                                                 '🟢 ' || FLOOR(EXTRACT(EPOCH FROM (l.expires_at - NOW())) / 86400)::int || 'd left'
  END                                                               AS expiry,
  l.show_phone,
  l.views_count                                                     AS views,
  CASE WHEN u.email = 'nagesh.aadi@gmail.com' THEN 'Nagesh' ELSE 'Arun' END AS seller,
  l.lat || ', ' || l.lng                                            AS coordinates
FROM listings l
JOIN auth.users u ON u.id = l.seller_id
WHERE l.reference_code LIKE 'MP-BLR-UAT%'
ORDER BY l.category, l.subcategory, l.reference_code;


-- ============================================================
-- CLEANUP — Run this when UAT is complete to remove dummy data
-- ============================================================
-- DELETE FROM listings WHERE reference_code LIKE 'MP-BLR-UAT%';
