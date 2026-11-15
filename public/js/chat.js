// MapIt frontend: chat.js. Split from MapIt_MVP_v1.html lines 3808-4047 on 2026-11-15. Load order is set in public/index.html. Functions are global on purpose (inline onclick=).
// ═══════════════════════════════════════════════
// CHAT — real, backed by conversations/chat_messages + Supabase Realtime
// ═══════════════════════════════════════════════

// First contact still goes through the note box (buyer/seller are rarely
// online at the same time — the note + seller-notification email is the
// reliable channel; once it's sent, the real chat thread is unlocked).
function openInterestNote(){
  const l = ST.listings.find(x=>x.id===ST.selId) || ST.favListings.find(x=>x.id===ST.selId) || ST.myListings.find(x=>x.id===ST.selId);
  if(!l){ toast('Listing not found.'); return; }
  if(!ST.user){ toast('Please sign in first.'); return; }
  if(!l.seller_id){ toast('Seller information not available.'); return; }
  const box = document.getElementById('interestBox');
  const ta  = document.getElementById('interestNote');
  if(!box || !ta) return;
  ta.value = '';
  ta.placeholder = `Hi! I'm interested in your listing "${l.title}". Please get in touch.`;
  box.classList.remove('hide');
  updateInterestSendState();
  ta.focus();
}

function cancelInterestNote(){
  const box = document.getElementById('interestBox');
  if(box) box.classList.add('hide');
}

function updateInterestSendState(){
  const ta  = document.getElementById('interestNote');
  const btn = document.getElementById('interestSendBtn');
  if(btn) btn.disabled = !(ta && ta.value.trim().length>0);
}

async function sendInterestNote(listingId){
  const l = ST.listings.find(x=>x.id===listingId) || ST.favListings.find(x=>x.id===listingId) || ST.myListings.find(x=>x.id===listingId);
  if(!l){ toast('Listing not found.'); return; }
  const ta = document.getElementById('interestNote');
  const text = (ta?.value||'').trim();
  if(!text){ toast('Please write a note before sending.'); return; }
  const sendBtn = document.getElementById('interestSendBtn');
  if(sendBtn){ sendBtn.disabled=true; sendBtn.textContent='Sending…'; }
  try {
    const { conversation } = await apiPost('/api/conversations', { listing_id: l.id });
    await apiPost(`/api/conversations/${conversation.id}/messages`, { content: text });
    // Fill in enough to render the chat header/button immediately — the next
    // /api/conversations refresh (on next app load) fills in the rest (nickname etc).
    conversation.other_user = conversation.other_user || { id: l.seller_id, full_name: l.seller?.full_name };
    ST.conversationsByListing.set(l.id, conversation);
    ST.allConversations.set(conversation.id, conversation);
    document.getElementById('interestBox')?.classList.add('hide');
    toast(`✅ Message sent to seller — they'll see it in their Inbox.`);
    openChat(conversation.id);
  } catch(e){
    if(sendBtn){ sendBtn.disabled=false; sendBtn.textContent='Send'; }
    toast('Could not send: '+(e.message||'Unknown error'));
  }
}

// ── Open a real conversation thread ─────────────────────────────
async function openChat(conversationId){
  if(!ST.user){ toast('Please sign in first.'); return; }
  unsubscribeChatChannel();
  ST.chatConvId = conversationId;
  ST.chatOpen = true;
  ST.chatMsgs = [];
  renderSidebar();
  try {
    const data = await apiGet(`/api/conversations/${conversationId}/messages`);
    ST.chatMsgs = (data.messages||[]).map(m=>({
      type: m.sender_id===ST.user.id ? 'sent' : 'recv',
      text: m.content,
      t: fmtMsgTime(m.sent_at),
    }));
    renderChatMsgs(); scrollChat(); showQM();
  } catch(e){
    toast('Could not load chat: '+(e.message||'Unknown error'));
  }
  subscribeChatChannel(conversationId);
}

function closeChat(){
  unsubscribeChatChannel();
  ST.chatOpen=false; ST.chatConvId=null;
  const cb=document.getElementById('chatBox'); if(cb) cb.classList.add('hide');
}

