// MapIt frontend: gallery.js. Split from MapIt_MVP_v1.html lines 5195-5504 on 2026-11-15. Load order is set in public/index.html. Functions are global on purpose (inline onclick=).
// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
// ═══════════════════════════════════════════════
// PHOTO GALLERY VIEWER
// ═══════════════════════════════════════════════
let _pgPhotos = [], _pgIdx = 0;
function openPhotoGallery(photos, idx){
  _pgPhotos = photos.filter(Boolean);
  if(!_pgPhotos.length) return;
  _pgIdx = idx || 0;
  document.getElementById('pgOverlay').classList.remove('hide');
  // Release 10A: the viewer gets its own browser-history entry (same URL), so the phone/browser
  // Back button closes the photo instead of leaving MapIt. Not pushed twice (e.g. after a reload).
  if(!history.state?.mapitPg) history.pushState({ mapitPg: true }, '');
  pgRender();
}
function pgRender(){
  document.getElementById('pgImg').src = _pgPhotos[_pgIdx];
  document.getElementById('pgCounter').textContent = `${_pgIdx+1} / ${_pgPhotos.length}`;
  document.getElementById('pgDots').innerHTML = _pgPhotos.map((_,i)=>
    `<div class="pg-dot${i===_pgIdx?' active':''}" onclick="pgGoto(${i})"></div>`).join('');
}
function pgNav(dir){
  _pgIdx = (_pgIdx + dir + _pgPhotos.length) % _pgPhotos.length;
  pgRender();
}
function pgGoto(i){ _pgIdx=i; pgRender(); }
function pgBgClick(e){ if(e.target===e.currentTarget) closePhotoGallery(); }
function hidePhotoGallery(){ document.getElementById('pgOverlay').classList.add('hide'); }
// ✕ / background tap: step back over the viewer's history entry; the popstate handler hides it.
function closePhotoGallery(){
  if(history.state?.mapitPg) history.back();
  else hidePhotoGallery();
}
window.addEventListener('popstate', () => {
  if(!history.state?.mapitPg) hidePhotoGallery();
});

function closeSplash(){
  // Mark welcomed per-user so the onboarding splash doesn't repeat on future logins
  if(ST.user?.id) localStorage.setItem(`mapit_welcomed_${ST.user.id}`, 'yes');
  document.getElementById('splashScreen').classList.add('hide');
  if(!ST.userPins.length) openPinsModal();
}

