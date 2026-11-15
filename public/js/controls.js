// MapIt frontend: controls.js. Split from MapIt_MVP_v1.html lines 4806-5194 on 2026-11-15. Load order is set in public/index.html. Functions are global on purpose (inline onclick=).
// ═══════════════════════════════════════════════
// PINS MODAL
// ═══════════════════════════════════════════════
async function openPinsModal(){
  document.getElementById('pinsModal').classList.remove('hide');
  await loadAndRenderPins();
  initAddPinMap();
}
function closePinsModal(){
  document.getElementById('pinsModal').classList.add('hide');
  if(_addPinMap){ _addPinMap.remove(); _addPinMap = null; _addPinMarker = null; _addPinCoords = null; }
}

async function loadAndRenderPins(){
  try {
    const data = await apiGet('/api/pins');
    ST.userPins = data.pins||[];
    // Sync active pin, header badge, user marker and map when the default changes
    const def = ST.userPins.find(p=>p.is_default) || ST.userPins[0];
    if(def && (!ST.activePin || def.id !== ST.activePin?.id)){
      ST.activePin = def;
      document.getElementById('activePinLabel').textContent = def.label;
      if(_userMarker){
        _userMarker.setLatLng([def.lat, def.lng]);
        _userMarker.setPopupContent(`<b style="color:#F06030">📍 ${escHtml(def.label)}</b>`);
      }
      if(map) map.setView([def.lat, def.lng], 14, {animate:!mapHidden()});
      updateCircle();
    }
    renderPinsList();
    drawPinMarkers();
  } catch(e){ toast('Could not load pins: '+e.message); }
}

// Saved-location action icons (Lucide, MIT). Inline SVG: same look on every
// device, and stroke="currentColor" picks up the button's hover colour.
const _svg = d => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const PIN_ICONS = {
  rename: _svg('<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>'),
  active: _svg('<line x1="2" x2="5" y1="12" y2="12"/><line x1="19" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="5"/><line x1="12" x2="12" y1="19" y2="22"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/>'),
  remove: _svg('<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>'),
};

function renderPinsList(){
  const el = document.getElementById('pinsList');
  if(!ST.userPins.length){
    el.innerHTML=`<div style="padding:20px 22px;color:var(--muted);font-size:13px;text-align:center;">No saved locations yet.<br>Add your first one below!</div>`;
    return;
  }
  const onlyOne = ST.userPins.length === 1;
  el.innerHTML = ST.userPins.map(p=>`
    <div class="pin-item">
      <div class="pin-ico ${p.is_default?'default':''}">📍</div>
      <div class="pin-info">
        <div class="pin-name">${escHtml(p.label)} ${p.is_default?'<span style="font-size:10px;color:var(--orange);font-weight:700;">● Active</span>':''}</div>
        <div class="pin-coords">${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}</div>
      </div>
      <div class="pin-actions">
        <button class="pin-action-btn icon" onclick="renamePin('${p.id}')" title="Rename" aria-label="Rename">${PIN_ICONS.rename}</button>
        ${!p.is_default?`<button class="pin-action-btn icon primary" onclick="setDefaultPin('${p.id}')" title="Set as active location" aria-label="Set as active location">${PIN_ICONS.active}</button>`:''}
        ${onlyOne?'':`<button class="pin-action-btn icon danger" ${p.is_default?'disabled':''} title="${p.is_default?'Set another location as active before removing this one':'Remove'}" aria-label="Remove" onclick="deletePin('${p.id}')">${PIN_ICONS.remove}</button>`}
      </div>
    </div>`).join('');
}

