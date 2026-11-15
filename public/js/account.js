// MapIt frontend: account.js. Split from MapIt_MVP_v1.html lines 5505-5849 on 2026-11-15. Load order is set in public/index.html. Functions are global on purpose (inline onclick=).
// ═══════════════════════════════════════════════
// MARK AS SOLD
// ═══════════════════════════════════════════════
async function markAsSold(id, title){
  if(!(await mapitDialog({
    title: 'Mark as sold?',
    message: `"${title}" will be removed from the public map.`,
    okText: 'Mark as Sold',
  }))) return;
  try {
    await apiPut(`/api/listings/${id}/sold`, {});
    toast('✅ Listing marked as sold and removed from the map.');
    renderMyAds(document.getElementById('sb-content'));
  } catch(e){ toast('Error: '+e.message); }
}

async function renewListing(id){
  if(!(await mapitDialog({
    title: 'Renew listing?',
    message: 'Your listing will stay on the map for 30 more days from today.',
    okText: 'Renew',
  }))) return;
  try {
    await apiPut(`/api/listings/${id}/renew`, {});
    toast('🔄 Listing renewed for 30 days.');
    renderMyAds(document.getElementById('sb-content'));
  } catch(e){ toast('Error: '+e.message); }
}

async function deleteListing(id, title){
  if(!(await mapitDialog({
    title: 'Delete listing?',
    message: `"${title}" will be deleted. This cannot be undone.`,
    okText: 'Delete',
    danger: true,
  }))) return;
  try {
    await apiDelete(`/api/listings/${id}`);
    toast('🗑️ Listing deleted.');
    ST.myListings = ST.myListings.filter(l=>l.id!==id);
    if(ST.selId===id) ST.selId=null;
    renderMyAds(document.getElementById('sb-content'));
  } catch(e){ toast('Error: '+e.message); }
}

// ═══════════════════════════════════════════════
// FEEDBACK
// ═══════════════════════════════════════════════
let _fbType = 'suggestion';
let _fbRating = 0; // 0 = no rating chosen — optional field, never required to submit

function openFeedbackModal(){
  document.getElementById('uavMenu').classList.remove('open');
  document.getElementById('feedbackModal').classList.remove('hide');
  document.getElementById('fbText').value = '';
  updateFbChar();
  setFbRating(0);
}
function closeFeedbackModal(){ document.getElementById('feedbackModal').classList.add('hide'); }

function openHelpModal(){
  document.getElementById('uavMenu').classList.remove('open');
  document.getElementById('helpModal').classList.remove('hide');
}
function closeHelpModal(){ document.getElementById('helpModal').classList.add('hide'); }
function openSafetyModal(){ document.getElementById('safetyModal').classList.remove('hide'); }
function closeSafetyModal(){ document.getElementById('safetyModal').classList.add('hide'); }

// ── View Profile (Session 9C) ──
// Read-only. Every value goes in via textContent, never innerHTML — name,
// nickname and address are user-typed (see the T-014 / T-045 XSS notes).
async function openProfileModal(){
  document.getElementById('uavMenu').classList.remove('open');
  _renderProfile();
  document.getElementById('profileModal').classList.remove('hide');
  // Show the cached profile at once, then refresh — phone_verified may have
  // changed in another tab or on another device.
  try {
    const data = await apiGet('/api/auth/me');
    if(data.profile){ ST.profile = data.profile; ST.user = data.user || ST.user; _renderProfile(); }
  } catch(_){}
}
function closeProfileModal(){ document.getElementById('profileModal').classList.add('hide'); }

