// MapIt frontend: listings.js. Split from MapIt_MVP_v1.html lines 3409-3807 on 2026-11-15. Load order is set in public/index.html. Functions are global on purpose (inline onclick=).
// ═══════════════════════════════════════════════
// SAVED LISTINGS
// ═══════════════════════════════════════════════
async function loadSaved(){
  try {
    const data = await apiGet('/api/listings/saved/all');
    ST.savedIds = new Set((data.listings||[]).map(l=>l.id));
    document.getElementById('fav-badge').textContent = ST.savedIds.size;
  } catch(_){}
}

function updateMineBadge(){
  const b = document.getElementById('mine-badge');
  if(b) b.textContent = ST.myListings.length;
}

async function loadMyAdsCount(){
  try {
    const data = await apiGet('/api/listings/mine/all');
    ST.myListings = data.listings || [];
    updateMineBadge();
  } catch(_){}
}

async function toggleFav(id){
  try {
    const data = await apiPost(`/api/listings/${id}/save`, {});
    if(data.saved){ ST.savedIds.add(id); toast('❤ Saved to favourites!'); }
    else { ST.savedIds.delete(id); toast('Removed from saved listings.'); }
    document.getElementById('fav-badge').textContent = ST.savedIds.size;
    // Update heart button if detail is open
    const btn = document.getElementById('favBtn');
    if(btn){
      btn.classList.toggle('saved', ST.savedIds.has(id));
      btn.textContent = ST.savedIds.has(id) ? '❤' : '♡';
    }
  } catch(e){ toast('Could not save: ' + e.message); }
}

async function renderFavs(el){
  try {
    const data = await apiGet('/api/listings/saved/all');
    const loc = activeLoc();
    ST.favListings = (data.listings||[]).map(l=>({...l, d:dist(loc.lat,loc.lng,l.lat,l.lng)}));
    if(!ST.favListings.length){
      el.innerHTML = `<div class="sb-empty"><div class="sb-empty-ico">❤</div><div class="sb-empty-ttl">No saved listings yet</div><div class="sb-empty-sub">Click ♡ on any listing to save it here.</div></div>`;
      drawMarkers();
      return;
    }
    el.innerHTML = `<div style="padding:9px 13px 5px;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);">${ST.favListings.length} saved listing${ST.favListings.length!==1?'s':''}</div>`+
      ST.favListings.map(l=>`
        <div class="fav-card" onclick="viewFav('${l.id}')">
          <div class="fav-thumb" style="background:linear-gradient(135deg,var(--card),var(--card2))">
            ${l.cover_photo ? `<img src="${escHtml(l.cover_photo)}" alt="" loading="lazy" decoding="async"/>` : (CAT_EMOJI[l.category]||'📦')}
          </div>
          <div class="fav-info">
            <div class="fav-ttl">${escHtml(l.title)}</div>
            <div class="fav-price">${priceText(l)}</div>
            <div class="fav-dist">📍 ${fmtD(l.d)} · ${escHtml(l.address)}</div>
          </div>
          <div class="fav-rm" onclick="event.stopPropagation();removeFav('${l.id}')" title="Remove">✕</div>
        </div>`).join('');
    drawMarkers(); // draw pins for all saved listings and fit bounds
  } catch(_){
    ST.favListings = [];
    el.innerHTML = `<div class="sb-empty"><div class="sb-empty-ico">❤</div><div class="sb-empty-ttl">No saved listings yet</div></div>`;
  }
}

// ═══════════════════════════════════════════════
// MY ADS
// ═══════════════════════════════════════════════
function openMyAds(){
  document.getElementById('uavMenu').classList.remove('open');
  switchTab('mine');
}

// Session 9L — a reviewer sent the listing back. Both outcomes are status
// 'rejected'; the stored sentence starts with the heading, so the label comes
// from it. Keep these prefixes in step with GROUP_HEADINGS in
// src/config/reviewReasons.js — a reworded heading falls back to "Not live".
// rejection_reason is kept when the seller edits (D18) but only shown here
// while the status is still 'rejected'.
function reviewOutcome(l){
  if(l.status !== 'rejected') return null;
  const full = l.rejection_reason || '';
  const reason = full.replace(/^(Needs a small change|Not approved):\s*/, '');   // the label already says it
  if(full.startsWith('Needs a small change')) return { kind:'change', label:'Needs a change', color:'var(--gold)', reason };
  if(full.startsWith('Not approved'))         return { kind:'reject', label:'Not approved',   color:'var(--red)',  reason };
  return { kind:'other', label:'Not live', color:'var(--muted)', reason: full };
}

