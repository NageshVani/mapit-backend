// MapIt frontend: map.js. Split from MapIt_MVP_v1.html lines 3011-3408 on 2026-11-15. Load order is set in public/index.html. Functions are global on purpose (inline onclick=).
// ═══════════════════════════════════════════════
// MAP
// ═══════════════════════════════════════════════
let map, radCircle;
let _postPickerMap = null, _postPickerMarker = null;
let _exploreMarker = null, _exploreMoveTO = null;
const mMarkers = {};
let mStackMarkers = []; // co-located listings (identical GPS) rendered as one stacked pin — {ids:Set, group, marker}
let hoverTO;
// Browse-tab-only marker clustering (Leaflet.markercluster) — groups pins that
// are merely close together on screen at the current zoom, separate from the
// mStackMarkers logic above which groups pins sharing the *exact same* GPS
// coordinate. Saved/My Listings never use this: both are small, user-owned lists
// that already auto-fit bounds, so clustering would add nothing there.
let listingCluster = null;

let _userMarker = null;

function initMap(){
  const loc = activeLoc();
  map = L.map('map',{center:[loc.lat,loc.lng],zoom:14,zoomControl:false,renderer:L.canvas()});
  // Session 9G — drop Leaflet's optional "🇺🇦 Leaflet |" prefix. The Mapbox and
  // OpenStreetMap credits on the tile layer below are required by their terms — keep them.
  map.attributionControl.setPrefix(false);
  const _mainTiles = L.tileLayer(mapboxTileUrl(),{
    attribution:'© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
    tileSize:512,zoomOffset:-1,maxZoom:20,
  }).addTo(map);
  runtimeCfgPromise.then(()=>_mainTiles.setUrl(mapboxTileUrl()));
  L.control.zoom({position:'bottomright'}).addTo(map);
  // Final polish (Arun) — one-click way home from wherever the map was dragged
  // or zoomed. Added after the zoom control so it stacks above it.
  const HomeAreaCtl = L.Control.extend({
    options:{position:'bottomright'},
    onAdd(){
      const b = L.DomUtil.create('button', 'map-home-btn');
      b.type = 'button';
      b.title = 'Back to my area';
      b.setAttribute('aria-label', 'Back to my area');
      b.innerHTML = '<span aria-hidden="true">⌂</span> My area';
      L.DomEvent.disableClickPropagation(b);
      L.DomEvent.on(b, 'click', goHomeArea);
      return b;
    }
  });
  new HomeAreaCtl().addTo(map);
  _applyRegionBounds(map);
  _pingMapLoad('browse');

  listingCluster = L.markerClusterGroup({
    maxClusterRadius: 60,       // px — tight-ish, only clusters pins that would actually overlap/crowd
    spiderfyOnMaxZoom: true,    // fan out individual pins if still clustered at max zoom
    showCoverageOnHover: false, // skip the bounds-highlight rectangle, keeps the map calm
    disableClusteringAtZoom: 16,// street-level zoom always shows real individual pins
  }).addTo(map);
  // Desktop-only hover preview of what's inside a cluster bubble — same
  // hoverCard element the single-pin and stack-pin hovers already use.
  // Clicking still does the library's default zoom/spiderfy, unchanged.
  listingCluster.on('clustermouseover', e => {
    if(_isTouchDevice()) return;
    const listings = e.layer.getAllChildMarkers().flatMap(m => m._mapitListings || []);
    showClusterHoverCard(e.layer.getLatLng(), listings);
  });
  listingCluster.on('clustermouseout', () => hideHoverCard());

  // User location marker — stored so it can be moved when active pin changes
  _userMarker = L.marker([loc.lat,loc.lng],{
    icon:L.divIcon({className:'',html:`<div class="umark"><div class="upulse"></div><div class="udot"></div></div>`,iconSize:[44,44],iconAnchor:[22,22]}),
    zIndexOffset:1000,
  }).addTo(map);
  _userMarker.bindPopup(`<b style="color:#F06030">📍 ${escHtml(ST.activePin?.label||'Your Location')}</b>`);

  // Tapping empty map area dismisses an open tap-preview tooltip (mobile pin-tooltip flow)
  map.on('click', ()=>{
    if(_tapPreviewId){
      _tapPreviewId = null;
      document.getElementById('hoverCard').classList.remove('show','tap-mode');
    }
  });

  updateCircle();
}