// ── Realtime — receive-only. All writes go through the backend REST routes above. ──
async function subscribeChatChannel(conversationId){
  const client = await getSbClient();
  if(ST.session?.access_token) client.realtime.setAuth(ST.session.access_token);
  const channel = client.channel(`chat-${conversationId}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'chat_messages',
      filter: `conversation_id=eq.${conversationId}`,
    }, payload => {
      const m = payload.new;
      // Own messages are already appended optimistically by sendMsg() — avoid a duplicate bubble.
      if(!m || m.sender_id === ST.user?.id) return;
      addMsg('recv', m.content, m.sent_at);
    })
    .subscribe();
  ST.chatChannel = channel;
}

function unsubscribeChatChannel(){
  if(ST.chatChannel && sbClient) sbClient.removeChannel(ST.chatChannel);
  ST.chatChannel = null;
}

function fmtMsgTime(iso){
  return new Date(iso||Date.now()).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
}

function addMsg(type,text,sentAtIso){
  ST.chatMsgs.push({type,text,t:fmtMsgTime(sentAtIso)});
  renderChatMsgs(); scrollChat();
}

// Chat safety nudge (2026-10-17): a plain keyword check in the browser — the
// message text goes nowhere and is never blocked or changed, only annotated.
// 'pay' wins over 'contact' (an OTP/advance request is the bigger risk).
const CHAT_RISK_PAY = /\botp\b|upi\s*pin|\badvance\b|token\s*(amount|money)|\bqr\b|scan\s*(the|this)?\s*code|gift\s*card|\b[\w.\-]{2,}@(ok\w+|ybl|ibl|axl|paytm|upi|apl|yapl|fbl|jupiteraxis)\b/i;
const CHAT_RISK_CONTACT = /(?:\+?\d[\s\-.]?){10,}|[\w.+\-]+@[\w\-]+\.\w{2,}|https?:\/\/|www\.|\b(wa\.me|t\.me|bit\.ly|tinyurl\.com|chat\.whatsapp\.com)\b|whats\s*app|telegram|\bsignal\b/i;
function chatRisk(text){
  const t = String(text||'');
  if(CHAT_RISK_PAY.test(t)) return 'pay';
  if(CHAT_RISK_CONTACT.test(t)) return 'contact';
  return null;
}
function chatRiskNote(type, text){
  const risk = chatRisk(text); if(!risk) return '';
  const msg = type==='sent'
    ? (risk==='pay' ? '🔒 Never share an OTP or UPI PIN — MapIt and genuine buyers/sellers never need them.'
                    : '🔒 Your contact details are now visible to this person. MapIt chat keeps them private.')
    : (risk==='pay' ? '⚠️ Never share an OTP or UPI PIN, and never pay before seeing the item.'
                    : '⚠️ Has contact details or a link. Scammers move chats off MapIt — keep chatting here.');
  return `<div class="bwarn ${type==='sent'?'r':''}">${msg} <a onclick="openSafetyModal()" style="cursor:pointer;text-decoration:underline;">Tips</a></div>`;
}

function renderChatMsgs(){
  const el=document.getElementById('cmsgs'); if(!el) return;
  el.innerHTML=ST.chatMsgs.map(m=>`
    <div>
      <div class="bubble ${m.type==='sent'?'bsent':'brecv'}">${escHtml(m.text)}</div>
      ${chatRiskNote(m.type, m.text)}
      <div class="btime ${m.type==='sent'?'r':''}">${m.t}</div>
    </div>`).join('');
}

function scrollChat(){ const el=document.getElementById('cmsgs');if(el)el.scrollTop=el.scrollHeight; }
function showQM(){
  const el=document.getElementById('qmsgs'); if(!el) return;
  const conv=ST.allConversations.get(ST.chatConvId);
  const isSeller=conv && conv.buyer_id!==ST.user?.id;
  const qs=isSeller
    ? ['Yes, still available','Price is negotiable','Yes, you can visit today','No defects, great condition']
    : ['Is this still available?','Best price?','Can I visit today?','Any defects?'];
  el.innerHTML=qs.map(q=>`<span class="qm" onclick="sendQM('${q.replace(/'/g,"\\'")}')"> ${q}</span>`).join('');
}
function sendQM(t){ const ci=document.getElementById('cinput'); if(ci)ci.value=t; sendMsg(); }
async function sendMsg(){
  const inp=document.getElementById('cinput'); if(!inp)return;
  const txt=inp.value.trim(); if(!txt||!ST.chatConvId)return;
  inp.value='';
  const el=document.getElementById('qmsgs'); if(el)el.innerHTML='';
  addMsg('sent',txt);
  try {
    await apiPost(`/api/conversations/${ST.chatConvId}/messages`, { content: txt });
  } catch(e){
    toast('Could not send: '+(e.message||'Unknown error'));
  }
}