async function initApp(){
  // Show splash while loading
  const splash = document.getElementById('splashScreen');
  splash.classList.remove('hide');
  document.getElementById('splashMsg').textContent = 'Loading your map…';

  // Profile name + avatar initial — prefer nickname, then invite-code name, then full_name
  const createdFor  = ST.createdFor || localStorage.getItem('mapit_created_for') || '';
  const displayName = ST.profile?.nickname || createdFor || ST.profile?.full_name || ST.user?.email || '—';
  const initial     = getInitials(displayName);
  document.getElementById('uavInitial').textContent  = initial;
  document.getElementById('uavName').textContent     = displayName;
  // First name only for the always-visible header chip
  const firstName = displayName.split(' ')[0];
  document.getElementById('uavChipName').textContent = firstName !== '—' ? firstName : '';

  // Admin detection — cosmetic only (shows/hides the "Admin" menu link).
  // Matches CLAUDE.md Rule 9 (email-only, no invite codes). The real gate
  // is server-side: src/middleware/auth.js's requireAdmin, checked on
  // every admin route independently of anything computed here.
  const ADMIN_EMAILS = ['nagesh.aadi@gmail.com', 'arun.bn1@gmail.com'];
  const _email = (ST.user?.email || '').toLowerCase().trim();
  const isAdmin = ADMIN_EMAILS.includes(_email);
  document.getElementById('adminMenuItem').classList.toggle('hide', !isAdmin);
  document.getElementById('reviewMenuItem').classList.toggle('hide', !isAdmin);

  // Clear any stale pin state before loading fresh data for this user
  ST.userPins = []; ST.activePin = null;

  // Load user pins, set active location
  try {
    const data = await apiGet('/api/pins');
    ST.userPins = data.pins||[];
    const def = ST.userPins.find(p=>p.is_default)||ST.userPins[0];
    if(def){
      ST.activePin = def;
      document.getElementById('activePinLabel').textContent = def.label;
    }
  } catch(_){}

  // Apply the seller's saved map/list view preference (mobile-only single-pane
  // layout — desktop always shows both panes, so this is a no-op there). Not
  // persisted here since it's just applying an already-saved value.
  setViewMode(ST.profile?.default_view === 'list' ? 'list' : 'map', false);

  // Init map + listings
  renderCats();
  initMap();
  await loadListings();
  await loadSaved();
  loadMyAdsCount();
  checkShareUrl();
  checkMyListingsLink();
  // Load conversations — builds the unread badge count, the listing_id →
  // conversation map (buyer's own conversation per listing — drives the
  // "I'm Interested" vs "💬 Chat" button branch), and the full id →
  // conversation map (every conversation, buyer or seller side — used by
  // the inbox to open the right thread with the right "other party" name).
  apiGet('/api/conversations').then(d=>{
    const convs = d.conversations||[];
    ST.allConversations = new Map(convs.map(c=>[c.id, c]));
    // Only conversations where the current user is the buyer — a listing_id
    // can have multiple conversations (one per interested buyer), so this map
    // is only safe to key by listing_id from the buyer's own point of view.
    ST.conversationsByListing = new Map(
      convs.filter(c=>c.buyer_id===ST.user?.id).map(c=>[c.listing_id, c])
    );
    const unread = convs.reduce((n,c)=>n+(c.unread_count||0),0);
    // Also fold in unread admin feedback-reply count (see openInboxModal —
    // these live in messages_legacy, a separate table from real chat).
    apiGet('/api/messages/legacy/mine').then(td=>{
      const teamUnread = (td.messages||[]).filter(m=>!m.is_read).length;
      const badge = document.getElementById('inboxBadge');
      const total = unread + teamUnread;
      if(badge){
        if(total>0){ badge.textContent=total; badge.style.display='inline'; }
        else badge.style.display='none';
      }
    }).catch(()=>{
      const badge = document.getElementById('inboxBadge');
      if(badge){
        if(unread>0){ badge.textContent=unread; badge.style.display='inline'; }
        else badge.style.display='none';
      }
    });
  }).catch(()=>{});

  // Splash end logic — per-user flag so onboarding shows only at first-time registration
  const isFirstLogin = !localStorage.getItem(`mapit_welcomed_${ST.user?.id}`);
  if(isFirstLogin){
    // First ever login — show onboarding, auto-dismiss after 5s; tap to dismiss early
    document.getElementById('splashMsg').innerHTML = `
      <b style="color:var(--text);font-size:18px;">Welcome to MapIt!</b>
      <ul>
        <li>📍 Set your GPS location via <b>My Locations</b> in the profile menu</li>
        <li>🗺 Listings near you appear as pins on the map — tap any pin to view details</li>
        <li>🔍 Filter by category and distance using the left sidebar</li>
        <li>➕ Post your own listing via <b>Post a Listing</b> in the header</li>
        <li>❤ Save favourite listings with the heart icon</li>
      </ul>
      <div style="font-size:13px;color:var(--muted);margin-top:14px;">Tap anywhere to continue →</div>`;
    splash.onclick = ()=>{ localStorage.setItem(`mapit_welcomed_${ST.user?.id}`,'1'); splash.classList.add('hide'); splash.onclick=null; };
    setTimeout(()=>{ localStorage.setItem(`mapit_welcomed_${ST.user?.id}`,'1'); splash.classList.add('hide'); splash.onclick=null; }, 6000);
  } else {
    // Returning user — auto-dismiss
    setTimeout(()=>splash.classList.add('hide'), 800);
  }
}