// True on touch devices (phones/tablets) — used to switch map-pin behavior from
// immediate click-to-detail (desktop, which already gets a free hover preview)
// to a first-tap-shows-tooltip / second-tap-opens-detail flow (Tester-7 scan UX).
function _isTouchDevice(){
  return ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
}
let _tapPreviewId = null;


function mkIcon(l, sel){
  const col = catCol(l.category||l.cat), sz = sel?42:34;
  return L.divIcon({
    className:'',
    html:`<div style="display:flex;flex-direction:column;align-items:center;transform:scale(${sel?1.2:1});transform-origin:bottom center;transition:transform .2s;cursor:pointer;">
      <div style="width:${sz}px;height:${sz}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${col};border:2.5px solid ${sel?'#fff':'rgba(255,255,255,.7)'};display:flex;align-items:center;justify-content:center;box-shadow:${sel?'0 4px 18px rgba(0,0,0,.7)':'0 2px 10px rgba(0,0,0,.5)'};position:relative;">
        <span style="transform:rotate(45deg);font-size:${sel?18:14}px;line-height:1;">${listingEmoji(l)}</span>
      </div>
      <div style="background:rgba(7,14,24,.95);color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;margin-top:2px;white-space:nowrap;font-family:'Outfit',sans-serif;border:1px solid rgba(255,255,255,.12);box-shadow:0 2px 8px rgba(0,0,0,.5);">${priceText(l)}</div>
    </div>`,
    iconSize:[70,62],iconAnchor:[35,62],
  });
}

function mkStackIcon(l, count, sel){
  const col = catCol(l.category||l.cat), sz = sel?42:34;
  return L.divIcon({
    className:'',
    html:`<div style="display:flex;flex-direction:column;align-items:center;transform:scale(${sel?1.2:1});transform-origin:bottom center;transition:transform .2s;cursor:pointer;">
      <div style="width:${sz}px;height:${sz}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${col};border:2.5px solid ${sel?'#fff':'rgba(255,255,255,.7)'};display:flex;align-items:center;justify-content:center;box-shadow:${sel?'0 4px 18px rgba(0,0,0,.7)':'0 2px 10px rgba(0,0,0,.5)'};position:relative;">
        <span style="transform:rotate(45deg);font-size:${sel?18:14}px;line-height:1;">${listingEmoji(l)}</span>
        <div class="stack-badge">${count}</div>
      </div>
      <div style="background:rgba(7,14,24,.95);color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;margin-top:2px;white-space:nowrap;font-family:'Outfit',sans-serif;border:1px solid rgba(255,255,255,.12);box-shadow:0 2px 8px rgba(0,0,0,.5);">${count} listings here</div>
    </div>`,
    iconSize:[70,62],iconAnchor:[35,62],
  });
}