async function renderMyAds(el){
  el.innerHTML = `<div class="sb-empty"><div class="loading-spin"></div><div class="sb-empty-sub">Loading your listings…</div></div>`;
  try {
    const data = await apiGet('/api/listings/mine/all');
    const listings = data.listings || [];
    ST.myListings = listings;
    updateMineBadge();
    if(!listings.length){
      el.innerHTML = `<div class="sb-empty">
        <div class="sb-empty-ico">📋</div>
        <div class="sb-empty-ttl">No listings posted yet</div>
        <div class="sb-empty-sub">You haven't posted any listings yet.<br>Tap <b>➕ Post a Listing</b> in the header to get started.</div>
      </div>`;
      return;
    }
    const STATUS_COLOR = { active:'var(--green)', pending:'var(--gold)', sold:'var(--muted)', expired:'var(--red)' };
    el.innerHTML =
      `<div class="myads-hd">📋 Displaying only your ads &nbsp;·&nbsp; ${listings.length} listing${listings.length!==1?'s':''}</div>` +
      listings.map(l=>{
        // Expiry is lazy (server hides active listings past expires_at from
        // browse), so an "active" listing past its date shows as Expired here.
        // Expiry switched off server-side (FB-06): no date, no label, no Renew.
        const expiryOn = !!RUNTIME_CFG?.listingExpiry;
        const days = expiryOn && l.expires_at ? Math.ceil((new Date(l.expires_at) - Date.now()) / 86400000) : null;
        const expired = l.status==='active' && days!==null && days <= 0;
        const canRenew = l.status==='active' && days!==null && days <= 5;
        const shownStatus = expired ? 'expired' : l.status;
        const review = reviewOutcome(l);
        const expiryHtml = (()=>{
          if(l.status==='pending') return `<div class="fav-dist" style="color:var(--muted);">${expiryOn ? 'Live for 30 days once approved' : 'Goes live once approved'}</div>`;
          if(l.status!=='active' || days===null) return '';
          if(expired) return `<div class="fav-dist" style="color:var(--red);">⚠️ Hidden from the map · Renew to show it again</div>`;
          if(days <= 5) return `<div class="fav-dist" style="color:var(--orange);">⚠️ Expires in ${days}d</div>`;
          return `<div class="fav-dist" style="color:var(--muted);">Expires in ${days}d</div>`;
        })();
        const ttlArg = jsArg(l.title);
        return `
        <div class="fav-card" onclick="selListing('${l.id}',true)">
          <div class="fav-thumb" style="background:linear-gradient(135deg,var(--card),var(--card2))">
            ${l.cover_photo?`<img src="${escHtml(l.cover_photo)}" alt="" loading="lazy" decoding="async"/>`:`<span>${listingEmoji(l)}</span>`}
          </div>
          <div class="fav-info">
            <div class="fav-ttl">${escHtml(l.title)}</div>
            <div class="fav-price">${priceText(l)}</div>
            ${review
              ? `<div class="fav-dist" style="color:${review.color};font-weight:600;">● ${review.label}</div>
                 ${review.reason ? `<div class="rev-reason${review.kind==='reject'?' no':''}">${escHtml(review.reason)}</div>` : ''}`
              : `<div class="fav-dist" style="color:${STATUS_COLOR[shownStatus]||'var(--muted)'};">● ${shownStatus.charAt(0).toUpperCase()+shownStatus.slice(1)}</div>`}
            ${expiryHtml}
          </div>
          <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end;flex-shrink:0;">
            ${canRenew?`<button class="renew-btn" onclick="event.stopPropagation();renewListing('${l.id}')">🔄 Renew</button>`:''}
            ${review
              ? `<button class="edit-btn resubmit" onclick="event.stopPropagation();editListing('${l.id}')">✏️ Edit &amp;<br>resubmit</button>`
              : `<button class="edit-btn" onclick="event.stopPropagation();editListing('${l.id}')">✏️ Edit</button>`}
            ${(l.status==='active'||l.status==='pending')?`<button class="sold-btn" onclick="event.stopPropagation();markAsSold('${l.id}',${ttlArg})">✅ Sold</button>`:''}
            <button class="del-btn" onclick="event.stopPropagation();deleteListing('${l.id}',${ttlArg})">🗑️ Del</button>
          </div>
        </div>`;
      }).join('');
  } catch(e){
    el.innerHTML = `<div class="sb-empty"><div class="sb-empty-ico">📋</div><div class="sb-empty-ttl">Could not load listings</div><div class="sb-empty-sub">${escHtml(e.message)}</div></div>`;
  }
}

