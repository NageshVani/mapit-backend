// MapIt frontend: post.js. Split from MapIt_MVP_v1.html lines 4048-4805 on 2026-11-15. Load order is set in public/index.html. Functions are global on purpose (inline onclick=).
// ═══════════════════════════════════════════════
// POST LISTING MODAL
// ═══════════════════════════════════════════════
let postPickerLat = activeLoc().lat;
let postPickerLng = activeLoc().lng;

async function openPostModal(){
  // Session 9C gate — ask for WhatsApp verification before the form, not after.
  // Fail open on a network error: POST /api/listings enforces it regardless.
  if(!ST.profile?.phone_verified){
    try {
      const s = await apiGet('/api/auth/otp/phone/status');
      if(s.required){ openPhoneVerify('post'); return; }
    } catch(_){}
  }
  ST.editingId = null;
  resetPostPhotos();
  document.getElementById('postSubmitBtn').textContent = 'Submit for Review 🚀';
  document.getElementById('postModal').classList.remove('hide');
  updatePostSubcats(); // also triggers renderDynamicFields
  // Session 9G — Real Estate defaults to Rent for every new listing
  const rentEl = document.querySelector('input[name="txType"][value="Rent"]');
  if(rentEl) rentEl.checked = true;
  // Populate location dropdown from saved pins + manual option
  const sel = document.getElementById('postLocation');
  sel.innerHTML = '';
  ST.userPins.forEach(p=>{
    const opt = document.createElement('option');
    opt.value = JSON.stringify({lat:p.lat, lng:p.lng, label:p.label});
    opt.textContent = p.label + (p.is_default?' (Active)':'');
    if(p.is_default) opt.selected = true;
    sel.appendChild(opt);
  });
  // Always offer manual entry
  const manualOpt = document.createElement('option');
  manualOpt.value = '__manual__';
  manualOpt.textContent = '📍 Select location manually…';
  sel.appendChild(manualOpt);
  // If no saved pins, pre-select manual
  if(!ST.userPins.length) sel.value = '__manual__';
  toggleManualListingLoc();
}

function toggleManualListingLoc(){
  const show = document.getElementById('postLocation').value === '__manual__';
  document.getElementById('manualListingLocGroup').style.display = show ? '' : 'none';
  if(show) initPostPickerMap();
  else if(_postPickerMap){ _postPickerMap.remove(); _postPickerMap = null; _postPickerMarker = null; _postPickerCoords = null; }
}

// Tap-to-drop-pin location picker for the seller's listing — mirrors the
// Add-Pin/Home-Location flow (initAddPinMap/initHomeLocMap) instead of only
// asking the seller to type raw GPS coordinates. A search box (same
// Photon-based pattern as _onHomeLocSearchInput) pans/zooms the map to a
// typed area first; the seller can either tap to place the exact pin, or
// (Arun/Nagesh: many sellers copy exact coordinates from a Google Maps
// long-press) paste GPS coordinates directly — both converge on the same
// pin/marker state and get reverse-geocoded.
let _postPickerCoords = null;

function initPostPickerMap(){
  if(_postPickerMap){ _postPickerMap.remove(); _postPickerMap = null; _postPickerMarker = null; }
  _postPickerCoords = null;
  document.getElementById('postLocSearchIn').value = '';
  document.getElementById('postLocSearchDD').classList.add('hide');
  document.getElementById('postLocSearchDD').innerHTML = '';
  _postLocSearchResults = [];
  document.getElementById('postLocCoordsIn').value = '';
  document.getElementById('postLocCoordsHint').textContent = 'Tip: open Google Maps, long-press your location and copy the coordinates shown.';
  document.getElementById('postPickerHint').textContent = "👆 Tap anywhere on the map to drop your listing's pin";
  document.getElementById('postPickerAddr').textContent = '';
  setTimeout(()=>{
    const el = document.getElementById('postPickerMap');
    if(!el) return;
    const loc = activeLoc();
    _postPickerMap = L.map('postPickerMap', { zoomControl: true, attributionControl: false }).setView([loc.lat, loc.lng], 13);
    const _postPickerTiles = L.tileLayer(mapboxTileUrl(),{tileSize:512,zoomOffset:-1,maxZoom:20}).addTo(_postPickerMap);
    runtimeCfgPromise.then(()=>_postPickerTiles.setUrl(mapboxTileUrl()));
    _postPickerMap.on('click', async e=>{
      const { lat, lng } = e.latlng;
      _placePostLocPin(lat, lng);
      await _resolvePostLocAddr(lat, lng);
    });
    _postPickerMap.invalidateSize();
    _applyRegionBounds(_postPickerMap);
    _pingMapLoad('post');
  }, 120);
}

function _placePostLocPin(lat, lng){
  _postPickerCoords = { lat, lng };
  if(_postPickerMarker) _postPickerMarker.setLatLng([lat, lng]);
  else {
    _postPickerMarker = L.marker([lat, lng], {draggable: true}).addTo(_postPickerMap);
    _postPickerMarker.on('dragend', async ev => {
      const p = ev.target.getLatLng();
      _postPickerCoords = { lat: p.lat, lng: p.lng };
      await _resolvePostLocAddr(p.lat, p.lng);
    });
  }
  document.getElementById('postPickerHint').textContent = '✅ Pin placed — drag to adjust';
}