function drawMarkers(){
  Object.values(mMarkers).forEach(m=>m.remove());
  for(const k in mMarkers) delete mMarkers[k];
  mStackMarkers.forEach(s=>s.marker.remove());
  mStackMarkers = [];
  listingCluster.clearLayers();
  // Markers are about to be torn down and rebuilt — an open tap-preview
  // tooltip would otherwise point at a marker that no longer exists.
  _tapPreviewId = null;
  document.getElementById('hoverCard').classList.remove('show','tap-mode');

  const isFav = ST.tab === 'fav';
  const isMine = ST.tab === 'mine';
  // My Listings: show only the seller's own listing pins (matches the sidebar
  // list exactly, same as Saved) — not leftover Browse-tab radius/category
  // pins, which were confusing since they had nothing to do with "my ads".
  const fl = isFav ? ST.favListings : isMine ? ST.myListings : filtered();
  const keepTab = isFav || isMine; // passed through to selListing() so clicking a pin doesn't reset the active tab
  document.getElementById('mapCnt').textContent = fl.length;
  if(!isFav && !isMine) document.getElementById('cnt-badge').textContent = fl.length;

  // Group listings by exact GPS coordinate — co-located listings (same
  // apartment complex/bazaar) render as one stacked pin instead of fully
  // overlapping markers where only the topmost was ever clickable.
  const groups = {};
  fl.forEach(l=>{
    const key = `${(+l.lat).toFixed(6)},${(+l.lng).toFixed(6)}`;
    (groups[key] = groups[key] || []).push(l);
  });

  Object.values(groups).forEach(group=>{
    if(group.length === 1){
      const l = group[0];
      const sel = l.id === ST.selId;
      const m = L.marker([l.lat,l.lng],{icon:mkIcon(l,sel),zIndexOffset:sel?500:0})
        .on('click',()=>{
          if(!_isTouchDevice()){ selListing(l.id, keepTab); return; }
          // Mobile scan UX (Tester-7): first tap previews in a tooltip, second
          // tap on the same pin (or its "View" button) opens the full detail.
          if(_tapPreviewId === l.id){
            _tapPreviewId = null;
            document.getElementById('hoverCard').classList.remove('show','tap-mode');
            selListing(l.id, keepTab);
          } else {
            _tapPreviewId = l.id;
            showHoverCard(l, keepTab, true);
          }
        })
        .on('mouseover',()=>{ if(!_isTouchDevice()) showHoverCard(l); })
        .on('mouseout',()=>{ if(!_isTouchDevice()) hideHoverCard(); });
      m._mapitListings = [l]; // read by the cluster hover preview to list what's inside a bubble
      keepTab ? m.addTo(map) : listingCluster.addLayer(m);
      mMarkers[l.id] = m;
    } else {
      const ids = new Set(group.map(l=>l.id));
      const anySel = ids.has(ST.selId);
      const m = L.marker([group[0].lat,group[0].lng],{icon:mkStackIcon(group[0],group.length,anySel),zIndexOffset:anySel?500:0})
        .on('click',()=>openStackPopup(group, keepTab))
        .on('mouseover',()=>showStackHoverCard(group))
        .on('mouseout',()=>hideHoverCard());
      m._mapitListings = group; // read by the cluster hover preview to list what's inside a bubble
      keepTab ? m.addTo(map) : listingCluster.addLayer(m);
      mStackMarkers.push({ids, group, marker:m});
    }
  });

  // Auto-fit map to show all saved/own listings when none is selected
  if(keepTab && fl.length > 0 && !ST.selId && !mapHidden()){
    const bounds = L.latLngBounds(fl.map(l=>[l.lat,l.lng]));
    map.fitBounds(bounds, {padding:[50,50], animate:true, maxZoom:14});
  }

  // Draw user pin markers
  drawPinMarkers();
}

// Scrollable mini-list popup for a stacked pin (≥2 listings at the identical GPS point)
function openStackPopup(group, isFav){
  const html = `<div class="stack-popup">
    <div class="stack-popup-hd">📍 ${group.length} listings at this location</div>
    <div class="stack-popup-list">
      ${group.map(l=>`<div class="stack-popup-item" onclick="closeStackPopupAndSelect('${l.id}',${isFav})">
        <span class="stack-popup-emoji">${listingEmoji(l)}</span>
        <div class="stack-popup-mid">
          <div class="stack-popup-title">${escHtml(l.title)}</div>
          <div class="stack-popup-price">${priceText(l)}</div>
        </div>
      </div>`).join('')}
    </div>
  </div>`;
  L.popup({maxWidth:260,closeButton:true}).setLatLng([group[0].lat,group[0].lng]).setContent(html).openOn(map);
}
function closeStackPopupAndSelect(id, isFav){
  map.closePopup();
  selListing(id, isFav);
}
function showStackHoverCard(group){
  clearTimeout(hoverTO);
  const pt = map.latLngToContainerPoint([group[0].lat,group[0].lng]);
  const hc = document.getElementById('hoverCard');
  const mw = document.getElementById('mapc').offsetWidth;
  let left = pt.x + 18, top = pt.y - 60;
  if(left+250>mw) left = pt.x-255;
  if(top<8) top = pt.y+18;
  hc.style.left = left+'px'; hc.style.top = top+'px';
  document.getElementById('hcInner').innerHTML = `
    <div class="hc-title">📍 ${group.length} listings here</div>
    <div class="hc-tip">Click pin to see the full list →</div>`;
  hc.classList.add('show');
}