async function setDefaultPin(id, skipConfirm){
  const candidate = ST.userPins.find(p=>p.id===id);
  if(!candidate) return;
  if(!skipConfirm && !(await mapitDialog({
    title: 'Change active location?',
    message: `Set "${candidate.label}" as your active location?`,
    okText: 'Set Active',
  }))) return;
  try {
    await apiPut(`/api/pins/${id}/default`,{});
    await loadAndRenderPins(); // this now syncs ST.activePin, marker, map via the updated function
    await loadListings();
    closePinsModal();
    toast(`📍 ${candidate.label} is now your active location.`);
  } catch(e){ toast(e.message); }
}

async function renamePin(id){
  const pin = ST.userPins.find(p=>p.id===id);
  if(!pin) return;
  const label = await mapitDialog({
    title: 'Rename location',
    input: { value: pin.label, maxlength: 40, placeholder: 'e.g. Home, Office' },
    okText: 'Save',
  });
  if(label === null) return;
  const trimmed = label.trim();
  if(!trimmed){ toast('Label cannot be empty.'); return; }
  if(trimmed === pin.label) return;
  try {
    await apiPut(`/api/pins/${id}`, { label: trimmed });
    await loadAndRenderPins();
    toast(`📍 Renamed to "${trimmed}".`);
  } catch(e){ toast(e.message); }
}

async function deletePin(id){
  try {
    await apiDelete(`/api/pins/${id}`);
    await loadAndRenderPins();
    toast('Pin removed.');
  } catch(e){ toast(e.message); }
}

// ═══════════════════════════════════════════════
// CONTROLS
// ═══════════════════════════════════════════════
function setCat(id){
  const chip = BROWSE_CHIPS.find(c=>c.id===id) || BROWSE_CHIPS[0];
  ST.chip=chip.id; ST.cat=chip.cat; ST.txn=chip.txn; ST.sub=null; ST.selId=null;
  renderCats(); loadListings();
}
function setSub(s){
  ST.sub=(ST.sub===s?null:s);
  ST.selId=null;
  renderCats(); loadListings();
}
function setRad(r){
  ST.rad=r;
  document.getElementById('radLbl').textContent = r>=WHOLE_CITY_KM?'whole city':r+' km';
  // match by each option's own data-r value, not its position in the menu
  document.querySelectorAll('.rbt').forEach(b=>b.classList.toggle('on',Number(b.dataset.r)===r));
  closeRadMenu();
  updateCircle();
  fitMapToRadius();
  loadListings();
}
// Frame the map on the active search area: the radius circle, or a ~25 km box
// for "Whole city". fly=true animates like the Explore search jump (Session 9G,
// Arun: returning from Explore to My location must pan + zoom back).
// Session 9J — on phones in List view the map is display:none (0×0). Leaflet's
// animated moves divide by the map's size and throw "Invalid LatLng (NaN, NaN)",
// which stopped listing details from opening for List-view users. While hidden,
// jump without animation; setViewMode('map') re-measures the map when shown.
function mapHidden(){ const c = document.getElementById('mapc'); return !c || c.offsetParent === null; }
function fitMapToRadius(fly){
  const loc=activeLoc();
  if(mapHidden()){
    // No size to fit bounds against — use a zoom that roughly frames the radius
    const z = ST.rad<=1 ? 15 : ST.rad<=3 ? 14 : ST.rad<=5 ? 13 : ST.rad<=10 ? 12 : 10;
    map.setView([loc.lat, loc.lng], z, {animate:false});
    return;
  }
  let bounds, pad;
  if(ST.rad<WHOLE_CITY_KM&&radCircle){ bounds=radCircle.getBounds(); pad=[30,30]; }
  else{ const d=25/111,dg=d/Math.cos(loc.lat*Math.PI/180); bounds=L.latLngBounds([[loc.lat-d,loc.lng-dg],[loc.lat+d,loc.lng+dg]]); pad=[20,20]; }
  if(fly) map.flyToBounds(bounds,{padding:pad,duration:.8});
  else map.fitBounds(bounds,{padding:pad,animate:true});
}
// Keyword results follow the visible map (filtered when the list is drawn),
// so after a programmatic move the list is redrawn once the map settles.
function _rerenderAfterMove(){ map.once('moveend', ()=>{ if(!ST.selId) renderSidebar(); }); }
// "⌂ My area" map button + re-picking the active saved location (final polish, Arun).
function goHomeArea(){
  _preDetailView = null; // an explicit trip home replaces any view saved by an open listing
  if(ST.exploreMode){ setSearchMode('pin'); return; }
  _rerenderAfterMove();
  fitMapToRadius(true);
}
function setSearchMode(mode){
  ST.exploreMode = (mode === 'explore');
  document.getElementById('smPin').classList.toggle('on', !ST.exploreMode);
  document.getElementById('smExplore').classList.toggle('on', ST.exploreMode);
  document.getElementById('searchModeBox').classList.toggle('exploring', ST.exploreMode);
  if(ST.exploreMode){
    _placeExploreMarker();
    map.on('move', _onExploreMove);
    map.on('moveend', _onExploreMoveEnd);
    toast('🗺 Move the map to explore any area — or tap 🔍 to search');
  } else {
    if(_exploreMarker){ _exploreMarker.remove(); _exploreMarker = null; }
    clearTimeout(_exploreMoveTO);
    map.off('move', _onExploreMove);
    map.off('moveend', _onExploreMoveEnd);
    closeExploreSearch();
  }
  updateCircle();
  if(!ST.exploreMode) fitMapToRadius(true);
  loadListings();
}
function _placeExploreMarker(){
  if(_exploreMarker) _exploreMarker.remove();
  const c = map.getCenter();
  const icon = L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:50%;background:#3B82F6;border:2.5px solid #fff;box-shadow:0 0 0 3px rgba(59,130,246,.35),0 2px 8px rgba(59,130,246,.5)"></div>`,
    iconSize: [14,14],
    iconAnchor: [7,7],
  });
  _exploreMarker = L.marker([c.lat,c.lng],{icon,interactive:false,zIndexOffset:-100}).addTo(map);
}
// While a listing is open, the map flies to it — that move must not shift the
// Explore search point, or the list re-searches from the listing's own pin and
// its distance becomes the 150–400 m display offset (Arun, 2026-10-17).
// Back (closeDetail) restores the previous view, which re-syncs everything.
function _onExploreMove(){
  if(!_exploreMarker || ST.selId) return;
  const c = map.getCenter();
  _exploreMarker.setLatLng(c);
  if(radCircle) radCircle.setLatLng(c);
}
function _onExploreMoveEnd(){
  if(ST.selId) return;
  clearTimeout(_exploreMoveTO);
  _exploreMoveTO = setTimeout(loadListings, 800);
}

