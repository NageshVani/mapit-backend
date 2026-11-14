// ============================================================
// Photo privacy suite — server-side EXIF/GPS stripping (fix/photo-exif, 2026-11-14)
// Run:  npm start (PORT 3001, .env = UAT) in one terminal, then
//       npm run uat:photos
// UAT ONLY. Creates one throwaway @example.com seller + one pending listing,
// uploads generated test photos to localhost, checks the STORED files
// (downloaded back from Storage), then deletes everything it made —
// Storage objects, photo rows, listing, user. No coordinates are logged.
// ============================================================
const crypto = require('crypto');
const sharp = require('sharp');
const exifr = (() => { try { return require('exifr'); } catch { return null; } })();
const { createClient } = require('@supabase/supabase-js');

const BASE = 'http://localhost:3001';
const UAT_REF = 'xesekrkxbtybbxpsvxuz';
if (!(process.env.SUPABASE_URL || '').includes(UAT_REF)) {
  console.error('STOP: .env is not the UAT project — this suite only runs against UAT.');
  process.exit(1);
}
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const BUCKET = process.env.STORAGE_BUCKET || 'listing-photos';
const UNSUPPORTED = "isn't supported";

let pass = 0, fail = 0;
const created = { users: [], listings: [], paths: [] };
const check = (name, ok, info = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== '' ? '  — ' + info : ''}`); };

// ── Test images (generated, no real photos) ──────────────────
// GPS = a fixed public landmark (Vidhana Soudha); never printed.
const GPS = { GPSLatitudeRef: 'N', GPSLatitude: '12/1 58/1 47/1', GPSLongitudeRef: 'E', GPSLongitude: '77/1 35/1 26/1' };
const jpegWithGps = () => sharp({ create: { width: 400, height: 300, channels: 3, background: '#3a7' } })
  .jpeg().withExif({ IFD0: { Make: 'TestPhone', Model: 'GPS-1' }, IFD3: GPS }).toBuffer();
// 400 wide x 200 high pixels + orientation 6 (= "rotate 90° to view") → upright is 200 x 400
const jpegSideways = () => sharp({ create: { width: 400, height: 200, channels: 3, background: '#a73' } })
  .jpeg().withMetadata({ orientation: 6 }).toBuffer();
const pngTransparent = () => sharp({ create: { width: 300, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .png().toBuffer();
const jpegHuge = () => sharp({ create: { width: 3200, height: 2400, channels: 3, background: '#37a' } }).jpeg({ quality: 50 }).toBuffer();
const garbage = () => Buffer.from('this is not an image ' + crypto.randomBytes(64).toString('hex'));

async function upload(token, listingId, files) {
  const fd = new FormData();
  for (const f of files) fd.append('photos', new Blob([f.buf], { type: f.type }), f.name);
  const r = await fetch(`${BASE}/api/uploads/listing/${listingId}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  const data = await r.json().catch(() => ({}));
  for (const p of data.photos || []) created.paths.push(p.storage_path);
  return { status: r.status, data };
}
async function stored(photo) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(photo.storage_path);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}
async function hasGps(buf) {
  if (exifr) { try { const g = await exifr.gps(buf); return !!(g && Number.isFinite(g.latitude)); } catch { return false; } }
  return false;
}