// ═══════════════════════════════════════════════
// SHARE URL
// ═══════════════════════════════════════════════
function shareListingUrl(id){
  const url=`${location.origin}${location.pathname}#listing-${id}`;
  if(navigator.clipboard){
    navigator.clipboard.writeText(url).then(()=>toast('🔗 Link copied! Share via WhatsApp.'));
  } else {
    const ta=document.createElement('textarea');ta.value=url;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.focus();ta.select();document.execCommand('copy');document.body.removeChild(ta);
    toast('🔗 Link copied! Share via WhatsApp.');
  }
}

// Session 9J — a shared link (#listing-<id>) opens that listing with its pin,
// even when it is outside the viewer's radius (pins are otherwise drawn only for
// listings inside it). The hash is saved at page load, so it survives signing in
// or signing up first — Google's redirect replaces the hash.
const SHARE_HASH_KEY = 'mapit_shared_listing';
try { if(/^#listing-/.test(location.hash)) sessionStorage.setItem(SHARE_HASH_KEY, location.hash); } catch(_){}
// Session 9L — seller emails (Needs change / Not approved) link to
// #my-listings. Saved at load the same way, so it survives signing in first.
const MINE_HASH_KEY = 'mapit_open_my_listings';
try { if(location.hash === '#my-listings') sessionStorage.setItem(MINE_HASH_KEY, '1'); } catch(_){}
function checkMyListingsLink(){
  let open = false;
  try { open = sessionStorage.getItem(MINE_HASH_KEY) === '1'; sessionStorage.removeItem(MINE_HASH_KEY); } catch(_){}
  if(!open) return;
  if(location.hash === '#my-listings') history.replaceState(null, '', location.pathname);   // not again on reload
  setViewMode('list', false);   // phones: show the list pane
  switchTab('mine');
  try { expandFromRail(); } catch(_){}
}
async function checkShareUrl(){
  let hash = location.hash;
  try { hash = /^#listing-/.test(hash) ? hash : (sessionStorage.getItem(SHARE_HASH_KEY) || ''); sessionStorage.removeItem(SHARE_HASH_KEY); } catch(_){}
  const m = hash.match(/^#listing-([0-9a-f-]{36})$/i);
  if(!m) return;
  history.replaceState(null, '', location.pathname);   // don't reopen it on every reload
  const id = m[1];
  let l = ST.listings.find(x=>x.id===id);
  if(!l){ try { l = (await apiGet(`/api/listings/${id}`)).listing; } catch(_){} }
  if(!l){ toast('This shared listing is no longer available.'); return; }
  ST.sharedListing = l;
  _keepSharedListing();
  setViewMode('list', false);          // phones: details first, "Show on map" is one tap away
  await selListing(id);
  map.setView([l.lat, l.lng], 16, { animate:false });
  drawMarkers();
  toast(`📍 Opened shared listing: ${l.title}`);
}
// Keeps the shared listing in ST.listings (so its pin, details, interest note and
// report all work) until its details are closed. _sharedOnly marks one that is
// outside the current search, so closeDetail() can take it out again.
function _keepSharedListing(){
  const sh = ST.sharedListing;
  if(!sh || ST.listings.some(x=>x.id===sh.id)) return;
  const loc = activeLoc();
  ST.listings = [...ST.listings, { ...sh, d: dist(loc.lat, loc.lng, sh.lat, sh.lng), _sharedOnly: true }];
}
// Phones: from a listing's details, switch to the map centred on its pin
function showListingOnMap(id){
  const l = ST.listings.find(x=>x.id===id) || ST.favListings.find(x=>x.id===id) || ST.myListings.find(x=>x.id===id);
  if(!l) return;
  setViewMode('map', false);
  setTimeout(() => { map.setView([l.lat, l.lng], 16, { animate:false }); drawMarkers(); }, 80);
}