function _onPostLocCoordsInput(){
  const raw = document.getElementById('postLocCoordsIn').value.trim();
  const hint = document.getElementById('postLocCoordsHint');
  if(!raw){ hint.textContent = 'Tip: open Google Maps, long-press your location and copy the coordinates shown.'; return; }
  const parts = raw.split(',').map(s=>parseFloat(s.trim()));
  const valid = parts.length===2 && parts.every(n=>!isNaN(n)) && Math.abs(parts[0])<=90 && Math.abs(parts[1])<=180;
  if(!valid){ hint.textContent = '⚠️ Not a valid coordinate pair yet'; return; }
  hint.textContent = '✅ Pin moved to these coordinates';
  const [lat,lng] = parts;
  _placePostLocPin(lat, lng);
  if(_postPickerMap) _postPickerMap.flyTo([lat,lng], 15);
  _resolvePostLocAddr(lat, lng);
}

let _postLocSearchTimer = null;
let _postLocSearchResults = [];

function _onPostLocSearchInput(){
  clearTimeout(_postLocSearchTimer);
  const q = document.getElementById('postLocSearchIn').value.trim();
  const dd = document.getElementById('postLocSearchDD');
  if(q.length < 4){ dd.classList.add('hide'); dd.innerHTML = ''; return; }
  _postLocSearchTimer = setTimeout(()=>_runPostLocSearch(q), 400);
}

async function _runPostLocSearch(q){
  const dd = document.getElementById('postLocSearchDD');
  try {
    // Same Photon-based area + landmark search as the home-location picker (photonPlaces).
    let geoParams = '';
    if(_postPickerMap){
      const c = _postPickerMap.getCenter();
      const latDelta = 0.35; // ~39km
      const lonDelta = latDelta / Math.cos(c.lat * Math.PI / 180);
      geoParams = `&lat=${c.lat}&lon=${c.lng}&bbox=${c.lng-lonDelta},${c.lat-latDelta},${c.lng+lonDelta},${c.lat+latDelta}`;
    }
    const r = await fetch(`https://photon.komoot.io/api/?limit=10&q=${encodeURIComponent(q)}${geoParams}`);
    const { features } = await r.json();
    _postLocSearchResults = photonPlaces(features);
    if(!_postLocSearchResults.length){ dd.classList.add('hide'); dd.innerHTML = ''; return; }
    dd.innerHTML = '';
    _postLocSearchResults.forEach((m, i) => {
      const row = document.createElement('div');
      row.textContent = '📍 ' + m.display_name.split(',').slice(0,3).map(x=>x.trim()).join(', ');
      row.style.cssText = 'padding:9px 12px;font-size:12.5px;cursor:pointer;border-bottom:1px solid var(--border);';
      row.onclick = () => _pickPostLocSearchResult(i);
      dd.appendChild(row);
    });
    dd.classList.remove('hide');
  } catch(_){
    dd.classList.add('hide'); dd.innerHTML = '';
  }
}

function _pickPostLocSearchResult(i){
  const m = _postLocSearchResults[i];
  if(!m) return;
  document.getElementById('postLocSearchIn').value = m.display_name.split(',').slice(0,3).map(x=>x.trim()).join(', ');
  document.getElementById('postLocSearchDD').classList.add('hide');
  if(_postPickerMap) _postPickerMap.flyTo([+m.lat, +m.lon], 15);
}

async function _resolvePostLocAddr(lat, lng){
  document.getElementById('postPickerAddr').textContent = 'Getting address…';
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
    const g = await r.json();
    const addr = g.display_name?.split(',').slice(0,3).map(x=>x.trim()).join(', ') || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    _postPickerCoords.address = addr;
    document.getElementById('postPickerAddr').textContent = '📍 ' + addr;
  } catch(_){
    _postPickerCoords.address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    document.getElementById('postPickerAddr').textContent = '📍 ' + _postPickerCoords.address;
  }
}

function closePostModal(){
  ST.editingId = null;
  document.getElementById('postModal').classList.add('hide');
  if(_postPickerMap){ _postPickerMap.remove(); _postPickerMap = null; _postPickerMarker = null; _postPickerCoords = null; }
}

