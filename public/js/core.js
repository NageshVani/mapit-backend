// MapIt frontend: core.js. Split from MapIt_MVP_v1.html lines 1957-2157 on 2026-11-15. Load order is set in public/index.html. Functions are global on purpose (inline onclick=).
// ═══════════════════════════════════════════════
// MULTI-SESSION (shared device — family switch)
// ═══════════════════════════════════════════════
function getMultiSessions(){
  try { return JSON.parse(localStorage.getItem('mapit_sessions') || '{}'); } catch(_){ return {}; }
}
function saveToMultiSessions(userId, patch){
  const all = getMultiSessions();
  all[userId] = { ...(all[userId]||{}), ...patch, last_login: new Date().toISOString() };
  localStorage.setItem('mapit_sessions', JSON.stringify(all));
}
function renderWhoamiScreen(){
  const all = getMultiSessions();
  const entries = Object.entries(all).sort((a,b)=>new Date(b[1].last_login||0)-new Date(a[1].last_login||0));
  const list = document.getElementById('whoamiUserList');
  list.innerHTML = entries.map(([uid, u])=>{
    const rawName = u.nickname || u.created_for || u.name || 'Family Member';
    const displayInit = escHtml(rawName !== 'Family Member' ? getInitials(rawName) : (u.initials || '?'));
    const displayName = escHtml(rawName);
    uid = escHtml(uid); u = { ...u, invite_code: escHtml(u.invite_code) };
    return `
    <div style="position:relative;">
      <button class="whoami-yes" onclick="continueAs('${uid}')" title="${displayName}"
        style="display:flex;align-items:center;gap:10px;text-align:left;padding:10px 12px;border-radius:10px;min-width:0;width:100%;box-sizing:border-box;">
        <div style="width:36px;height:36px;border-radius:50%;background:var(--orange);display:flex;align-items:center;
          justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0;letter-spacing:.5px;">
          ${displayInit}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${displayName}</div>
          <div style="font-size:11px;opacity:.55;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${u.invite_code||''}</div>
        </div>
      </button>
      <span class="whoami-remove" onclick="removeMultiSession('${uid}', event)" title="Remove ${displayName} from this device">✕</span>
    </div>`;
  }).join('');
}

function removeMultiSession(userId, ev){
  ev.stopPropagation();
  const all = getMultiSessions();
  delete all[userId];
  localStorage.setItem('mapit_sessions', JSON.stringify(all));
  if(Object.keys(all).length === 0){
    document.getElementById('whoamiScreen').classList.add('hide');
    showAuthOrWelcome();
    return;
  }
  renderWhoamiScreen();
}