async function init(){
  // Handle Google OAuth redirect callback (hash contains access_token)
  if(await handleOAuthCallback()) return;
  const sessions = getMultiSessions();
  if(Object.keys(sessions).length > 0){
    renderWhoamiScreen();
    document.getElementById('whoamiScreen').classList.remove('hide');
    document.getElementById('authModal').classList.add('hide');
    // Background-refresh any sessions that have stale/empty nicknames so the
    // display corrects itself without requiring the user to click through first.
    _refreshStaleSessionNames(sessions);
    return;
  }
  showAuthOrWelcome();
}

// ── Welcome page (2026-10-17) — shown to visitors with no saved account until
// they tick "Don't show this again". A shared #listing- link skips it. The
// choice lives in localStorage only; if storage is blocked the page just shows.
const WELCOME_HIDE_KEY = 'mapit_welcome_hide';
function setWelcomeHidden(on){
  try { on ? localStorage.setItem(WELCOME_HIDE_KEY, '1') : localStorage.removeItem(WELCOME_HIDE_KEY); } catch(_){}
}
function showAuthOrWelcome(){
  let skip = false;
  try {
    skip = localStorage.getItem(WELCOME_HIDE_KEY) === '1'
        || /^#listing-/.test(location.hash) || !!sessionStorage.getItem(SHARE_HASH_KEY)
        || !!sessionStorage.getItem(MINE_HASH_KEY);   // email link → straight to sign-in
  } catch(_){}
  if(skip){ openAuthSignIn(); return; }
  renderWelcomePins();
  document.getElementById('authModal').classList.add('hide');
  document.getElementById('welcomeScreen').classList.remove('hide');
}
function openAuthSignIn(){
  document.getElementById('authModal').classList.remove('hide');
  goToStep('step-auth');
}
function closeWelcome(){
  setWelcomeHidden(document.getElementById('wlNoShow').checked);
  document.getElementById('welcomeScreen').classList.add('hide');
  openAuthSignIn();
}
// Pins drop in around the card (left/top in % of the screen), staggered
// (kept clear of the centred card so no chip pokes out from under it)
const WL_PINS = [[8,18],[20,7],[12,44],[6,78],[18,95],[34,5],[66,5],[80,9],[92,24],[88,52],[94,80],[80,95],[60,99],[16,64],[84,68],[86,38],[5,31],[38,99]];
// Every pin is the MapIt logo with a category chip (same icons/labels as the
// browse chips; edge colour = the category's map colour). Chips live in their
// own layer so they sit above every pin.
const WL_PIN_CATS = [
  { ico:'🔑', lbl:'Rent Property', col:'#F06030' },
  { ico:'🚗', lbl:'Vehicles',      col:'#3B82F6' },
  { ico:'🏠', lbl:'Buy Property',  col:'#F06030' },
  { ico:'🏡', lbl:'Household',     col:'#22C55E' },
];
function renderWelcomePins(){
  const pins = document.getElementById('wlPins'), tags = document.getElementById('wlTags');
  if(!pins || !tags || pins.childElementCount) return;
  pins.innerHTML = WL_PINS.map(([x,y],i) =>
    `<img class="wl-pin" style="left:${x}%;top:${y}%;animation-delay:${(0.15+i*0.12).toFixed(2)}s" src="/mapit-logo.png" alt="">`).join('');
  tags.innerHTML = WL_PINS.map(([x,y],i) => {
    const c = WL_PIN_CATS[i%WL_PIN_CATS.length];
    // Chip goes on the side away from the centred card, unless that runs off the screen edge
    const side = x < 50 ? (x < 15 ? 'r' : 'l') : (x > 85 ? 'l' : 'r');
    return `<span class="wl-tagchip ${side}" style="left:${x}%;top:${y}%;border-left-color:${c.col};animation-delay:${(0.55+i*0.12).toFixed(2)}s">${c.ico} ${c.lbl}</span>`;
  }).join('');
  hideChipsUnderCard();
  window.addEventListener('resize', hideChipsUnderCard);
  document.getElementById('welcomeScreen').addEventListener('scroll', hideChipsUnderCard, { passive:true });
}
// Pin positions are % of the screen, the card is a fixed width — on narrower
// screens some chips would poke out from under the card, so hide those.
function hideChipsUnderCard(){
  const card = document.querySelector('#welcomeScreen .wl-card'); if(!card) return;
  const r = card.getBoundingClientRect();
  document.querySelectorAll('#wlTags .wl-tagchip').forEach(c => {
    const b = c.getBoundingClientRect();
    c.style.visibility = (b.right > r.left && b.left < r.right && b.bottom > r.top && b.top < r.bottom) ? 'hidden' : '';
  });
}