// Post / Edit form photos. Two lists:
//  _editPhotos — already uploaded (Edit only). ✕ only stages a removal;
//    submitListing() applies it on Update, so closing the form changes nothing.
//  _newPhotos  — picked but not uploaded yet, previewed from local blob: URLs.
//    ✕ drops one straight away. Kept in our own array because the browser's
//    file input can't remove a single file and replaces its list on every pick.
const MAX_PHOTOS = 5;
let _editPhotos = [], _editPhotosRemove = new Set(), _newPhotos = [];
function keptPhotoTotal(){ return _editPhotos.length - _editPhotosRemove.size; }
function resetPostPhotos(){
  // Clear everything — otherwise photos picked for one listing would be
  // uploaded to the next listing opened in the form.
  document.getElementById('postPhotos').value = '';
  _newPhotos.forEach(p=>URL.revokeObjectURL(p.url));
  _editPhotos = []; _editPhotosRemove = new Set(); _newPhotos = [];
  renderPostPhotos();
}
function onPostPhotosPicked(input){
  const files = Array.from(input.files || []);
  input.value = ''; // so picking the same file again still fires onchange
  const room = MAX_PHOTOS - keptPhotoTotal() - _newPhotos.length;
  if(files.length > room){
    toast(room > 0 ? `Only ${room} more photo${room===1?'':'s'} fit — max ${MAX_PHOTOS} per listing.`
                   : `Max ${MAX_PHOTOS} photos — remove one to add another.`);
  }
  files.slice(0, Math.max(0, room)).forEach(f=>_newPhotos.push({ file:f, url:URL.createObjectURL(f) }));
  renderPostPhotos();
}
function removeNewPhoto(i){
  const p = _newPhotos.splice(i, 1)[0];
  if(p) URL.revokeObjectURL(p.url);
  renderPostPhotos();
}
function toggleEditPhoto(id){
  _editPhotosRemove.has(id) ? _editPhotosRemove.delete(id) : _editPhotosRemove.add(id);
  renderPostPhotos();
}
// ── Post form step bar ─────────────────────────────────────────
// One chip per visible .post-sec: green ✓ when its required input is filled
// (same rules as submitListing()), orange ring = the section in view.
// Recomputed on any input/change/click/scroll inside the modal, so no field
// handler has to remember to call it.
const POST_STEP_DONE = {
  What:     () => !!document.getElementById('postSubcat').value,
  Details:  () => {
    const cat = document.getElementById('postCat').value, sub = document.getElementById('postSubcat').value;
    const fields = (LISTING_FIELDS[cat]||{})[sub] || [];
    return !!sub && (!fields.length || parseFloat(document.getElementById('pf_total_price')?.value) > 0) && !missingRequiredField(cat, sub);
  },
  Title:    () => !!document.getElementById('postTitle').value.trim(),
  Photos:   () => {
    // Same rule as submitListing(): Plots/PG and older photo-less listings
    // being edited may go without a photo
    const needsPhoto = !PHOTO_OPTIONAL_SUBCATS.includes(document.getElementById('postSubcat').value) && (!ST.editingId || _editPhotos.length > 0);
    return !needsPhoto || (ST.editingId ? keptPhotoTotal() : 0) + _newPhotos.length > 0;
  },
  Location: () => {
    const v = document.getElementById('postLocation').value;
    return v === '__manual__' ? !!_postPickerCoords : !!v;
  },
};
var _postStepsRaf = 0; // var: renderDynamicFields() may call in before this line runs
function schedulePostSteps(){
  if(_postStepsRaf) return;
  _postStepsRaf = requestAnimationFrame(()=>{ _postStepsRaf = 0; updatePostSteps(); });
}
function updatePostSteps(){
  const modal = document.getElementById('postModal');
  if(modal.classList.contains('hide')) return;
  const box = modal.querySelector('.post-box');
  const secs = [...modal.querySelectorAll('.post-sec')].filter(s => s.offsetParent !== null);
  // "In view" = last section whose top has passed the sticky header
  const line = box.getBoundingClientRect().top + modal.querySelector('.post-header').offsetHeight + 40;
  let cur = 0;
  secs.forEach((s,i)=>{ if(s.getBoundingClientRect().top <= line) cur = i; });
  // Two-column desktop: both columns are on screen, so no "current" ring
  const twoCol = getComputedStyle(modal.querySelector('.post-body')).gridTemplateColumns.split(' ').length > 1;
  let done = 0;
  document.getElementById('postSteps').innerHTML = secs.map((s,i)=>{
    const ok = (POST_STEP_DONE[s.dataset.step] || (()=>false))();
    if(ok) done++;
    return `<button type="button" class="ps-chip${ok?' done':''}${!twoCol&&i===cur?' cur':''}" onclick="jumpPostStep('${s.dataset.step}')">`
      + `<span class="ps-num">${ok?'✓':i+1}</span><span class="ps-lbl">${s.dataset.step}</span></button>`;
  }).join('');
  document.getElementById('postStepsCount').textContent = `${done} of ${secs.length} done`;
}
function jumpPostStep(step){
  const modal = document.getElementById('postModal');
  const box = modal.querySelector('.post-box');
  const sec = modal.querySelector(`.post-sec[data-step="${step}"]`);
  if(!sec) return;
  const top = sec.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop
            - modal.querySelector('.post-header').offsetHeight - 8;
  box.scrollTo({ top, behavior:'smooth' });
}
(()=>{
  const modal = document.getElementById('postModal');
  ['input','change','click'].forEach(t => modal.addEventListener(t, schedulePostSteps));
  modal.querySelector('.post-box').addEventListener('scroll', schedulePostSteps, { passive:true });
  // Opening the form (Post or Edit) only flips the .hide class — catch that,
  // plus a late pass for Edit, whose listing data and photos load async.
  new MutationObserver(()=>{ schedulePostSteps(); setTimeout(schedulePostSteps, 1500); })
    .observe(modal, { attributes:true, attributeFilter:['class'] });
})();