function listingRow(l){
  const loc = activeLoc();
  const d   = l.d != null ? l.d : dist(loc.lat,loc.lng,l.lat,l.lng);
  const sel = l.id === ST.selId;
  return `<div class="lr-row ${sel?'sel':''}" onclick="selListing('${l.id}', ST.tab==='fav'||ST.tab==='mine')">
    <div class="lr-ico">${l.cover_photo?`<img src="${escHtml(l.cover_photo)}" alt="" loading="lazy" decoding="async"/>`:`<span>${listingEmoji(l)}</span>`}</div>
    <div class="lr-info">
      <div class="lr-title">${escHtml(l.title)}</div>
      <div class="lr-price">${priceText(l)}</div>
      <div class="lr-meta">📍 ${fmtD(d)} · ${escHtml(l.subcategory)} · ${timeAgo(l.created_at)}</div>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════
const DEFAULT_LOC = { lat:12.9352, lng:77.6245, label:'Koramangala' };
// "Whole city" radius (Feedback Release 3, 2026-10-29): replaces "Region 50 km" +
// an unlimited "Whole city". 65 km from anywhere in the city reaches the growth
// belts on the far side (Devanahalli, Hoskote, Kanakapura Rd, Hosur). No circle drawn.
const WHOLE_CITY_KM = 65;
let ST = {
  cat:'all', chip:'all', txn:null, sub:null, rad:5, q:'', exploreMode:false, viewMode:'map',
  selId:null, tab:'browse', editingId:null, sharedListing:null,
  chatOpen:false, chatMsgs:[], chatConvId:null, chatChannel:null,
  conversationsByListing: new Map(), // listing_id -> conversation, buyer's own conversations only
  allConversations: new Map(),       // conversation_id -> conversation, every conversation (buyer or seller side)
  listings:[],          // from API (browse — excludes the current user's own listings)
  myListings:[],        // from /api/listings/mine/all — only the current user's own listings
  favListings:[],       // from /api/listings/saved/all — saved listings with lat/lng for map display
  savedIds: new Set(),  // listing IDs saved by user
  userPins: [],         // from API
  activePin: null,      // { lat, lng, label }
  user: null,           // Supabase user object
  profile: null,        // profile row
  session: null,        // session object
  inviteCode: null,
  authProvider: null,
  loadingListings: false,
};

// ═══════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════
function dist(a,b,c,d){
  const R=6371,dLat=(c-a)*Math.PI/180,dLng=(d-b)*Math.PI/180;
  const x=Math.sin(dLat/2)**2+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}
function fmtD(km){return km<1?`${Math.round(km*1000)} m`:`${km.toFixed(1)} km`;}
function timeAgo(dateStr){
  if(!dateStr) return '';
  const mins = (Date.now() - new Date(dateStr).getTime())/60000;
  if(mins < 1) return 'just now';
  const round1 = n => { const r = Math.round(n*2)/2; return r%1===0 ? r.toFixed(0) : r.toFixed(1); };
  if(mins < 60)  return `${Math.round(mins)}m ago`;
  if(mins < 1440) return `${round1(mins/60)}hr ago`;
  return `${round1(mins/1440)}d ago`;
}
function catCol(c){return (CATS.find(x=>x.id===c)||CATS[0]).col;}
function catLbl(c){return (CATS.find(x=>x.id===c)||CATS[0]).lbl;}
function nowStr(){return new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});}
// Session 9J — full Indian words for amounts: ₹28 Lakh, ₹1.25 Crore; below
// 1 lakh Indian commas (₹28,000). Used where the full figure is shown.
function fmtINRWords(v){
  const n = Number(v);
  if(!isFinite(n) || n <= 0) return '';
  const trim = x => String(+x.toFixed(2));
  if(n >= 1e7) return `₹${trim(n / 1e7)} Crore`;
  if(n >= 1e5){ const l = trim(n / 1e5); return l === '100' ? '₹1 Crore' : `₹${l} Lakh`; }
  return '₹' + n.toLocaleString('en-IN');
}
function fmtPrice(p){
  if(p>=10000000) return `₹${(p/10000000).toFixed(2)}Cr`;
  if(p>=100000)   return `₹${(p/100000).toFixed(1)}L`;
  if(p>=1000)     return `₹${(p/1000).toFixed(0)}K`;
  return `₹${p}`;
}
// Session 9G — rentals are Real Estate listings tagged 'Rent' in the post form.
// Legacy/seed rows predate that field, so a 'per month' price label also counts.
function isRental(l){
  return l.category==='re' &&
    (l.details?.transaction_type==='Rent' || /per\s*month|\/\s*month|monthly/i.test(l.price_label||''));
}
// Session 9G — one price string for pins, cards and detail. Always the real
// number (never free text like 'negotiable'), with /mo for rentals.
function priceText(l){
  if(!(l.price>0)) return 'Price on request';
  return fmtPrice(l.price) + (isRental(l) ? '/mo' : '');
}
function activeLoc(){
  if(ST.exploreMode && map){
    const c = map.getCenter();
    return { lat: c.lat, lng: c.lng };
  }
  return ST.activePin
    ? { lat: ST.activePin.lat, lng: ST.activePin.lng }
    : { lat: DEFAULT_LOC.lat, lng: DEFAULT_LOC.lng };
}

// ═══════════════════════════════════════════════
// API SERVICE
// ═══════════════════════════════════════════════
async function api(path, options = {}){
  const token = ST.session?.access_token;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if(token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if(res.status === 403 && data.suspended){
    // A suspended user can hit this from any random action — force a clean
    // sign-out with one clear message instead of letting scattered generic
    // "Error: ..." toasts fire across whatever they happen to click next.
    forceSuspendedSignOut();
    throw new Error(data.error || 'Your account has been suspended.');
  }
  if(!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

let _suspendedSignoutInProgress = false;
function forceSuspendedSignOut(){
  if(_suspendedSignoutInProgress) return;
  _suspendedSignoutInProgress = true;
  try { apiPost('/api/auth/logout', {}).catch(()=>{}); } catch(_){}
  localStorage.removeItem('mapit_invite');
  localStorage.removeItem('mapit_created_for');
  ST.session = null; ST.user = null; ST.profile = null;
  ST.inviteCode = ''; ST.createdFor = ''; ST.authProvider = null;
  ST.userPins = []; ST.activePin = null;
  ST.listings = []; ST.savedIds = new Set();
  toast('⛔ Your account has been suspended. Contact support if you believe this is a mistake.');
  setTimeout(()=>location.reload(), 2200);
}

async function apiGet(path){ return api(path); }

async function apiPost(path, body){
  return api(path, { method:'POST', body: JSON.stringify(body) });
}

async function apiPut(path, body){
  return api(path, { method:'PUT', body: JSON.stringify(body) });
}

async function apiDelete(path){
  return api(path, { method:'DELETE' });
}