// Cluster-bubble hover preview — one compact line per listing (emoji +
// subcategory only, not title/price like the stack popup) since a cluster
// can hold far more listings than a same-coordinate stack and this is just
// a fast glance, not the full list. Capped so a huge cluster can't produce
// an unreadably tall tooltip.
const CLUSTER_HOVER_MAX_LINES = 12;
function showClusterHoverCard(latlng, listings){
  clearTimeout(hoverTO);
  const pt = map.latLngToContainerPoint(latlng);
  const hc = document.getElementById('hoverCard');
  const mw = document.getElementById('mapc').offsetWidth;
  let left = pt.x + 18, top = pt.y - 60;
  if(left+250>mw) left = pt.x-255;
  if(top<8) top = pt.y+18;
  hc.style.left = left+'px'; hc.style.top = top+'px';
  const shown = listings.slice(0, CLUSTER_HOVER_MAX_LINES);
  const rows = shown.map(l=>`<div class="hc-row"><span>${listingEmoji(l)} ${escHtml(l.subcategory||l.category)}</span></div>`).join('');
  const more = listings.length > CLUSTER_HOVER_MAX_LINES
    ? `<div class="hc-row">+${listings.length - CLUSTER_HOVER_MAX_LINES} more…</div>` : '';
  document.getElementById('hcInner').innerHTML = `
    <div class="hc-title">📍 ${listings.length} listings here</div>
    ${rows}${more}
    <div class="hc-tip">Click to zoom in →</div>`;
  hc.classList.add('show');
}

function drawPinMarkers(){
  if(window._pinMarkers) window._pinMarkers.forEach(m=>m.remove());
  window._pinMarkers = [];
  ST.userPins.forEach(p=>{
    if(p.is_default) return; // active pin is shown by the red pulsing _userMarker
    const m = L.marker([p.lat,p.lng],{
      icon:L.divIcon({
        className:'',
        html:`<div class="pin-marker"><div class="pin-dot-inactive"></div><div class="pin-label-muted">${escHtml(p.label)}</div></div>`,
        iconSize:[80,30],iconAnchor:[40,5],
      }),zIndexOffset:200,
    }).addTo(map);
    window._pinMarkers.push(m);
  });
}

function updateCircle(){
  if(radCircle) radCircle.remove();
  const loc = activeLoc();
  const circleColor = ST.exploreMode ? '#3B82F6' : '#F06030';
  if(ST.rad<WHOLE_CITY_KM){
    radCircle=L.circle([loc.lat,loc.lng],{
      radius:ST.rad*1000,color:circleColor,fillColor:circleColor,
      fillOpacity:.06,weight:2.5,dashArray:'7 6',
    }).addTo(map);
  }
}