function renderPostPhotos(){
  schedulePostSteps();
  const box = document.getElementById('postCurPhotos');
  const cur = ST.editingId ? _editPhotos : [];
  const total = keptPhotoTotal() + _newPhotos.length;
  document.getElementById('postPhotosAdd').disabled = total >= MAX_PHOTOS;
  if(!cur.length && !_newPhotos.length){ box.style.display = 'none'; box.innerHTML = ''; return; }
  box.style.display = '';
  // .pcp-ph (📷) sits behind each image — shows when the browser can't
  // preview the format (e.g. HEIC on Chrome); the file still uploads.
  box.innerHTML =
    cur.map((p,i)=>{
      const rm = _editPhotosRemove.has(p.id);
      return `<div class="pcp${rm?' removed':''}"><span class="pcp-ph">📷</span><img src="${escHtml(p.public_url)}" alt="Photo ${i+1}" loading="lazy" decoding="async" onerror="this.remove()"/>`+
        `<button type="button" title="${rm?'Keep this photo':'Remove this photo'}" onclick="toggleEditPhoto('${escHtml(p.id)}')">${rm?'↺':'✕'}</button></div>`;
    }).join('') +
    _newPhotos.map((p,i)=>
      `<div class="pcp"><span class="pcp-ph">📷</span><img src="${escHtml(p.url)}" alt="New photo ${i+1}" onerror="this.remove()"/><span class="pcp-new">New</span>`+
      `<button type="button" title="Remove this photo" onclick="removeNewPhoto(${i})">✕</button></div>`
    ).join('') +
    `<div class="pcp-hint">${total} of ${MAX_PHOTOS} photos${_editPhotosRemove.size?' · removals apply when you press Update':''}${_newPhotos.length?' · new photos upload when you submit':''}</div>`;
}