function _renderProfile(){
  const p = ST.profile || {}, u = ST.user || {};
  const set = (id, txt) => { document.getElementById(id).textContent = txt; };
  const name = p.full_name || p.nickname || u.email || '—';
  const av = document.getElementById('profAvatar');
  av.textContent = getInitials(p.nickname || name);
  av.style.background = p.avatar_color || '';
  set('profName', name);
  set('profNick', p.nickname && p.nickname !== name ? `“${p.nickname}”` : '');

  const email = document.getElementById('profEmail');
  email.textContent = u.email || '—';
  if(u.email && u.email_confirmed_at){
    const ok = document.createElement('span');
    ok.className = 'prof-ok'; ok.textContent = ' ✓ Verified';
    email.appendChild(ok);
  }

  // Phone: masked like the server's maskPhone() — never show the full number.
  const phone = document.getElementById('profPhone');
  phone.textContent = '';
  const digits = String(p.phone || '').replace(/\D/g, '');
  if(digits.length >= 4) phone.appendChild(document.createTextNode(`+91 ••••••${digits.slice(-4)} `));
  if(p.phone_verified){
    const ok = document.createElement('span');
    ok.className = 'prof-ok'; ok.textContent = '✓ Verified';
    phone.appendChild(ok);
  } else {
    const warn = document.createElement('span');
    warn.className = 'prof-warn'; warn.textContent = digits.length >= 4 ? 'Not verified · ' : 'Not added · ';
    const link = document.createElement('span');
    link.className = 'prof-link'; link.textContent = 'Verify now →';
    link.onclick = () => { closeProfileModal(); openPhoneVerify('profile'); };
    phone.append(warn, link);
  }

  const provider = p.auth_provider || u.app_metadata?.provider || 'email';
  set('profMethod', provider === 'google' ? 'Google' : 'Email');
  const since = p.created_at || u.created_at;
  set('profSince', since ? new Date(since).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : '—');
  // The active My Location is what the app searches from (user_pins); the
  // one-time sign-up home (profiles.home_*) is only a fallback. Showing just
  // the latter said "Not set" for anyone who used My Locations (Arun, 2026-10-24).
  const home = document.getElementById('profHome');
  home.textContent = '';
  const pins = ST.userPins || [];
  const signupHome = p.home_address
    || (p.home_lat != null && p.home_lng != null ? `${Number(p.home_lat).toFixed(4)}, ${Number(p.home_lng).toFixed(4)}` : '');
  const locName = ST.activePin?.label || signupHome;
  const txt = locName
    ? locName + (pins.length > 1 ? ` · ${pins.length} saved ` : ' ')
    : 'Not set · ';
  home.appendChild(document.createTextNode(txt));
  const link = document.createElement('span');
  link.className = 'prof-link'; link.textContent = locName ? 'Change →' : 'Add →';
  link.onclick = () => { closeProfileModal(); openPinsModal(); };
  home.appendChild(link);
}

function setFbType(el){
  _fbType = el.dataset.t;
  document.querySelectorAll('.fb-type').forEach(e=>e.classList.toggle('on', e===el));
}
function updateFbChar(){
  const len = document.getElementById('fbText').value.length;
  document.getElementById('fbCharCount').textContent = len;
}

function setFbRating(r){
  _fbRating = r;
  document.querySelectorAll('.fb-star').forEach(e=>e.classList.toggle('on', +e.dataset.r <= r));
  document.getElementById('fbStarClear').classList.toggle('hide', r===0);
}

async function submitFeedback(){
  const description = document.getElementById('fbText').value.trim();
  if(description.length < 10){ toast('Please write at least 10 characters.'); return; }
  const btn = document.querySelector('#feedbackModal .modal-btn');
  if(btn){ btn.disabled=true; btn.innerHTML='<div class="loading-spin" style="width:18px;height:18px;border-width:2px;"></div>'; }
  try {
    await apiPost('/api/users/feedback/submit', { type: _fbType, description, rating: _fbRating || null });
    closeFeedbackModal();
    toast('✅ Thank you! Your feedback has been received.');
  } catch(e){
    toast('Could not send feedback: '+e.message);
    if(btn){ btn.disabled=false; btn.textContent='Send Feedback'; }
  }
}