async function viewFav(id){
  // Stay on fav tab — don't switch to browse
  const l = ST.favListings.find(x=>x.id===id);
  if(!l){
    try {
      const data = await apiGet(`/api/listings/${id}`);
      if(data.listing) ST.favListings = [{...data.listing, d:dist(activeLoc().lat,activeLoc().lng,data.listing.lat,data.listing.lng)}, ...ST.favListings];
    } catch(_){}
  }
  selListing(id, true); // keepTab=true — remain on fav tab
}

async function removeFav(id){
  await toggleFav(id);
  renderSidebar();
}

// ═══════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════
function renderCats(){
  document.getElementById('catRow').innerHTML = BROWSE_CHIPS.map(c=>`
    <div class="cat-btn ${ST.chip===c.id?'on':''}" onclick="setCat('${c.id}')" title="${c.lbl}">
      <span class="cat-ico">${c.ico}</span>
      <span class="cat-lbl">${c.lbl}</span>
    </div>`).join('');
  const cat = CATS.find(c=>c.id===ST.cat)||CATS[0];
  const sr = document.getElementById('subRow');
  if(cat.subs.length){
    sr.innerHTML = cat.subs.map(s=>`<span class="spill ${ST.sub===s?'on':''}" onclick="setSub('${s}')">${s}</span>`).join('');
    sr.style.display = 'flex';
  } else {
    sr.innerHTML=''; sr.style.display='none';
  }
}