async function editListing(id){
  // Fetch full listing data if not already available with details
  let l = ST.listings.find(x=>x.id===id);
  if(!l || !l.details){
    try { const d = await apiGet(`/api/listings/${id}`); l = d.listing; } catch(e){ toast('Could not load listing data.'); return; }
  }
  ST.editingId = id;
  resetPostPhotos();
  // Current photos come from the detail route (the list rows only carry the cover)
  apiGet(`/api/listings/${id}`).then(d=>{
    if(ST.editingId !== id) return; // form was closed or switched meanwhile
    _editPhotos = (d.listing?.photos||[]).filter(p=>p.id && /^https:\/\//.test(p.public_url||''));
    renderPostPhotos();
  }).catch(()=>{});

  // Open modal and set heading/button
  document.getElementById('postModal').classList.remove('hide');
  document.getElementById('postSubmitBtn').textContent = 'Update & Re-submit 🔄';

  // Populate category and subcategory
  const catEl = document.getElementById('postCat');
  catEl.value = l.category || l.cat || 're';
  updatePostSubcats(); // populates subcategory options
  document.getElementById('postSubcat').value = l.subcategory || l.sub || '';
  renderDynamicFields(); // renders dynamic fields for this cat/sub

  // Populate dynamic detail fields
  const det = l.details || {};
  const fields = (LISTING_FIELDS[l.category||l.cat]||{})[l.subcategory||l.sub] || [];
  fields.forEach(f => {
    const el = document.getElementById(`pf_${f.id}`);
    if(el && det[f.id] != null) el.value = det[f.id];
  });
  updatePriceWords();
  syncPgFood();
  document.querySelectorAll('#dynamicFields input[data-year]').forEach(updateYearNote);

  // Populate title and description
  document.getElementById('postTitle').value = l.title || '';
  _autoTitle = ''; // editing: the saved title is the seller's — only ✨ Suggest replaces it
  document.getElementById('postDesc').value = l.description || '';

  // Transaction type (Real Estate only)
  if((l.category||l.cat)==='re' && det.transaction_type){
    const txEl = document.querySelector(`input[name="txType"][value="${det.transaction_type}"]`);
    if(txEl) txEl.checked = true;
  }

  // Pre-fill show_exact_location from the listing's actual saved value —
  // previously it silently reset to the form's HTML default on every edit.
  document.getElementById('postShowExactLocation').checked = !!l.show_exact_location;

  // Pre-populate location dropdown with listing's current location
  const sel = document.getElementById('postLocation');
  sel.innerHTML = '';
  // Current location option (pre-selected)
  const curOpt = document.createElement('option');
  curOpt.value = JSON.stringify({lat:l.lat, lng:l.lng, label:l.address||'Current location'});
  curOpt.textContent = `📍 ${l.address||'Current location'} (keep)`;
  curOpt.selected = true;
  sel.appendChild(curOpt);
  // Saved pins
  ST.userPins.forEach(p=>{
    const opt = document.createElement('option');
    opt.value = JSON.stringify({lat:p.lat, lng:p.lng, label:p.label});
    opt.textContent = p.label + (p.is_default?' (Active)':'');
    sel.appendChild(opt);
  });
  // Manual entry
  const manualOpt = document.createElement('option');
  manualOpt.value = '__manual__';
  manualOpt.textContent = '📍 Select location manually…';
  sel.appendChild(manualOpt);
  toggleManualListingLoc();
}

function updatePostSubcats(){
  const cat = document.getElementById('postCat').value;
  const subcats = SUBCAT_MAP[cat]||[];
  document.getElementById('postSubcat').innerHTML =
    `<option value="" disabled selected>— Select type —</option>` +
    subcats.map(s=>`<option value="${s}">${s}</option>`).join('');
  renderDynamicFields();
}

function renderDynamicFields(){
  const cat = document.getElementById('postCat').value;
  const sub = document.getElementById('postSubcat').value;
  const container = document.getElementById('dynamicFields');
  // Update title placeholder to match category/subcategory
  const ph = (TITLE_PLACEHOLDER[cat]||{})[sub] || 'Short, descriptive title for your listing';
  document.getElementById('postTitle').placeholder = ph;
  // Show/hide Sell/Rent for Real Estate only
  document.getElementById('txTypeGroup').style.display = cat === 're' ? '' : 'none';
  // Rent-only types (PG, FB-04): tick Rent and grey out Sell. The server
  // forces Rent as well, so this is convenience, not the rule.
  const rentOnly = cat === 're' && RENT_ONLY_SUBCATS.includes(sub);
  const sellEl = document.querySelector('input[name="txType"][value="Sell"]');
  if(rentOnly) document.querySelector('input[name="txType"][value="Rent"]').checked = true;
  sellEl.disabled = rentOnly;
  sellEl.closest('label').style.opacity = rentOnly ? '.45' : '';
  document.getElementById('txRentOnlyHint').style.display = rentOnly ? '' : 'none';
  const fields = (LISTING_FIELDS[cat]||{})[sub] || [];
  // Section ② "Details & price": hint until a subcategory is picked; hidden
  // for a subcategory without fields (the CSS counter then renumbers).
  document.getElementById('postDetailsEmpty').style.display = sub ? 'none' : '';
  document.getElementById('postSecDetails').style.display = (sub && !fields.length) ? 'none' : '';
  schedulePostSteps();
  if(!fields.length){ container.innerHTML = ''; return; }
  container.innerHTML =
    fields.map(f => {
      const inp = f.type === 'select'
        ? `<select class="form-input form-select" id="pf_${f.id}">${f.required?`<option value="" disabled selected>— Select —</option>`:''}${f.options.map(o=>`<option>${o}</option>`).join('')}</select>`
        : f.type === 'year' ? yearInputHtml(f)
        : `<input class="form-input" id="pf_${f.id}" type="${f.type === 'number' ? 'number' : 'text'}" min="${f.type==='number'?'0':''}"${f.placeholder?` placeholder="${f.placeholder}"`:''}${f.default!=null?` value="${f.default}"`:''}/>`;
      const words = f.id === 'total_price' ? `<div class="price-words" id="pfw_total_price"></div>`
        : f.type === 'year' ? `<div class="year-note" id="pfn_${f.id}"></div>` : '';
      return `<div class="form-group"><label class="form-label">${f.label}${f.required?' <span style="color:var(--red);">*</span>':''}</label>${inp}${words}</div>`;
    }).join('');
  const tp = document.getElementById('pf_total_price');
  if(tp) tp.addEventListener('input', updatePriceWords);
  const meals = document.getElementById('pf_meals');
  if(meals){ meals.addEventListener('change', syncPgFood); syncPgFood(); }
  container.querySelectorAll('input[data-year]').forEach(el => el.addEventListener('input', onYearInput));
  // Release 2: title follows the details (property handlers, so re-renders don't stack listeners)
  container.oninput = container.onchange = () => suggestTitle(false);
  document.querySelectorAll('input[name="txType"]').forEach(r => r.onchange = () => suggestTitle(false));
  suggestTitle(false);
}
// ── Vehicle year input (Release 10A) ──
// Digits only, max 4, number keypad on phones. Suggestions appear only after
// 3 digits (Nagesh, 2026-11-15): "201" → 2019…2010, newest first, never more than 10.
// We fill the datalist ourselves (same result in every browser).
// Older than 15 years is allowed; the note under the field says "15+ years old".
function yearInputHtml(f){
  return `<input class="form-input" id="pf_${f.id}" data-year type="text" inputmode="numeric" maxlength="4" autocomplete="off"`
    + ` list="pfl_${f.id}" placeholder="e.g. ${new Date().getFullYear() - 3}"/><datalist id="pfl_${f.id}"></datalist>`;
}
function yearSuggestions(digits){
  if(digits.length < 3) return [];
  const now = new Date().getFullYear(), out = [];
  for(let y = now; y >= YEAR_MIN; y--) if(String(y).startsWith(digits)) out.push(y);
  return out;
}
// Prefix mask (Nagesh UAT, 2026-11-15): a digit is refused when no valid year
// (YEAR_MIN..this year) starts with what has been typed, so "2036" can't be entered
// by mistake ("203" is already refused). Works for pasted text too.
function yearPrefixOk(d){
  const now = new Date().getFullYear();
  for(let y = now; y >= YEAR_MIN; y--) if(String(y).startsWith(d)) return true;
  return false;
}
function onYearInput(e){
  const el = e.target;
  let digits = el.value.replace(/\D/g, '').slice(0, 4), refused = '';
  while(digits && !yearPrefixOk(digits)){
    refused = Number(digits.padEnd(4, '0')) > new Date().getFullYear()
      ? `Year can't be later than ${new Date().getFullYear()}.` : `Year can't be earlier than ${YEAR_MIN}.`;
    digits = digits.slice(0, -1);
  }
  if(el.value !== digits) el.value = digits;
  const list = document.getElementById(el.getAttribute('list'));
  // 4 digits typed = done, so no list (it would only repeat the same year)
  if(list) list.innerHTML = digits.length === 3 ? yearSuggestions(digits).map(y => `<option value="${y}">`).join('') : '';
  updateYearNote(el, refused);
}
function updateYearNote(el, refused = ''){
  const note = document.getElementById(el.id.replace(/^pf_/, 'pfn_'));
  if(!note) return;
  const v = el.value.trim(), issue = refused || (v.length === 4 ? yearIssue(v) : '');
  note.className = 'year-note' + (issue ? ' bad' : '');
  note.textContent = issue || (isOldVehicleYear(v) ? `ℹ️ ${OLD_VEHICLE_YEARS}+ years old: buyers will see this on the listing.` : '');
}
// PG (FB-04): no meals → Food Type is 'Not applicable' and locked
function syncPgFood(){
  const meals = document.getElementById('pf_meals'), food = document.getElementById('pf_food_type');
  if(!meals || !food) return;
  const none = meals.value === 'No';
  if(none) food.value = 'Not applicable';
  else if(food.value === 'Not applicable') food.value = ''; // Meals = Yes → seller must pick the food type
  food.disabled = none;
}
// Session 9J — '2800000' → '₹28 Lakh' under the box, so a missing or extra zero is obvious
function updatePriceWords(){
  const tp = document.getElementById('pf_total_price'), out = document.getElementById('pfw_total_price');
  if(tp && out) out.textContent = fmtINRWords(tp.value);
}

let _addPinMap = null, _addPinMarker = null, _addPinCoords = null;

function initAddPinMap(){
  if(_addPinMap){ _addPinMap.remove(); _addPinMap = null; _addPinMarker = null; }
  _addPinCoords = null;
  document.getElementById('addPinAddr').textContent = '';
  document.getElementById('addPinHint').textContent = '👆 Tap anywhere on the map to drop a pin';
  document.getElementById('addPinSearchIn').value = '';
  document.getElementById('addPinSearchDD').classList.add('hide');
  document.getElementById('addPinSearchDD').innerHTML = '';
  document.getElementById('addPinCoordsIn').value = '';
  document.getElementById('addPinCoordsHint').textContent = 'Tip: open Google Maps, long-press your location and copy the coordinates shown.';
  _addPinSearchResults = [];
  const saveBtn = document.getElementById('savePinBtn'); if(saveBtn) saveBtn.disabled = true;
  const center = ST.activePin ? [ST.activePin.lat, ST.activePin.lng] : [12.9716, 77.5946];
  setTimeout(()=>{
    _addPinMap = L.map('addPinMap', { zoomControl: true, attributionControl: false }).setView(center, 13);
    const _addPinTiles = L.tileLayer(mapboxTileUrl(),{tileSize:512,zoomOffset:-1,maxZoom:20}).addTo(_addPinMap);
    runtimeCfgPromise.then(()=>_addPinTiles.setUrl(mapboxTileUrl()));
    _addPinMap.on('click', async e=>{
      const { lat, lng } = e.latlng;
      await _placeAddPin(lat, lng);
    });
    _addPinMap.invalidateSize();
    _applyRegionBounds(_addPinMap);
    _pingMapLoad('addpin');
  }, 120);
}

// Shared by map-click, marker-drag, and typed-GPS-coordinate entry — one pin,
// three ways to place it, same pattern as the home-location picker (_placeHomeLocPin).
async function _placeAddPin(lat, lng){
  _addPinCoords = { lat, lng };
  if(_addPinMarker) _addPinMarker.setLatLng([lat, lng]);
  else {
    _addPinMarker = L.marker([lat, lng], {draggable: true}).addTo(_addPinMap);
    _addPinMarker.on('dragend', async ev => {
      const p = ev.target.getLatLng();
      _addPinCoords = { lat: p.lat, lng: p.lng };
      await _resolveAddPinAddr(p.lat, p.lng);
    });
  }
  document.getElementById('addPinHint').textContent = '✅ Pin placed — drag to adjust';
  document.getElementById('addPinAddr').textContent = 'Getting address…';
  const btn = document.getElementById('savePinBtn'); if(btn) btn.disabled = false;
  await _resolveAddPinAddr(lat, lng);
}

function _onAddPinCoordsInput(){
  const raw = document.getElementById('addPinCoordsIn').value.trim();
  const hint = document.getElementById('addPinCoordsHint');
  if(!raw){ hint.textContent = 'Tip: open Google Maps, long-press your location and copy the coordinates shown.'; return; }
  const parts = raw.split(',').map(s=>parseFloat(s.trim()));
  const valid = parts.length===2 && parts.every(n=>!isNaN(n)) && Math.abs(parts[0])<=90 && Math.abs(parts[1])<=180;
  if(!valid){ hint.textContent = '⚠️ Not a valid coordinate pair yet'; return; }
  hint.textContent = '✅ Pin moved to these coordinates';
  const [lat,lng] = parts;
  _placeAddPin(lat, lng);
  if(_addPinMap) _addPinMap.flyTo([lat,lng], 15);
}

// Same locality/city-only filter and Photon provider as the home-location search
let _addPinSearchTimer = null;
let _addPinSearchResults = [];

function _onAddPinSearchInput(){
  clearTimeout(_addPinSearchTimer);
  const q = document.getElementById('addPinSearchIn').value.trim();
  const dd = document.getElementById('addPinSearchDD');
  if(q.length < 4){ dd.classList.add('hide'); dd.innerHTML = ''; return; }
  _addPinSearchTimer = setTimeout(()=>_runAddPinSearch(q), 400);
}

async function _runAddPinSearch(q){
  const dd = document.getElementById('addPinSearchDD');
  try {
    let geoParams = '';
    if(_addPinMap){
      const c = _addPinMap.getCenter();
      const latDelta = 0.35; // ~39km
      const lonDelta = latDelta / Math.cos(c.lat * Math.PI / 180);
      geoParams = `&lat=${c.lat}&lon=${c.lng}&bbox=${c.lng-lonDelta},${c.lat-latDelta},${c.lng+lonDelta},${c.lat+latDelta}`;
    }
    const r = await fetch(`https://photon.komoot.io/api/?limit=10&q=${encodeURIComponent(q)}${geoParams}`);
    const { features } = await r.json();
    _addPinSearchResults = photonPlaces(features);
    if(!_addPinSearchResults.length){ dd.classList.add('hide'); dd.innerHTML = ''; return; }
    dd.innerHTML = '';
    _addPinSearchResults.forEach((m, i) => {
      const row = document.createElement('div');
      row.textContent = '📍 ' + m.display_name.split(',').slice(0,3).map(x=>x.trim()).join(', ');
      row.style.cssText = 'padding:9px 12px;font-size:12.5px;cursor:pointer;border-bottom:1px solid var(--border);';
      row.onclick = () => _pickAddPinSearchResult(i);
      dd.appendChild(row);
    });
    dd.classList.remove('hide');
  } catch(_){
    dd.classList.add('hide'); dd.innerHTML = '';
  }
}

function _pickAddPinSearchResult(i){
  const m = _addPinSearchResults[i];
  if(!m) return;
  document.getElementById('addPinSearchIn').value = m.display_name.split(',').slice(0,3).map(x=>x.trim()).join(', ');
  document.getElementById('addPinSearchDD').classList.add('hide');
  if(_addPinMap) _addPinMap.flyTo([+m.lat, +m.lon], 15);
}

async function _resolveAddPinAddr(lat, lng){
  document.getElementById('addPinAddr').textContent = 'Getting address…';
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
    const g = await r.json();
    const addr = g.display_name?.split(',').slice(0,3).map(x=>x.trim()).join(', ') || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    _addPinCoords.address = addr;
    document.getElementById('addPinAddr').textContent = '📍 ' + addr;
  } catch(_){
    _addPinCoords.address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    document.getElementById('addPinAddr').textContent = '📍 ' + _addPinCoords.address;
  }
}