// ── Explore Area search bar (Session 8 item 11) ────────────────
// Same Photon-based locality/city search as the post-listing/home-location
// pickers (photonPlaces) — flyTo only, never places a pin. In
// Explore mode the map center itself IS the search point (the blue dot
// marker + radius circle already follow map center via _onExploreMove),
// so flyTo's own 'moveend' event is all that's needed to pick up the new
// area — no separate marker-placement step like the post-listing picker needs.
let _exploreSearchTimer = null;
let _exploreSearchResults = [];

// 🔍 opens the field in place of the Explore button; ✕ (or picking a place) closes
// it and stays in Explore — moving the map stays the main way to explore.
function openExploreSearch(){
  document.getElementById('searchModeBox').classList.add('searching');
  document.getElementById('exploreSearchIn').focus();
}
function closeExploreSearch(){
  clearTimeout(_exploreSearchTimer);
  document.getElementById('searchModeBox').classList.remove('searching');
  const inp = document.getElementById('exploreSearchIn'), dd = document.getElementById('exploreSearchDD');
  inp.value = ''; inp.blur();
  dd.classList.add('hide'); dd.innerHTML = '';
}

function _onExploreSearchInput(){
  clearTimeout(_exploreSearchTimer);
  const q = document.getElementById('exploreSearchIn').value.trim();
  const dd = document.getElementById('exploreSearchDD');
  if(q.length < 4){ dd.classList.add('hide'); dd.innerHTML = ''; return; }
  _exploreSearchTimer = setTimeout(()=>_runExploreSearch(q), 400);
}