// ═══════════════════════════════════════════════
// REPORT LISTING
// ═══════════════════════════════════════════════
const REPORT_REASONS = [
  { id:'fake',        label:'Fake' },
  { id:'wrong_price',  label:'Wrong price' },
  { id:'spam',         label:'Spam' },
  { id:'offensive',    label:'Offensive' },
  { id:'other',        label:'Other' },
];
let _reportListingId = null;
let _reportReason = null;

function openReportModal(listingId){
  if(!ST.user){ toast('Please sign in first.'); return; }
  _reportListingId = listingId;
  _reportReason = null;
  document.getElementById('reportNote').value = '';
  document.getElementById('reportReasons').innerHTML = REPORT_REASONS.map(r=>
    `<span class="report-reason" data-reason="${r.id}" onclick="selectReportReason('${r.id}')">${r.label}</span>`
  ).join('');
  updateReportSubmitState();
  document.getElementById('reportModal').classList.remove('hide');
}
function closeReportModal(){ document.getElementById('reportModal').classList.add('hide'); }
function selectReportReason(reason){
  _reportReason = reason;
  document.querySelectorAll('#reportReasons .report-reason').forEach(el=>{
    el.classList.toggle('sel', el.dataset.reason===reason);
  });
  updateReportSubmitState();
}
function updateReportSubmitState(){
  const btn = document.getElementById('reportSubmitBtn');
  if(btn) btn.disabled = !_reportReason;
}
async function submitReport(){
  if(!_reportListingId || !_reportReason) return;
  const btn = document.getElementById('reportSubmitBtn');
  if(btn){ btn.disabled=true; btn.textContent='Submitting…'; }
  try {
    const note = document.getElementById('reportNote').value.trim();
    await apiPost(`/api/listings/${_reportListingId}/report`, { reason:_reportReason, note: note||undefined });
    closeReportModal();
    toast('🚩 Report submitted — thanks for flagging this.');
  } catch(e){
    toast('Could not submit report: '+(e.message||'Unknown error'));
  } finally {
    if(btn){ btn.disabled=false; btn.textContent='Submit Report'; }
  }
}