async function saveNewLocation(){
  const label = document.getElementById('newPinLabel').value.trim();
  if(!label){ toast('Please enter a label first (e.g. "Home" or "Office").'); return; }
  if(!_addPinCoords){ toast('Tap the map to drop a pin first.'); return; }
  const btn = document.getElementById('savePinBtn');
  btn.disabled = true;
  try {
    await apiPost('/api/pins', {
      label,
      lat: _addPinCoords.lat,
      lng: _addPinCoords.lng,
      is_default: ST.userPins.length===0,
    });
    document.getElementById('newPinLabel').value = '';
    await loadAndRenderPins();
    initAddPinMap();
    toast(`📍 "${label}" saved!`);
  } catch(e){ toast('Could not save pin: '+e.message); btn.disabled = false; }
}

// Storage option B — shrink a photo in the browser before upload: longest side
// ≤ 1600 px, JPEG quality 0.8 (~200–400 KB instead of 3–12 MB from a phone).
// Never loses a photo: if the browser can't decode it (e.g. HEIC on Android
// Chrome), or the result isn't smaller, the original file is returned and the
// server's 5 MB limit still applies. Browsers apply EXIF rotation when drawing
// an <img> to a canvas, so photos keep their orientation.
const PHOTO_MAX_PX = 1600, PHOTO_JPEG_Q = 0.8;
async function shrinkPhoto(file){
  if(!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, PHOTO_MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';            // transparent PNG → white, not black, in JPEG
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', PHOTO_JPEG_Q));
    if(!blob || blob.size >= file.size) return file;
    const name = (file.name.replace(/\.[^.]+$/, '') || 'photo') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch(_){
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function submitListing(){
  const btn = document.getElementById('postSubmitBtn');
  const title = document.getElementById('postTitle').value.trim();
  const category = document.getElementById('postCat').value;
  const subcategory = document.getElementById('postSubcat').value;
  const description = document.getElementById('postDesc').value.trim();
  const locRaw = document.getElementById('postLocation').value;

  // Collect dynamic category-specific fields
  const fields = (LISTING_FIELDS[category]||{})[subcategory] || [];
  const details = {};
  for(const f of fields){
    const el = document.getElementById(`pf_${f.id}`);
    if(el) details[f.id] = el.value;
  }
  // Real Estate transaction type
  if(category === 're'){
    details.transaction_type = document.querySelector('input[name="txType"]:checked')?.value || 'Sell';
  }
  // Extract price from total_price field; fall back to 0 for categories without it
  const price = parseFloat(details.total_price) || 0;

  if(!title){ toast('Please enter a title.'); return; }
  if(!subcategory){ toast('Please select a listing type (e.g. Cars, 2 Wheelers).'); return; }
  if(fields.length && !price){ toast('Please enter a price in the listing details.'); return; }
  const missing = missingRequiredField(category, subcategory);
  if(missing){ toast(`Please fill in "${missing.label}".`); document.getElementById(`pf_${missing.id}`)?.focus(); return; }
  const badYear = fields.find(f => f.type === 'year' && yearIssue(details[f.id]));
  if(badYear){ toast(yearIssue(details[badYear.id])); document.getElementById(`pf_${badYear.id}`)?.focus(); return; }
  // Session 9G (Arun): an empty plot often has nothing worth photographing,
  // so Plots (and PG, 2026-10-28) may be posted without a photo. Every other type still needs one.
  const newPhotoCount  = _newPhotos.length;
  const keptPhotoCount = ST.editingId ? keptPhotoTotal() : 0;
  // New listing: needs a photo. Edit: may not remove every photo (older
  // photo-less listings can still be edited without adding one).
  const needsPhoto = !PHOTO_OPTIONAL_SUBCATS.includes(subcategory) && (!ST.editingId || _editPhotos.length > 0);
  if(needsPhoto && keptPhotoCount + newPhotoCount === 0){
    toast('Please add at least 1 photo.'); return;
  }
  if(keptPhotoCount + newPhotoCount > MAX_PHOTOS){
    toast(`Max ${MAX_PHOTOS} photos per listing — you can add ${MAX_PHOTOS-keptPhotoCount} more.`); return;
  }

  // Resolve location — saved pin or tap-to-drop pin on the map
  let locObj;
  if(locRaw === '__manual__'){
    if(!_postPickerCoords){
      toast('Please tap the map to place a pin for your listing location.'); return;
    }
    locObj = { lat:_postPickerCoords.lat, lng:_postPickerCoords.lng, label:_postPickerCoords.address || 'Custom Location' };
  } else if(locRaw){
    locObj = JSON.parse(locRaw);
  } else {
    toast('Please select or enter a location.'); return;
  }

  const show_exact_location = document.getElementById('postShowExactLocation').checked;
  btn.disabled=true; btn.textContent = ST.editingId ? 'Updating…' : 'Submitting…';
  try {
    const payload = {
      category, subcategory, title, description,
      price: price || 0,
      price_label: price ? fmtPrice(price) : '',
      lat: locObj.lat, lng: locObj.lng,
      // no `address`: the server derives the public area name from the pin
      // (the label is the seller's private name for a saved location)
      details,
      specs: [],
      show_exact_location,
    };

    let data;
    if(ST.editingId){
      data = await apiPut(`/api/listings/${ST.editingId}`, payload);
      // Update cached listing in ST.listings
      const idx = ST.listings.findIndex(x=>x.id===ST.editingId);
      if(idx>=0 && data.listing) ST.listings[idx] = {...ST.listings[idx], ...data.listing};
    } else {
      data = await apiPost('/api/listings', payload);
    }

    // Photos — new listing: upload; edit: apply staged removals first (so the
    // server's 5-photo cap and sort_order renumbering see the final set),
    // then upload any added photos.
    const listingId  = ST.editingId || data.listing?.id;
    let photoFailed = false;
    let photoReason = '';   // server's friendly reason (e.g. unsupported photo format)
    if(ST.editingId){
      for(const pid of _editPhotosRemove){
        try { await apiDelete(`/api/uploads/photo/${pid}`); } catch(_){ photoFailed = true; }
      }
    }
    if(_newPhotos.length>0 && listingId){
      btn.textContent = 'Preparing photos…';
      const fd = new FormData();
      // One at a time — keeps phone memory low (no 5 full-size images at once)
      for(const p of _newPhotos.slice(0, MAX_PHOTOS - keptPhotoCount)) fd.append('photos', await shrinkPhoto(p.file));
      btn.textContent = 'Uploading photos…';
      try {
        const up = await fetch(`${API_URL}/api/uploads/listing/${listingId}`,{
          method:'POST',
          headers:{ Authorization:`Bearer ${ST.session?.access_token}` },
          body:fd,
        });
        const upBody = await up.json().catch(() => ({}));
        photoFailed = !up.ok || !!upBody.warning;   // warning = some photos skipped
        photoReason = (up.ok ? upBody.warning : upBody.error) || '';
      } catch(_){ photoFailed = true; }
    }

    const msg = photoReason
      ? `⚠️ Listing saved, but a photo was not added. ${photoReason}`
      : photoFailed
      ? '⚠️ Listing saved, but some photo changes failed. Open Edit to check its photos (each must be under 5 MB).'
      : ST.editingId
        ? '🔄 Listing updated and re-submitted for review.'
        : '🚀 Listing submitted! It will be reviewed and go live within 4 hours.';
    closePostModal();
    toast(msg);
    // Reset form
    ['postTitle','postDesc'].forEach(id=>document.getElementById(id).value='');
    resetPostPhotos();
    document.getElementById('dynamicFields').innerHTML = '';
    if(ST.tab==='mine') renderMyAds(document.getElementById('sb-content'));
  } catch(e){
    toast('Error: ' + e.message);
  } finally {
    btn.disabled=false; btn.textContent='Submit for Review 🚀';
  }
}