(async () => {
  try {
    // Seller + listing
    const email = `photos-${Date.now()}@example.com`, password = 'Pho!' + crypto.randomBytes(8).toString('hex');
    const { data: u, error: uErr } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
    if (uErr) throw uErr;
    created.users.push(u.user.id);
    await supabaseAdmin.from('profiles').upsert({ id: u.user.id, full_name: 'Photo Suite', phone: '+9160002' + String(Math.floor(1000 + Math.random() * 8999)), phone_verified: true });
    const { data: s, error: sErr } = await anon().auth.signInWithPassword({ email, password });
    if (sErr) throw sErr;
    const token = s.session.access_token;
    const { data: L, error: lErr } = await supabaseAdmin.from('listings').insert({
      seller_id: u.user.id, category: 'hh', subcategory: 'Furniture', title: 'Photo suite test', description: 'Photo suite test listing.',
      price: 1000, lat: 12.9352, lng: 77.6245, display_lat: 12.9361, display_lng: 77.6232, address: 'Koramangala',
      status: 'pending', show_phone: 'never', details: { total_price: 1000 }, moderation_verdict: 'clean' }).select('id').single();
    if (lErr) throw lErr;
    created.listings.push(L.id);

    // P0 — control: the test photo really carries GPS before upload
    const gpsBuf = await jpegWithGps();
    check('P0 control: test photo HAS GPS before upload', await hasGps(gpsBuf), exifr ? '' : 'exifr not installed — GPS checks use sharp only');

    // P1 — GPS photo: stored copy has no EXIF and no GPS
    let r = await upload(token, L.id, [{ buf: gpsBuf, type: 'image/jpeg', name: 'gps.jpg' }]);
    check('P1 upload JPEG with GPS → 201', r.status === 201, r.status);
    const p1 = r.data.photos?.[0];
    const b1 = await stored(p1);
    const m1 = await sharp(b1).metadata();
    check('P1b stored file has NO EXIF block', !m1.exif, m1.exif ? 'exif present' : 'none');
    check('P1c stored file has NO GPS', !(await hasGps(b1)));
    check('P1d stored as .jpg / image/jpeg', p1.storage_path.endsWith('.jpg') && m1.format === 'jpeg', `${m1.format}`);

    // P2 — sideways phone photo comes out upright, orientation tag gone
    // P5 — mixed batch: 1 good + 1 unreadable → 201, 1 stored, friendly warning.
    // Runs early: the count check uses files SENT (2), so it needs room for both.
    r = await upload(token, L.id, [{ buf: await jpegHuge(), type: 'image/jpeg', name: 'ok.jpg' }, { buf: garbage(), type: 'image/jpeg', name: 'bad.jpg' }]);
    check('P5 mixed batch → 201, 1 stored, warning shown', r.status === 201 && r.data.photos?.length === 1 && r.data.unsupported === 1 && (r.data.warning || '').includes(UNSUPPORTED), `${r.status} n=${r.data.photos?.length}`);

    r = await upload(token, L.id, [{ buf: await jpegSideways(), type: 'image/jpeg', name: 'side.jpg' }]);
    const m2 = await sharp(await stored(r.data.photos[0])).metadata();
    check('P2 sideways photo stored upright (200 x 400), no orientation tag', m2.width === 200 && m2.height === 400 && !m2.orientation, `${m2.width}x${m2.height} o=${m2.orientation}`);

    // P3 — transparent PNG → JPEG with white background
    r = await upload(token, L.id, [{ buf: await pngTransparent(), type: 'image/png', name: 'clear.png' }]);
    const b3 = await stored(r.data.photos[0]);
    const m3 = await sharp(b3).metadata();
    const { data: px } = await sharp(b3).raw().toBuffer({ resolveWithObject: true });
    check('P3 PNG stored as JPEG, transparent → white', m3.format === 'jpeg' && px[0] > 240 && px[1] > 240 && px[2] > 240, `${m3.format} rgb=${px[0]},${px[1]},${px[2]}`);

    // P4 — big photo resized to ≤ 1600 px
    r = await upload(token, L.id, [{ buf: await jpegHuge(), type: 'image/jpeg', name: 'big.jpg' }]);
    const m4 = await sharp(await stored(r.data.photos[0])).metadata();
    check('P4 3200x2400 → longest side 1600', Math.max(m4.width, m4.height) === 1600, `${m4.width}x${m4.height}`);

    // listing now has 5 photos (P1–P5) — the 6th must be refused.
    // Needs the server AND this suite on the real limit of 5 (CLAUDE.md Rule 9):
    // a local .env with MAX_PHOTOS_PER_LISTING=10 would allow it — start the
    // server with MAX_PHOTOS_PER_LISTING=5 (dotenv never overrides a set var).
    const LIMIT = parseInt(process.env.MAX_PHOTOS_PER_LISTING) || 5;
    if (LIMIT !== 5) console.log(`NOTE  P6 skipped — MAX_PHOTOS_PER_LISTING is ${LIMIT}, not 5. Re-run server + suite with MAX_PHOTOS_PER_LISTING=5.`);
    else {
      r = await upload(token, L.id, [{ buf: await jpegHuge(), type: 'image/jpeg', name: 'six.jpg' }]);
      check('P6 6th photo → 400 (5-photo limit still enforced)', r.status === 400, `${r.status} ${r.data.error || ''}`);
    }

    // P7/P8 need an empty listing — remove the 5 photos via the API
    const { data: rows } = await supabaseAdmin.from('listing_photos').select('id').eq('listing_id', L.id);
    for (const row of rows) await fetch(`${BASE}/api/uploads/photo/${row.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });

    // P7 — only unreadable → 400 with the friendly message, nothing stored
    r = await upload(token, L.id, [{ buf: garbage(), type: 'image/heic', name: 'phone.heic' }]);
    check('P7 unreadable "HEIC" → 400 friendly message', r.status === 400 && (r.data.error || '').includes(UNSUPPORTED), `${r.status}`);
    // P8 — wrong type (text) → 400 friendly (was a 500 before)
    r = await upload(token, L.id, [{ buf: garbage(), type: 'text/plain', name: 'note.txt' }]);
    check('P8 non-image type → 400 friendly message', r.status === 400 && (r.data.error || '').includes(UNSUPPORTED), `${r.status}`);
    const { count } = await supabaseAdmin.from('listing_photos').select('*', { count: 'exact', head: true }).eq('listing_id', L.id);
    check('P9 nothing stored for rejected photos', count === 0, count);
  } catch (e) {
    fail++; console.error('ERROR', e.message);
  } finally {
    if (created.paths.length) await supabaseAdmin.storage.from(BUCKET).remove(created.paths);
    if (created.listings.length) await supabaseAdmin.from('listings').delete().in('id', created.listings);
    for (const id of created.users) await supabaseAdmin.auth.admin.deleteUser(id);
    console.log(`\n${pass} passed, ${fail} failed. Cleaned up ${created.paths.length} stored photos, ${created.listings.length} listing, ${created.users.length} user.`);
    process.exit(fail ? 1 : 0);
  }
})();