// ═══════════════════════════════════════════════
// INBOX
// ═══════════════════════════════════════════════
async function openInboxModal(){
  document.getElementById('uavMenu').classList.remove('open');
  document.getElementById('inboxModal').classList.remove('hide');
  // Clear badge immediately — user is now reading the inbox
  const badge = document.getElementById('inboxBadge');
  if(badge){ badge.textContent=''; badge.style.display='none'; }
  document.getElementById('inboxList').innerHTML = '<div style="padding:30px;text-align:center;color:var(--muted);">Loading…</div>';
  try {
    const [convData, teamData] = await Promise.all([
      apiGet('/api/conversations'),
      apiGet('/api/messages/legacy/mine').catch(()=>({messages:[]})),
    ]);
    const convs = convData.conversations || [];
    const teamMsgs = teamData.messages || [];
    ST.allConversations = new Map(convs.map(c=>[c.id, c]));
    ST.conversationsByListing = new Map(
      convs.filter(c=>c.buyer_id===ST.user?.id).map(c=>[c.listing_id, c])
    );

    // Team-reply cards (read-only, one-way admin→user, see openInboxModal
    // comment history/Context.md for why these live in a separate legacy
    // table rather than the real chat system) render above conversations.
    const teamHtml = teamMsgs.map(m=>{
      const timeStr = m.sent_at
        ? new Date(m.sent_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})
        : '';
      return `<div class="inbox-item ${m.is_read?'':'unread'}">
        <div class="inbox-av" style="background:var(--orange)">📢</div>
        <div class="inbox-meta">
          <div class="inbox-name">MapIt Team</div>
          <div class="inbox-preview">${escHtml(m.content)}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:3px;">${timeStr}</div>
        </div>
        ${m.is_read?'':'<div class="inbox-unread-dot"></div>'}
      </div>`;
    }).join('');

    if(!convs.length && !teamMsgs.length){
      document.getElementById('inboxList').innerHTML =
        '<div style="padding:30px;text-align:center;color:var(--muted);">No messages yet.<br><span style="font-size:11px;">Tap "I\'m Interested" on a listing to start a conversation.</span></div>';
    } else {
      const convHtml = convs.map(c=>{
        const other = c.other_user || {};
        const col = escHtml(other.avatar_color || 'var(--orange)');
        const initials = escHtml(getInitials(other.nickname || other.full_name || '?'));
        const listing = c.listing || {};
        const unread = (c.unread_count||0) > 0;
        const timeStr = c.last_message?.sent_at
          ? new Date(c.last_message.sent_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})
          : '';
        const context = listing.title
          ? `<span style="font-size:10px;color:var(--muted);font-weight:400;"> · re: ${escHtml(listing.title)}</span>`
          : '';
        return `<div class="inbox-item ${unread?'unread':''}" style="cursor:pointer" onclick="openConversationFromInbox('${c.id}','${c.listing_id}')">
          <div class="inbox-av" style="background:${col}">${initials}</div>
          <div class="inbox-meta">
            <div class="inbox-name">${escHtml(other.nickname||other.full_name||'User')}${context}</div>
            <div class="inbox-preview">${escHtml(c.last_message?.content)}</div>
            <div style="font-size:10px;color:var(--muted);margin-top:3px;">${timeStr}</div>
          </div>
          ${unread?'<div class="inbox-unread-dot"></div>':''}
        </div>`;
      }).join('');
      document.getElementById('inboxList').innerHTML = teamHtml + convHtml;
    }

    // Mark team replies read now that they've been shown (matches the
    // existing pattern in openConversationFromInbox — reading = marking read).
    if(teamMsgs.some(m=>!m.is_read)) apiPut('/api/messages/mark-all-read', {}).catch(()=>{});
  } catch(e){
    document.getElementById('inboxList').innerHTML = `<div style="padding:30px;color:var(--red);">Error: ${escHtml(e.message)}</div>`;
  }
}
function closeInboxModal(){ document.getElementById('inboxModal').classList.add('hide'); }

// Tapping an inbox conversation navigates to its listing (so the buyer/seller
// sees the listing context) and opens the real chat thread directly.
async function openConversationFromInbox(conversationId, listingId){
  closeInboxModal();
  // If the current user is the seller on this conversation, the listing is
  // one of their own — it lives in My Listings, not Browse. Selecting it under
  // the wrong tab both mis-highlights the tab bar and (since selListing's
  // fetch-and-merge targets whichever array matches ST.tab) leaks the
  // seller's own listing into the Browse array/pins.
  const conv = ST.allConversations.get(conversationId);
  const isSeller = conv && conv.buyer_id !== ST.user?.id;
  if(isSeller){
    // Deliberately NOT calling switchTab('mine') here: with ST.selId still
    // null at that point, switchTab's own renderSidebar() call kicks off an
    // *unawaited* renderMyAds() fetch — that fetch can resolve after
    // openChat() below has already rendered the listing detail + chat box,
    // silently overwriting it back to the plain My Listings list. So the tab
    // button/state is set directly here, ST.myListings is loaded and
    // awaited, and renderSidebar() is only triggered once (inside
    // selListing, below) — by which point ST.selId is already set, so it
    // renders the listing detail instead of the list.
    ST.tab = 'mine';
    ST.selId = null;
    document.getElementById('tab-browse').classList.remove('on');
    document.getElementById('tab-fav').classList.remove('on');
    document.getElementById('tab-mine').classList.add('on');
    document.querySelector('.rad-box').classList.add('disabled');
    const smBox = document.getElementById('searchModeBox');
    if(smBox) smBox.classList.add('disabled');
    try {
      const data = await apiGet('/api/listings/mine/all');
      ST.myListings = data.listings || [];
      updateMineBadge();
    } catch(_){}
    drawMarkers();
    await selListing(listingId, true);
  } else {
    await selListing(listingId);
  }
  await openChat(conversationId);
}