// Fetches /api/auth/me for every stored session that lacks a proper display name,
// updates the local cache, and re-renders the Who's using MapIt? list.
// Uses each session's own access_token directly so ST.session is never mutated.
async function _refreshStaleSessionNames(sessions){
  const stale = Object.entries(sessions).filter(([, u]) =>
    u.session?.access_token && (!u.nickname || u.nickname === 'MapIt User')
  );
  if(!stale.length) return;
  let anyUpdated = false;
  await Promise.allSettled(stale.map(async ([uid, stored]) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${stored.session.access_token}`, 'Content-Type': 'application/json' }
      });
      if(!res.ok) return;
      const data = await res.json();
      const nickname = data.profile?.nickname || data.profile?.full_name || '';
      if(nickname){
        saveToMultiSessions(uid, { nickname, initials: getInitials(nickname) });
        anyUpdated = true;
      }
    } catch(_){}
  }));
  if(anyUpdated) renderWhoamiScreen();
}

async function continueAs(userId){
  showLoadingSplash();
  document.getElementById('whoamiScreen').classList.add('hide');
  // Immediately hide admin items so they never bleed from a previous user's session
  document.getElementById('adminMenuItem').classList.add('hide');
  document.getElementById('reviewMenuItem').classList.add('hide');
  const stored = getMultiSessions()[userId];
  if(!stored?.session){
    document.getElementById('splashScreen').classList.add('hide');
    document.getElementById('authModal').classList.remove('hide');
    return;
  }
  try {
    ST.session = stored.session;
    // Pass stored invite code so backend can resolve created_for even if used_by isn't set
    const ic = encodeURIComponent(stored.invite_code || '');
    const data = await apiGet(`/api/auth/me${ic ? '?invite_code=' + ic : ''}`);
    ST.user       = data.user;
    ST.profile    = data.profile;
    // Prefer created_for (invite-code name) over stored profile name
    const resolvedName = data.created_for || stored.created_for || stored.name || '';
    ST.createdFor = resolvedName;
    ST.inviteCode = data.invite_code || stored.invite_code || '';
    // Always write both so initApp admin-check picks them up reliably
    if(resolvedName) localStorage.setItem('mapit_created_for', resolvedName);
    if(ST.inviteCode) localStorage.setItem('mapit_invite', ST.inviteCode);
    // Refresh stored session with better name/code so WhoAmI shows correctly next time
    saveToMultiSessions(userId, {
      created_for:  data.created_for  || stored.created_for,
      name:         resolvedName      || stored.name,
      // Fall back to full_name so existing accounts without a nickname set still display a real name
      nickname:     data.profile?.nickname || data.profile?.full_name || stored.nickname || '',
      initials:     resolvedName ? getInitials(resolvedName) : stored.initials,
      invite_code:  ST.inviteCode     || stored.invite_code,
    });
    document.getElementById('authModal').classList.add('hide');
    await initApp();
  } catch(_){
    document.getElementById('splashScreen').classList.add('hide');
    toast(`Session for ${stored.name||'this user'} expired — please log in again.`);
    // Pre-fill email so the user can sign in immediately
    const kEmail = stored.email || '';
    if(kEmail){
      document.getElementById('authEmail').value = kEmail;
      document.getElementById('emailInput').value = kEmail;
    }
    document.getElementById('authModal').classList.remove('hide');
    goToStep('step-auth');
  }
}

function signInAsSomeoneElse(){
  document.getElementById('whoamiScreen').classList.add('hide');
  ST.session = null; ST.user = null; ST.profile = null;
  ST.inviteCode = ''; ST.createdFor = ''; ST.authProvider = null;
  ST.userPins = []; ST.activePin = null;
  document.getElementById('authModal').classList.remove('hide');
  goToStep('step-auth');
}