async function _runExploreSearch(q){
  const dd = document.getElementById('exploreSearchDD');
  try {
    const c = map.getCenter();
    const latDelta = 0.35; // ~39km
    const lonDelta = latDelta / Math.cos(c.lat * Math.PI / 180);
    const geoParams = `&lat=${c.lat}&lon=${c.lng}&bbox=${c.lng-lonDelta},${c.lat-latDelta},${c.lng+lonDelta},${c.lat+latDelta}`;
    const r = await fetch(`https://photon.komoot.io/api/?limit=10&q=${encodeURIComponent(q)}${geoParams}`);
    const { features } = await r.json();
    _exploreSearchResults = photonPlaces(features);
    if(!_exploreSearchResults.length){ dd.classList.add('hide'); dd.innerHTML = ''; return; }
    dd.innerHTML = '';
    _exploreSearchResults.forEach((m, i) => {
      const row = document.createElement('div');
      row.className = 'explore-search-row';
      row.textContent = '📍 ' + m.display_name.split(',').slice(0,3).map(x=>x.trim()).join(', ');
      row.onclick = () => _pickExploreSearchResult(i);
      dd.appendChild(row);
    });
    dd.classList.remove('hide');
  } catch(_){
    dd.classList.add('hide'); dd.innerHTML = '';
  }
}

function _pickExploreSearchResult(i){
  const m = _exploreSearchResults[i];
  if(!m) return;
  const place = m.display_name.split(',')[0].trim();
  closeExploreSearch(); // also closes the phone keyboard
  toast(`🗺 Exploring ${place} — move the map to look around`);
  // The field is in the header now, so it is usable in phone List view, where the
  // map is hidden and an animated flyTo throws "Invalid LatLng (NaN, NaN)" (9J).
  if(mapHidden()) map.setView([+m.lat, +m.lon], 15, {animate:false});
  else map.flyTo([+m.lat, +m.lon], 15);
}

// Close the results dropdown on any click outside the search box, same
// safety-net every other search dropdown in this app lacks (they live
// inside modals that get closed a different way) — this one drops down over
// the live map, so a stray click needs to dismiss it instead of leaving
// stale results hovering over the tiles.
document.addEventListener('click', (e) => {
  const box = document.getElementById('exploreSearchBox');
  if(box && !box.contains(e.target)) document.getElementById('exploreSearchDD').classList.add('hide');
});
// Mobile map/list single-pane view toggle (Session 5 item 6, Tester-3a).
// Only visually meaningful on narrow screens (see #main.view-map/.view-list
// CSS) — harmless no-op on desktop, which always shows both panes.
function setViewMode(mode, persist=true){
  ST.viewMode = mode;
  if(persist) _detailFromMap = false;   // the user picked a view themselves — Back must not override it
  document.getElementById('main').classList.toggle('view-map', mode==='map');
  document.getElementById('main').classList.toggle('view-list', mode==='list');
  document.getElementById('vbtnList').classList.toggle('on', mode==='list');
  document.getElementById('vbtnMap').classList.toggle('on', mode==='map');
  // Leaflet sizes itself off its container at init time — if the map started
  // out hidden behind display:none (list-mode default), switching back to
  // map mode needs an explicit resize or the tiles render at 0x0.
  if(mode==='map' && map) setTimeout(()=>map.invalidateSize(), 50);
  updateKwPill();
  if(persist) apiPut('/api/auth/default-view', { default_view: mode }).catch(()=>{});
}