// ═══════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════
function renderSidebar(){
  const el = document.getElementById('sb-content');
  if(ST.tab==='fav' && !ST.selId){ renderFavs(el); return; }
  if(ST.tab==='mine' && !ST.selId){ renderMyAds(el); return; }
  // In My Listings, navigation must stay within the current user's own listings —
  // never the browse set (which excludes them) — so other sellers' ads can't surface here.
  const fl = ST.tab==='mine' ? ST.myListings : ST.tab==='fav' ? ST.favListings : filtered();
  if(!ST.selId){
    if(ST.q && fl.length){
      el.innerHTML = `<div class="nearby-hd">🔍 ${fl.length} result${fl.length!==1?'s':''} for "${escHtml(ST.q)}"</div>`+fl.map(listingRow).join('');
    } else if(ST.q){
      el.innerHTML = `<div class="sb-empty"><div class="sb-empty-ico">🔍</div><div class="sb-empty-ttl">No results for "${escHtml(ST.q)}"</div><div class="sb-empty-sub">Try a different word or clear the search.</div></div>`;
    } else {
      el.innerHTML = `<div class="nearby-hd">📍 ${fl.length} listing${fl.length!==1?'s':''} within ${ST.rad>=WHOLE_CITY_KM?'Bangalore':ST.rad+' km'}</div>`+(fl.length?fl.map(listingRow).join(''):`<div class="sb-empty"><div class="sb-empty-ico">📍</div><div class="sb-empty-ttl">No listings nearby</div><div class="sb-empty-sub">Try increasing the radius or switching category.</div></div>`);
    }
    return;
  }
  const l = ST.listings.find(x=>x.id===ST.selId)||ST.favListings.find(x=>x.id===ST.selId)||fl.find(x=>x.id===ST.selId)||filtered().find(x=>x.id===ST.selId);
  if(!l) return;
  const loc = activeLoc();
  const d = l.d != null ? l.d : dist(loc.lat,loc.lng,l.lat,l.lng);
  const isSaved = ST.savedIds.has(l.id);
  const seller = l.seller||{};
  const idx = fl.findIndex(x=>x.id===l.id);
  const prev = idx>0 ? fl[idx-1].id : null;
  const next = idx<fl.length-1 ? fl[idx+1].id : null;
  const col = catCol(l.category||l.cat);

  const photoUrls = (l.photos||[]).map(p=>p.public_url||p.url).filter(Boolean);
  el.innerHTML = `
    <div class="ld-close-row">
      <div class="ld-back" role="button" tabindex="0" onclick="closeDetail()" onkeydown="if(event.key==='Enter')closeDetail()"><span style="font-size:20px;line-height:1;">‹</span> Back</div>
      <div class="ld-nav">
        ${prev?`<div class="ld-nav-btn" title="Previous listing" onclick="selListing('${prev}'${(ST.tab==='mine'||ST.tab==='fav')?',true':''})">‹</div>`:''}
        ${next?`<div class="ld-nav-btn" title="Next listing" onclick="selListing('${next}'${(ST.tab==='mine'||ST.tab==='fav')?',true':''})">›</div>`:''}
      </div>
    </div>
    <!-- Block A: distance bar + category icon + title/price + actions + photo strip -->
    <div class="ld-info-bar">
      <div class="ld-dist-bar">
        <div class="ld-dist-row"><span class="ld-dist-txt">📍 ${fmtD(d)} from ${ST.exploreMode ? 'the search point' : 'your location'}</span><button class="ld-map-btn" type="button" onclick="showListingOnMap('${l.id}')">🗺 Show on map</button></div>
        <span class="ld-dist-sub">${l.address ? escHtml(l.address)+' · ' : ''}🕒 ${timeAgo(l.created_at)}${l.reference_code ? ` · <span style="font-family:'JetBrains Mono',monospace;letter-spacing:.5px;">Ref: ${escHtml(l.reference_code)}</span>` : ''}${l.views_count!=null ? ` · 👁 ${l.views_count} view${l.views_count!==1?'s':''}` : ''}</span>
      </div>
      <div class="ld-info-top">
        <div class="ld-info-thumb"><span>${listingEmoji(l)}</span></div>
        <div class="ld-info-mid">
          <div class="ld-info-ttl">${escHtml(l.title)}</div>
          <div class="ld-info-price${fmtPrice(l.price).length>=6?' sm':''}">${l.price>0 ? fmtPrice(l.price)+(isRental(l)?'<span class="per-mo">/mo</span>':'') : '<span class="per-mo">Price on request</span>'}</div>
          ${/negotiable/i.test(l.price_label||'') ? '<div class="ld-info-neg">Negotiable</div>' : ''}
        </div>
      </div>
      <div class="ld-info-actions">
          ${ST.tab==='mine' && l.seller_id===ST.user?.id
            ? `<button class="ld-edit-btn" onclick="editListing('${l.id}')">✏️ Edit Listing</button>`
            : (()=>{
                const conv = ST.conversationsByListing.get(l.id);
                return conv
                  ? `<button class="ld-chat-btn" id="interestBtn" onclick="openChat('${conv.id}')">💬 Chat with seller</button>`
                  : `<button class="ld-chat-btn" id="interestBtn" onclick="openInterestNote()">🤝 I'm Interested</button>`;
              })()
              + `<div class="btn-icon ${isSaved?'saved':''}" id="favBtn" onclick="toggleFav('${l.id}')" title="${isSaved?'Remove from saved':'Save listing'}">${isSaved?'❤':'♡'}</div>`
              + `<div class="btn-icon" onclick="openReportModal('${l.id}')" title="Report this listing">🚩</div>`}
          <div class="btn-icon" onclick="shareListingUrl('${l.id}')" title="Copy link to share">🔗</div>
      </div>
      <div class="ld-interest-box hide" id="interestBox">
        <textarea id="interestNote" maxlength="500" oninput="updateInterestSendState()"></textarea>
        <div class="ld-interest-actions">
          <button class="ld-interest-cancel" onclick="cancelInterestNote()">Cancel</button>
          <button class="ld-interest-send" id="interestSendBtn" onclick="sendInterestNote('${l.id}')" disabled>Send</button>
        </div>
      </div>
      ${photoUrls.length?`<div class="ld-photo-strip"><span class="ld-photo-lbl">📷 Images</span>${photoUrls.map((u,i)=>`<div class="ld-photo-thumb" onclick="openPhotoGallery(${escHtml(JSON.stringify(photoUrls))},${i})"><img src="${escHtml(u)}" alt="photo ${i+1}" loading="lazy" decoding="async"/></div>`).join('')}</div>`:''}</div>
    <div class="ld-body">
      ${(()=>{
        const det = l.details || {};
        const subFields = (LISTING_FIELDS[l.category||l.cat]||{})[l.subcategory||l.sub] || [];
        const items = subFields.filter(f=>det[f.id]!=null && det[f.id]!=='');
        if(!items.length) return '';
        return `<div class="ld-specs-grid">${items.map(f=>`<div class="ld-spec-item"><div class="ld-spec-lbl">${f.label}</div><div class="ld-spec-val">${escHtml(f.id==='total_price' ? (fmtINRWords(det[f.id]) || det[f.id]) : f.type==='year' ? fmtDetailValue(f, det[f.id]) : det[f.id])}</div></div>`).join('')}</div>`;
      })()}
      ${(l.details?.transaction_type ? `<div class="ld-specs"><div class="ld-spec">${escHtml(l.details.transaction_type)}</div></div>` : '')}
      ${(()=>{
        const pois = l.details?.nearby_pois;
        if(!pois || !pois.length) return '';
        const poiIcon = {school:'🏫', mall:'🏬', supermarket:'🛒'};
        return `<div class="ld-nearby"><div class="ld-nearby-hd">📍 Nearby</div>${pois.map(p=>`<div class="ld-nearby-item">${poiIcon[p.type]||'📍'} ${escHtml(p.name)} ·${p.distance_m<1000?p.distance_m+'m':(p.distance_m/1000).toFixed(1)+'km'}</div>`).join('')}</div>`;
      })()}
      ${l.description ? `<div class="ld-desc">${escHtml(l.description)}</div>` : ''}
    </div>
    <div id="chatBox" class="${ST.chatOpen?'':'hide'}">
      <div class="ch-hd">
        <span class="ch-hd-name">${(()=>{
          const openConv = ST.chatOpen ? ST.allConversations.get(ST.chatConvId) : null;
          return escHtml(openConv?.other_user?.nickname || openConv?.other_user?.full_name || seller.full_name || 'Chat');
        })()}</span>
        <button class="ch-hd-safe" type="button" onclick="openSafetyModal()" title="Safety tips"><span>🛡</span>Safety tips</button>
        <div class="ch-hd-close" onclick="closeChat()">✕</div>
      </div>
      <div class="ch-safe">🔒 Keep chatting in MapIt. Never share OTPs or pay in advance.</div>
      <div class="cmsgs" id="cmsgs"></div>
      <div class="qmsgs" id="qmsgs"></div>
      <div class="cinput-row">
        <input class="cinput" id="cinput" placeholder="Type a message…"/>
        <button class="csend" onclick="sendMsg()">➤</button>
      </div>
    </div>`;

  if(ST.chatOpen) renderChatMsgs();
  setTimeout(()=>{
    const ci=document.getElementById('cinput');
    if(ci) ci.addEventListener('keydown',e=>{if(e.key==='Enter')sendMsg();});
  },50);

  // Append other listings below the detail card (not in My Listings context)
  if(ST.tab !== 'mine'){
    const others = fl.filter(x=>x.id!==ST.selId);
    if(others.length){
      const hd = ST.tab==='fav'
        ? `❤ Other saved listings (${others.length})`
        : ST.q ? `🔍 Other listings matching "${escHtml(ST.q)}" (${others.length})` : `📍 Other nearby listings (${others.length})`;
      el.innerHTML += `<div class="nearby-hd">${hd}</div>`+others.map(listingRow).join('');
    }
  }
}

// ═══════════════════════════════════════════════
// LISTING SELECTION
// ═══════════════════════════════════════════════
// Map view before a listing opened, restored by closeDetail() (final polish, Arun):
// opening a listing zooms in on it, and keyword results follow the visible map,
// so without this, Back left only that listing's neighbours in the results.
let _preDetailView = null;
// Phones in Map view hide the list pane (#main.view-map #sb), so details opened
// from a pin would render out of sight. selListing() switches to List and sets
// this, so closeDetail() can take the user back to the map.
let _detailFromMap = false;
async function selListing(id, keepTab=false){
  // Save only when coming from the results, not when hopping listing → listing,
  // or Back would return to the previous listing instead of the overview.
  if(!ST.selId && map) _preDetailView = { center: map.getCenter(), zoom: map.getZoom() };
  if(ST.viewMode==='map' && document.getElementById('sb').offsetParent === null){
    setViewMode('list', false);
    _detailFromMap = true;
  }
  expandSidebarForDetail();
  ST.selId=id; unsubscribeChatChannel(); ST.chatOpen=false; ST.chatMsgs=[]; ST.chatConvId=null;
  if(!keepTab){
    ST.tab='browse';
    document.getElementById('tab-browse').classList.add('on');
    document.getElementById('tab-fav').classList.remove('on');
    document.getElementById('tab-mine').classList.remove('on');
    document.querySelector('.rad-box').classList.remove('disabled');
  }
  const l = ST.listings.find(x=>x.id===id) || ST.favListings.find(x=>x.id===id) || (ST.tab==='mine' ? ST.myListings.find(x=>x.id===id) : null);
  if(l){
    const z = ST.tab==='mine'||ST.tab==='fav' ? 16 : Math.max(map.getZoom(),14);
    if(mapHidden()) map.setView([l.lat,l.lng], z, {animate:false});
    else map.flyTo([l.lat,l.lng], z, {animate:true,duration:.6});
  }
  Object.keys(mMarkers).forEach(k=>{
    const ml = ST.listings.find(x=>x.id===k) || ST.favListings.find(x=>x.id===k) || ST.myListings.find(x=>x.id===k) || {id:k,category:'all',price:0,price_label:''};
    mMarkers[k].setIcon(mkIcon(ml, k===id));
  });
  mStackMarkers.forEach(s=>s.marker.setIcon(mkStackIcon(s.group[0], s.group.length, s.ids.has(id))));
  renderSidebar();
  // Fetch full detail (includes photos[] array) then re-render
  try {
    const data = await apiGet(`/api/listings/${id}`);
    if(data.listing){
      // Merge into the array matching the current context — keeps the user's
      // own listings out of the browse array (and vice-versa) so neither leaks into the other.
      const target = ST.tab==='mine' ? ST.myListings : ST.tab==='fav' ? ST.favListings : ST.listings;
      const idx = target.findIndex(x=>x.id===id);
      if(idx>=0) target[idx] = {...target[idx], ...data.listing};
      else target.unshift(data.listing);
      if(ST.selId===id) renderSidebar();
    }
  } catch(_){}
  apiPost(`/api/listings/${id}/view`,{}).catch(()=>{});
}

function closeDetail(){
  if(ST.sharedListing && ST.selId===ST.sharedListing.id){
    // The shared listing was only on the map because of the link — back to normal results
    ST.listings = ST.listings.filter(x=>!x._sharedOnly);
    ST.sharedListing = null;
  }
  ST.selId=null; unsubscribeChatChannel(); ST.chatOpen=false; ST.chatConvId=null;
  drawMarkers(); renderSidebar();
  const backToMap = _detailFromMap; _detailFromMap = false;
  if(backToMap) setViewMode('map', false);
  if(_preDetailView){
    const v = _preDetailView; _preDetailView = null;
    _rerenderAfterMove();
    // Just un-hidden: Leaflet needs a moment to measure the map before setView
    if(backToMap) setTimeout(() => map.setView(v.center, v.zoom, {animate:false}), 80);
    else if(mapHidden()) map.setView(v.center, v.zoom, {animate:false});
    else map.flyTo(v.center, v.zoom, {duration:.6});
  }
  // If the panel only opened to show this listing, fold it back to the rail
  if(ST.sbAutoOpened){ ST.sbAutoOpened=false; setSidebarCollapsed(true, false); }
}