// ═══════════════════════════════════════════════
// HOVER CARD
// ═══════════════════════════════════════════════
function showHoverCard(l, isFav, tapMode){
  clearTimeout(hoverTO);
  const loc = activeLoc();
  const d = dist(loc.lat,loc.lng,l.lat,l.lng);
  const col = catCol(l.category||l.cat);
  const pt = map.latLngToContainerPoint([l.lat,l.lng]);
  const hc = document.getElementById('hoverCard');
  const mw = document.getElementById('mapc').offsetWidth;
  let left = pt.x + 18, top = pt.y - 110;
  if(left+250>mw) left = pt.x-255;
  if(top<8) top = pt.y+18;
  hc.style.left = left+'px'; hc.style.top = top+'px';
  const details = l.details || {};
  const subFields = (LISTING_FIELDS[l.category||l.cat]||{})[l.subcategory||l.sub] || [];
  const starredHtml = subFields.filter(f=>f.starred && details[f.id] != null && details[f.id] !== '')
    .map(f=>`<div class="hc-row"><span style="color:var(--muted2)">${f.label}</span><b>${escHtml(details[f.id])}</b></div>`)
    .join('');
  // Tap mode (mobile): the tip becomes a real tappable "View" button, since a
  // second tap on a tiny map pin is an easy miss — hover mode (desktop, where
  // clicking the pin itself already opens the detail) keeps the static hint.
  const tipHtml = tapMode
    ? `<button class="hc-view-btn" onclick="_tapPreviewId=null;document.getElementById('hoverCard').classList.remove('show','tap-mode');selListing('${l.id}', ${!!isFav})">View full details →</button>`
    : `<div class="hc-tip">Click pin to view full details →</div>`;
  document.getElementById('hcInner').innerHTML = `
    <div class="hc-cat" style="color:${col}">${catLbl(l.category||l.cat)} · ${escHtml(l.subcategory||l.sub)}</div>
    <div class="hc-title">${escHtml(l.title)}</div>
    <div class="hc-price">${priceText(l)}</div>
    ${starredHtml}
    <div class="hc-row" style="margin-top:4px">
      <span class="hc-dist">📍 ${fmtD(d)}</span>
    </div>
    ${tipHtml}`;
  hc.classList.toggle('tap-mode', !!tapMode);
  hc.classList.add('show');
}
function hideHoverCard(){
  hoverTO = setTimeout(()=>document.getElementById('hoverCard').classList.remove('show'),180);
}

// ═══════════════════════════════════════════════
// LISTINGS — fetch from API
// ═══════════════════════════════════════════════
// Latest request wins (pre-listing audit, 2026-10-24): this used to return
// early while a load was in flight, silently dropping e.g. Explore → My
// location or a category tap, so the list kept stale results/distances.
// Now every call loads; a response that a newer call has overtaken is ignored.
let _listingsSeq = 0;
async function loadListings(){
  const seq = ++_listingsSeq;
  ST.loadingListings = true;
  showSidebarLoading();
  const loc = activeLoc();
  const radiusM = ST.rad * 1000;
  try {
    let url = `/api/listings?lat=${loc.lat}&lng=${loc.lng}&radius=${radiusM}`;
    if(ST.cat !== 'all') url += `&category=${ST.cat}`;
    if(ST.txn) url += `&txn=${ST.txn}`;
    if(ST.sub && ST.sub !== 'All Types') url += `&subcategory=${encodeURIComponent(ST.sub)}`;
    const data = await apiGet(url);
    if(seq !== _listingsSeq) return;   // overtaken by a newer load — drop this stale result
    // Enrich with distance
    ST.listings = (data.listings||[])
      .filter(l => l.seller_id !== ST.user?.id)   // hide own listings from browse
      .map(l=>({
        ...l,
        d: l.distance_m != null ? l.distance_m/1000 : dist(loc.lat,loc.lng,l.lat,l.lng),
      }));
    _keepSharedListing();
  } catch(e){
    if(seq !== _listingsSeq) return;
    toast('Could not load listings: ' + e.message);
    ST.listings = [];
  } finally {
    // only the newest load may clear the spinner and redraw
    if(seq === _listingsSeq){
      ST.loadingListings = false;
      drawMarkers();
      renderSidebar();
    }
  }
}

function filtered(){
  let list = ST.listings;
  if(ST.q){
    const ql = ST.q.toLowerCase();
    list = list.filter(l=>
      l.title?.toLowerCase().includes(ql)||
      (l.address||'').toLowerCase().includes(ql)||
      (l.subcategory||'').toLowerCase().includes(ql)
    );
    // Also constrain to current map viewport so results respect where the user is looking.
    // Only when the map is on screen: in phone List view it is display:none, its
    // bounds collapse to a point and every listing was filtered out (2026-10-16).
    if(map && map.getBounds && !mapHidden()){
      try {
        const bounds = map.getBounds();
        list = list.filter(l => l.lat && l.lng && bounds.contains([l.lat, l.lng]));
      } catch(_){}
    }
  }
  return list.sort((a,b)=>(a.d||0)-(b.d||0));
}

function showSidebarLoading(){
  document.getElementById('sb-content').innerHTML = `
    <div class="sb-empty"><div class="loading-spin"></div><div class="sb-empty-sub">Loading listings…</div></div>`;
}