function switchTab(tab){
  ST.tab=tab;
  ST.selId=null; // clear stale selection so a previously-viewed listing can't leak into another tab's detail view
  _detailFromMap = false;
  document.getElementById('tab-browse').classList.toggle('on',tab==='browse');
  document.getElementById('tab-fav').classList.toggle('on',tab==='fav');
  document.getElementById('tab-mine').classList.toggle('on',tab==='mine');
  // Proximity radius and search mode only apply to the Listings browse tab
  document.querySelector('.rad-box').classList.toggle('disabled', tab !== 'browse');
  const smBox = document.getElementById('searchModeBox');
  if(smBox) smBox.classList.toggle('disabled', tab !== 'browse');
  // Clear keyword state when leaving browse tab (no draw yet — drawMarkers below handles it)
  if(tab !== 'browse'){
    ST.q = '';
    const si = document.getElementById('srchIn'); if(si) si.value = '';
    const sc = document.getElementById('srchClear'); if(sc) sc.style.display = 'none';
    updateKwPill();
  }
  // Redraw markers for the new tab (fav shows saved pins, browse shows radius listings, mine keeps browse pins)
  drawMarkers();
  renderSidebar();
}
function toast(msg){
  const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');
  clearTimeout(t._to);t._to=setTimeout(()=>t.classList.remove('show'),3200);
}

// Escape user-typed text before putting it into innerHTML.
// Rule (pre-launch security audit, 2026-10-16): every value that came from a
// user, the API or another site (titles, details, names, chat, addresses,
// search text, error messages, URLs) goes through escHtml() inside an HTML
// template. Our own constants (labels, emoji, icons) don't need it.
function escHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
// A value passed as a JS argument inside an inline handler, e.g.
//   onclick="markAsSold('${id}', ${jsArg(title)})"   ← no quotes around ${…}
// JSON.stringify makes a valid JS string; escHtml keeps it inside the attribute.
function jsArg(s){ return escHtml(JSON.stringify(String(s ?? ''))); }

// ── In-app dialog ─────────────────────────────────────────────────
// Replaces the browser's prompt()/confirm(): those can't be styled, show the
// site address as their title ("mapit-backend-git-uat… says") and are
// silently blocked by some in-app browsers. Returns a Promise, so callers
// must await it:
//   confirm mode (no `input`) → true / false
//   input mode               → the typed text, or null on Cancel
let _dlgResolve = null, _dlgHasInput = false;
function mapitDialog({ title, message = '', input = null, okText = 'OK', cancelText = 'Cancel', danger = false }){
  if(_dlgResolve) _dlgClose(false); // never leave an earlier caller hanging
  document.getElementById('mapitDlgTitle').textContent = title;
  document.getElementById('mapitDlgMsg').textContent = message;
  const inp = document.getElementById('mapitDlgInput');
  _dlgHasInput = !!input;
  inp.classList.toggle('hide', !input);
  if(input){
    inp.value = input.value || '';
    inp.placeholder = input.placeholder || '';
    inp.maxLength = input.maxlength || 100;
  }
  const ok = document.getElementById('mapitDlgOk');
  ok.textContent = okText;
  ok.className = 'dlg-btn ' + (danger ? 'danger' : 'primary');
  document.getElementById('mapitDlgCancel').textContent = cancelText;
  document.getElementById('mapitDlg').classList.remove('hide');
  setTimeout(() => (input ? inp : ok).focus(), 30);
  return new Promise(res => { _dlgResolve = res; });
}
function _dlgClose(confirmed){
  const res = _dlgResolve; _dlgResolve = null;
  document.getElementById('mapitDlg').classList.add('hide');
  if(!res) return;
  if(_dlgHasInput) res(confirmed ? document.getElementById('mapitDlgInput').value : null);
  else res(!!confirmed);
}
document.addEventListener('keydown', e => {
  if(!_dlgResolve) return;
  if(e.key === 'Escape'){ e.preventDefault(); _dlgClose(false); }
  else if(e.key === 'Enter'){ e.preventDefault(); _dlgClose(true); }
});

