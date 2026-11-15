// MapIt frontend: auth.js. Split from MapIt_MVP_v1.html lines 2158-3010 on 2026-11-15. Load order is set in public/index.html. Functions are global on purpose (inline onclick=).
// ═══════════════════════════════════════════════
// AUTH FLOW
// ═══════════════════════════════════════════════
function goToStep(id){
  document.querySelectorAll('.modal-step').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  _updateModalBrand();
  _updateSwitchAccountLink();
}

// Shows the "← Not you? Choose a different account" link on step-auth
// whenever this device has other cached logins to switch back to.
function _updateSwitchAccountLink(){
  const link = document.getElementById('switchAccountLink');
  if(!link) return;
  const hasSessions = Object.keys(getMultiSessions()).length > 0;
  link.style.display = (document.getElementById('step-auth').classList.contains('active') && hasSessions) ? 'block' : 'none';
}

function backToWhoami(){
  document.getElementById('authModal').classList.add('hide');
  renderWhoamiScreen();
  document.getElementById('whoamiScreen').classList.remove('hide');
}

// Home-location map step and the register (Create Account) form are the tightest
// on vertical space; hide the redundant branding header on those to avoid a
// scrollbar. Called on every step change and on every auth-tab switch, since
// switching to/from the register tab doesn't re-run goToStep().
function _updateModalBrand(){
  const active = document.querySelector('.modal-step.active');
  const id = active ? active.id : '';
  const showBrand = id !== 'step-homeloc' && !(id === 'step-auth' && AUTH_MODE === 'register');
  document.getElementById('modalLogo').style.display = showBrand ? '' : 'none';
  document.getElementById('modalSub').style.display = showBrand ? '' : 'none';
}

function showErr(id, msg){ const el=document.getElementById(id); el.textContent=msg; el.style.display='block'; }
function hideErr(id){ document.getElementById(id).style.display='none'; }

// ── Email + Password auth ────────────────────────────────────────
let AUTH_MODE = 'signin';

function switchAuthTab(mode){
  AUTH_MODE = mode;
  document.getElementById('tab-signin').classList.toggle('active', mode==='signin');
  document.getElementById('tab-register').classList.toggle('active', mode==='register');
  document.getElementById('authBtnLabel').textContent = mode==='signin' ? 'Sign In' : 'Create Account';
  document.getElementById('confirmPwdGroup').style.display   = mode==='register' ? 'block' : 'none';
  document.getElementById('registerNameFields').style.display = mode==='register' ? 'block' : 'none';
  document.getElementById('registerMandatoryNote').style.display = mode==='register' ? 'block' : 'none';
  document.getElementById('registerGuideLink').style.display = mode==='register' ? 'block' : 'none';
  document.getElementById('forgotPwdRow').style.display = mode==='signin' ? 'block' : 'none';
  document.getElementById('authPassword').autocomplete = mode==='signin' ? 'current-password' : 'new-password';
  hideErr('authError');
  _updateModalBrand();
  _updateAuthPwdHint();
}

// Mirrors the backend rule in src/routes/auth.js (isStrongPassword) — kept in sync manually
function isStrongPasswordFE(pwd){
  return typeof pwd === 'string' && pwd.length >= 8 && /[A-Z]/.test(pwd) && /[^A-Za-z0-9]/.test(pwd);
}

function _updateAuthPwdHint(){
  const hint = document.getElementById('authPwdHint');
  if(AUTH_MODE !== 'register'){ hint.style.display = 'none'; }
  else {
    hint.style.display = 'block';
    const pwd = document.getElementById('authPassword').value;
    const ok = isStrongPasswordFE(pwd);
    hint.style.color = pwd && ok ? 'var(--green,#1a9c5c)' : (pwd ? '#d9534f' : 'var(--muted)');
    hint.textContent = (pwd && ok ? '✓ ' : '') + '8+ characters, 1 uppercase letter, 1 special character';
  }
  _updateRegisterBtnState();
}

// Register tab: "Create Account" stays disabled until every field is filled and the password meets the rule
function _updateRegisterBtnState(){
  const btn = document.getElementById('authSubmitBtn');
  const password = document.getElementById('authPassword').value;
  const confirm  = document.getElementById('authPasswordConfirm').value;
  _updatePwdMatchHint('authPwdMatchHint', password, confirm);
  if(AUTH_MODE !== 'register'){ btn.disabled = false; return; }
  const email    = document.getElementById('authEmail').value.trim();
  const fullName = document.getElementById('authFullName').value.trim();
  const nickname = document.getElementById('authNickname').value.trim();
  const valid = email.includes('@')
    && isStrongPasswordFE(password)
    && confirm.length > 0 && confirm === password
    && fullName.length > 0
    && nickname.length > 0;
  btn.disabled = !valid;
}

// Shared by the register form and the reset-password step — shows a ✓ once both fields match
function _updatePwdMatchHint(elId, password, confirm){
  const hint = document.getElementById(elId);
  if(!confirm){ hint.style.display = 'none'; return; }
  hint.style.display = 'block';
  if(confirm === password){
    hint.style.color = 'var(--green,#1a9c5c)';
    hint.textContent = '✓ Passwords match';
  } else {
    hint.style.color = '#d9534f';
    hint.textContent = 'Passwords do not match';
  }
}

function _updateNewPwdHint(){
  const hint = document.getElementById('newPwdHint');
  const btn  = document.getElementById('newPwdBtn');
  const pwd = document.getElementById('newPwdInput').value;
  const confirm = document.getElementById('newPwdConfirm').value;
  const ok = isStrongPasswordFE(pwd);
  hint.style.color = pwd && ok ? 'var(--green,#1a9c5c)' : (pwd ? '#d9534f' : 'var(--muted)');
  hint.textContent = (pwd && ok ? '✓ ' : '') + '8+ characters, 1 uppercase letter, 1 special character';
  _updatePwdMatchHint('newPwdMatchHint', pwd, confirm);
  btn.disabled = !(ok && confirm.length > 0 && confirm === pwd);
}

function togglePwd(){
  const inp = document.getElementById('authPassword');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

async function submitAuth(){
  const email    = document.getElementById('authEmail').value.trim().toLowerCase();
  const password = document.getElementById('authPassword').value;
  hideErr('authError');
  if(!email || !email.includes('@')){ showErr('authError','Please enter a valid email address.'); return; }
  if(!password){ showErr('authError','Please enter your password.'); return; }
  if(AUTH_MODE === 'register'){
    if(!isStrongPasswordFE(password)){ showErr('authError','Password must be at least 8 characters and include an uppercase letter and a special character.'); return; }
    const confirm   = document.getElementById('authPasswordConfirm').value;
    const fullName  = document.getElementById('authFullName').value.trim();
    const nickname  = document.getElementById('authNickname').value.trim();
    if(password !== confirm){ showErr('authError','Passwords do not match.'); return; }
    if(!fullName){ showErr('authError','Please enter your full name.'); return; }
    if(!nickname){ showErr('authError','Please enter a nickname — it will be your display name.'); return; }
    ST._pendingFullName = fullName;
    ST._pendingNickname = nickname;
    ST._pendingPassword = password;
  }
  const btn = document.getElementById('authSubmitBtn');
  btn.disabled = true; btn.innerHTML = '<div class="loading-spin"></div>';
  try {
    const endpoint = AUTH_MODE === 'signin' ? '/api/auth/signin' : '/api/auth/signup';
    const data = await apiPost(endpoint, { email, password });
    if(data.needsEmailVerification){
      document.getElementById('emailInput').value = data.email;
      document.getElementById('otpEmailLabel').textContent = data.email;
      goToStep('step-otp');
      document.getElementById('otpInput').focus();
      return;
    }
    ST.session = data.session;
    ST.user    = data.user;
    ST.profile = data.profile;
    ST.authProvider = 'email';
    const uid = data.user?.id;
    if(uid){
      const name = data.profile?.nickname || data.profile?.full_name || '';
      saveToMultiSessions(uid, { session: data.session, name, nickname: data.profile?.nickname||'', initials: getInitials(name), email: data.user?.email });
    }
    const needsProfile = data.isNewUser
      || !data.profile?.nickname
      || data.profile.nickname === 'MapIt User'
      || !data.profile?.full_name
      || data.profile.full_name === 'MapIt User';
    if(needsProfile){
      if(ST._pendingFullName) document.getElementById('nameInput').value = ST._pendingFullName;
      else if(data.profile?.full_name && data.profile.full_name !== 'MapIt User')
        document.getElementById('nameInput').value = data.profile.full_name;
      if(ST._pendingNickname) document.getElementById('profileNicknameInput').value = ST._pendingNickname;
      else if(data.profile?.nickname && data.profile.nickname !== 'MapIt User')
        document.getElementById('profileNicknameInput').value = data.profile.nickname;
      // Register form already collected Name+Nickname this session — don't ask twice
      showProfileNameRow(!(ST._pendingFullName && ST._pendingNickname));
      goToStep('step-profile');
    } else {
      showLoadingSplash();
      document.getElementById('authModal').classList.add('hide');
      await initApp();
    }
  } catch(e){
    let msg = e.message || 'Sign in failed. Please try again.';
    if(AUTH_MODE==='register' && msg.toLowerCase().includes('credentials')){
      msg = 'An account with this email already exists. Try signing in, or use email OTP.';
    }
    showErr('authError', msg);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span id="authBtnLabel">${AUTH_MODE==='signin' ? 'Sign In' : 'Create Account'}</span> <span>→</span>`;
  }
}

async function signInWithGoogle(){
  const btn = document.getElementById('googleBtn');
  btn.disabled = true; btn.innerHTML = '<div class="loading-spin"></div> Connecting…';
  try {
    const redirectTo = encodeURIComponent(window.location.origin);
    const { url } = await apiGet('/api/auth/google?redirectTo=' + redirectTo);
    window.location.href = url;
  } catch(e){
    toast('Google sign-in unavailable. Please try email.');
    btn.disabled = false;
    btn.innerHTML = '<span style="font-size:17px;font-weight:700;line-height:1;font-family:Georgia,serif;">G</span> Continue with Google';
  }
}

async function handleOAuthCallback(){
  const hash = window.location.hash;
  if(!hash.includes('access_token=')) return false;
  const params = new URLSearchParams(hash.substring(1));
  const access_token  = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  const expires_in    = params.get('expires_in');
  const type          = params.get('type');
  if(!access_token) return false;
  history.replaceState(null, '', window.location.pathname);
  ST.session = { access_token, refresh_token, expires_in: Number(expires_in) };

  // Password reset link — show "set new password" form instead of signing in
  if(type === 'recovery'){
    document.getElementById('authModal').classList.remove('hide');
    goToStep('step-new-password');
    return true;
  }

  ST.authProvider = 'google';
  try {
    const data = await apiGet('/api/auth/me');
    ST.user    = data.user;
    ST.profile = data.profile;
    const uid  = data.user?.id;
    if(uid){
      const name = data.profile?.nickname || data.profile?.full_name || '';
      saveToMultiSessions(uid, { session: ST.session, name, nickname: data.profile?.nickname||'', initials: getInitials(name), email: data.user?.email });
    }
    const needsProfile = !data.profile
      || !data.profile?.nickname
      || data.profile.nickname === 'MapIt User'
      || !data.profile?.full_name
      || data.profile.full_name === 'MapIt User';
    if(needsProfile){
      if(data.profile?.full_name && data.profile.full_name !== 'MapIt User')
        document.getElementById('nameInput').value = data.profile.full_name;
      if(data.profile?.nickname && data.profile.nickname !== 'MapIt User')
        document.getElementById('profileNicknameInput').value = data.profile.nickname;
      showProfileNameRow(true);
      document.getElementById('authModal').classList.remove('hide');
      goToStep('step-profile');
      return true;
    }
    showLoadingSplash();
    document.getElementById('authModal').classList.add('hide');
    await initApp();
    return true;
  } catch(e){
    toast('Sign-in failed. Please try again.');
    return false;
  }
}

async function sendPasswordReset(){
  const email = document.getElementById('authEmail').value.trim().toLowerCase();
  if(!email || !email.includes('@')){ showErr('authError','Enter your email above to receive a reset link.'); return; }
  try {
    await apiPost('/api/auth/reset-password', { email, redirectTo: window.location.origin + '/' });
    document.getElementById('resetSentMsg').innerHTML =
      `A password reset link has been sent to<br><b>${escHtml(email)}</b><br><br>Click the link in the email to set a new password. The link expires in 1 hour.`;
    goToStep('step-reset-sent');
  } catch(e){ showErr('authError', 'Could not send reset link. Please try again.'); }
}

function toggleNewPwd(){
  const inp = document.getElementById('newPwdInput');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

async function setNewPassword(){
  const pwd     = document.getElementById('newPwdInput').value;
  const confirm = document.getElementById('newPwdConfirm').value;
  hideErr('newPwdError');
  if(!isStrongPasswordFE(pwd)){ showErr('newPwdError','Password must be at least 8 characters and include an uppercase letter and a special character.'); return; }
  if(pwd !== confirm){ showErr('newPwdError','Passwords do not match.'); return; }
  const btn = document.getElementById('newPwdBtn');
  btn.disabled = true; btn.innerHTML = '<div class="loading-spin"></div>';
  try {
    await apiPut('/api/auth/password', { password: pwd });
    toast('✅ Password updated! Please sign in with your new password.');
    ST.session = null;
    goToStep('step-auth');
  } catch(e){
    showErr('newPwdError', e.message || 'Could not update password. The link may have expired.');
  } finally {
    btn.disabled = false; btn.innerHTML = '<span>Update Password →</span>';
  }
}

// ── OTP flow (kept as fallback) ──────────────────────────────────
async function sendOtp(){
  const email = document.getElementById('emailInput').value.trim().toLowerCase();
  hideErr('emailError');
  if(!email || !email.includes('@')){ showErr('emailError','Please enter a valid email address.'); return; }
  const btn = document.getElementById('sendOtpBtn');
  btn.disabled = true; btn.innerHTML = '<div class="loading-spin"></div>';
  try {
    await apiPost('/api/auth/send-otp', { email });
    document.getElementById('otpEmailLabel').textContent = email;
    goToStep('step-otp');
    document.getElementById('otpInput').focus();
  } catch(e){
    showErr('emailError', e.message);
  } finally {
    btn.disabled = false; btn.innerHTML = '<span>Send Login Code</span><span>→</span>';
  }
}

async function verifyOtp(){
  const email = document.getElementById('emailInput').value.trim().toLowerCase();
  const token = document.getElementById('otpInput').value.trim();
  hideErr('otpError');
  if(token.length !== 6){ showErr('otpError','Please enter the 6-digit code from your email.'); return; }
  const btn = document.getElementById('verifyOtpBtn');
  btn.disabled = true; btn.innerHTML = '<div class="loading-spin"></div>';
  try {
    const data = await apiPost('/api/auth/verify-otp', { email, token });
    ST.session = data.session;
    ST.user    = data.user;
    ST.profile = data.profile;
    ST.authProvider = 'email';

    // Signup flow never sets a password on the account until verification
    // succeeds — apply it now. Gate on agreed_tos_at rather than isNewUser:
    // a DB trigger auto-creates a blank profiles row the instant the auth
    // account exists (before /register ever runs), so isNewUser (= !profile)
    // is always false even for a genuinely brand-new signup. agreed_tos_at
    // is only ever set by POST /register, so its absence reliably means
    // "never completed registration" — and it survives the invite-code
    // profile reset script (which nulls nickname/full_name but not this),
    // so a returning family member's real password still won't be clobbered.
    if(!data.profile?.agreed_tos_at && ST._pendingPassword){
      const newPassword = ST._pendingPassword;
      ST._pendingPassword = null;
      await apiPut('/api/auth/password', { password: newPassword });
      // Setting the password via the admin API invalidates the session we
      // just got from verify-otp (Supabase revokes existing sessions on a
      // credentials change) — re-sign-in to get a fresh, valid one before
      // continuing, or the next call (register) fails with "session expired".
      const fresh = await apiPost('/api/auth/signin', { email, password: newPassword });
      ST.session = fresh.session;
      ST.user    = fresh.user;
      ST.profile = fresh.profile;
    }

    const uid = ST.user?.id;
    if(uid){
      const name = ST.profile?.nickname || ST.profile?.full_name || '';
      saveToMultiSessions(uid, { session: ST.session, name, nickname: ST.profile?.nickname||'', initials: getInitials(name), email: ST.user?.email });
    }
    const needsProfile = !ST.profile?.nickname
      || ST.profile.nickname === 'MapIt User'
      || !ST.profile?.full_name
      || ST.profile.full_name === 'MapIt User';
    if(needsProfile){
      // Signup flow already collected Name+Nickname before verification — don't ask twice
      if(ST._pendingFullName) document.getElementById('nameInput').value = ST._pendingFullName;
      else if(ST.profile?.full_name && ST.profile.full_name !== 'MapIt User')
        document.getElementById('nameInput').value = ST.profile.full_name;
      if(ST._pendingNickname) document.getElementById('profileNicknameInput').value = ST._pendingNickname;
      else if(ST.profile?.nickname && ST.profile.nickname !== 'MapIt User')
        document.getElementById('profileNicknameInput').value = ST.profile.nickname;
      showProfileNameRow(!(ST._pendingFullName && ST._pendingNickname));
      goToStep('step-profile');
    } else {
      showLoadingSplash();
      document.getElementById('authModal').classList.add('hide');
      await initApp();
    }
  } catch(e){
    showErr('otpError','Invalid or expired code. Please try again.');
  } finally {
    btn.disabled = false; btn.innerHTML = '<span>Verify & Sign In</span><span>→</span>';
  }
}

// ── Profile setup ────────────────────────────────────────────────
function showProfileNameRow(show){
  const row = document.getElementById('profileNameRow');
  if(row) row.style.display = show ? '' : 'none';
}
function updateProfileContinueState(){
  const btn = document.getElementById('profileContinueBtn');
  const tosOk = document.getElementById('tosCheck').checked;
  if(btn) btn.disabled = !tosOk;
}
async function saveProfile(){
  const full_name = document.getElementById('nameInput').value.trim();
  const nickname  = document.getElementById('profileNicknameInput').value.trim();
  const tosOk    = document.getElementById('tosCheck').checked;
  if(!full_name){ toast('Please enter your name.'); return; }
  if(!nickname){ toast('Please enter a nickname — it will appear as your display name.'); return; }
  if(!tosOk){ toast('Please agree to the Terms of Service to continue.'); return; }
  try {
    const data = await apiPost('/api/auth/register', {
      full_name, nickname,
      invite_code: ST.inviteCode||null,
      auth_provider: ST.authProvider||'email',
    });
    ST.profile    = data.profile;
    ST.createdFor = nickname;
    ST._pendingFullName = null; ST._pendingNickname = null;
    const uid = ST.user?.id;
    if(uid) saveToMultiSessions(uid, { session: ST.session, name: full_name, nickname, initials: getInitials(nickname), email: ST.user?.email });
    openPhoneVerify('signup');
  } catch(e){ toast('Could not save profile: ' + e.message); }
}

// ── Phone OTP verification (Session 9C — WhatsApp via MSG91) ─────────────
// Two entry points share the same two modal steps:
//   'signup' — after saveProfile(); success or "Verify later" continues to
//              step-homeloc, exactly where signup went before 9C.
//   'post'   — openPostModal() gate for accounts that must verify before
//              posting; success reopens the post form, "Verify later" closes.
//   'profile' — "Verify now →" in View Profile; either way returns to it.
// The server enforces the same rule (POST /api/listings → 403), so this is
// UX only — the user is asked up front instead of after filling the form.
let _phoneVerifyCtx = 'signup';
function openPhoneVerify(ctx, prefill){
  _phoneVerifyCtx = ctx;
  hideErr('phoneNumError'); hideErr('phoneOtpError');
  document.getElementById('phoneVerifyInput').value = prefill || ST.profile?.phone || '';
  document.getElementById('phoneOtpInput').value = '';
  document.getElementById('authModal').classList.remove('hide');
  goToStep('step-phone-number');
}
function _finishPhoneVerify(){
  if(_phoneVerifyCtx === 'post'){
    document.getElementById('authModal').classList.add('hide');
    openPostModal();
  } else if(_phoneVerifyCtx === 'profile'){
    document.getElementById('authModal').classList.add('hide');
    openProfileModal();
  } else {
    goToStep('step-homeloc');
    initHomeLocMap();
  }
}
function skipPhoneVerify(){
  if(_phoneVerifyCtx === 'post'){
    document.getElementById('authModal').classList.add('hide');
    toast('You can verify any time — just tap Post a Listing again.');
  } else if(_phoneVerifyCtx === 'profile'){
    document.getElementById('authModal').classList.add('hide');
    openProfileModal();
  } else {
    toast("No problem — we'll ask again before you post a listing.");
    goToStep('step-homeloc');
    initHomeLocMap();
  }
}
async function sendPhoneOtp(){
  // Also used by "Resend" on the code step — show errors on whichever step is open.
  const onCodeStep = document.getElementById('step-phone-otp').classList.contains('active');
  const errId = onCodeStep ? 'phoneOtpError' : 'phoneNumError';
  const phone = document.getElementById('phoneVerifyInput').value.trim();
  hideErr('phoneNumError'); hideErr('phoneOtpError');
  if(!phone || phone.replace(/\D/g,'').length < 10){ showErr('phoneNumError','Please enter a valid 10-digit mobile number.'); goToStep('step-phone-number'); return; }
  const btn = document.getElementById('sendPhoneOtpBtn');
  btn.disabled = true; btn.innerHTML = '<div class="loading-spin"></div>';
  try {
    const data = await apiPost('/api/auth/otp/phone/send', { phone });
    if(data.already_verified){
      ST.profile = { ...ST.profile, phone_verified: true };
      toast('This number is already verified ✓');
      _finishPhoneVerify();
      return;
    }
    document.getElementById('phoneOtpLabel').textContent = data.phone_masked;
    if(onCodeStep) toast('New code sent on WhatsApp');
    goToStep('step-phone-otp');
    document.getElementById('phoneOtpInput').value = '';
    document.getElementById('phoneOtpInput').focus();
  } catch(e){
    showErr(errId, e.message);
  } finally {
    btn.disabled = false; btn.innerHTML = '<span>Send WhatsApp Code</span> <span>→</span>';
  }
}

async function verifyPhoneOtp(){
  const token = document.getElementById('phoneOtpInput').value.trim();
  hideErr('phoneOtpError');
  if(!/^\d{6}$/.test(token)){ showErr('phoneOtpError','Please enter the 6-digit code sent via WhatsApp.'); return; }
  const btn = document.getElementById('verifyPhoneOtpBtn');
  btn.disabled = true; btn.innerHTML = '<div class="loading-spin"></div>';
  try {
    const data = await apiPost('/api/auth/otp/phone/verify', { code: token });
    ST.profile = data.profile;
    toast('Phone verified ✓');
    _finishPhoneVerify();
  } catch(e){
    showErr('phoneOtpError', e.message || 'Invalid or expired code. Please try again.');
  } finally {
    btn.disabled = false; btn.innerHTML = '<span>Verify Phone</span> <span>→</span>';
  }
}

// ── Home location picker ─────────────────────────────────────────
let _homeLocMap = null, _homeLocMarker = null, _homeLocCoords = null;

function initHomeLocMap(){
  if(_homeLocMap){ _homeLocMap.remove(); _homeLocMap = null; _homeLocMarker = null; _homeLocCoords = null; }
  document.getElementById('homeLocAddr').textContent = '';
  document.getElementById('saveHomeLocBtn').style.display = 'none';
  document.getElementById('homeLocSearchIn').value = '';
  document.getElementById('homeLocSearchDD').classList.add('hide');
  document.getElementById('homeLocSearchDD').innerHTML = '';
  document.getElementById('homeLocCoordsIn').value = '';
  document.getElementById('homeLocCoordsHint').textContent = 'Tip: open Google Maps, long-press your location and copy the coordinates shown.';
  _homeLocSearchResults = [];
  const center = ST.activePin ? [ST.activePin.lat, ST.activePin.lng] : [12.9716, 77.5946];
  setTimeout(()=>{
    _homeLocMap = L.map('homeLocMap', { zoomControl: true, attributionControl: false }).setView(center, 13);
    const _homeLocTiles = L.tileLayer(mapboxTileUrl(),{tileSize:512,zoomOffset:-1,maxZoom:20}).addTo(_homeLocMap);
    runtimeCfgPromise.then(()=>_homeLocTiles.setUrl(mapboxTileUrl()));
    _homeLocMap.on('click', async e=>{
      const { lat, lng } = e.latlng;
      _placeHomeLocPin(lat, lng);
      await _resolveHomeLocAddr(lat, lng);
    });
    _homeLocMap.invalidateSize();
    _applyRegionBounds(_homeLocMap);
    _pingMapLoad('home');
  }, 120);
}

// Shared by map-click, marker-drag, and typed-GPS-coordinate entry — one pin,
// three ways to place it (Arun/Nagesh: many users copy exact coordinates from
// a Google Maps long-press rather than eyeballing the map).
function _placeHomeLocPin(lat, lng){
  _homeLocCoords = { lat, lng };
  if(_homeLocMarker) _homeLocMarker.setLatLng([lat, lng]);
  else {
    _homeLocMarker = L.marker([lat, lng], {draggable: true}).addTo(_homeLocMap);
    _homeLocMarker.on('dragend', async ev => {
      const p = ev.target.getLatLng();
      _homeLocCoords = { lat: p.lat, lng: p.lng };
      await _resolveHomeLocAddr(p.lat, p.lng);
    });
  }
  document.getElementById('homeLocHint').textContent = '✅ Pin placed — drag to adjust';
  document.getElementById('homeLocAddr').textContent = 'Getting address…';
  document.getElementById('saveHomeLocBtn').style.display = 'flex';
}

function _onHomeLocCoordsInput(){
  const raw = document.getElementById('homeLocCoordsIn').value.trim();
  const hint = document.getElementById('homeLocCoordsHint');
  if(!raw){ hint.textContent = 'Tip: open Google Maps, long-press your location and copy the coordinates shown.'; return; }
  const parts = raw.split(',').map(s=>parseFloat(s.trim()));
  const valid = parts.length===2 && parts.every(n=>!isNaN(n)) && Math.abs(parts[0])<=90 && Math.abs(parts[1])<=180;
  if(!valid){ hint.textContent = '⚠️ Not a valid coordinate pair yet'; return; }
  hint.textContent = '✅ Pin moved to these coordinates';
  const [lat,lng] = parts;
  _placeHomeLocPin(lat, lng);
  if(_homeLocMap) _homeLocMap.flyTo([lat,lng], 15);
  _resolveHomeLocAddr(lat, lng);
}

// Session 9J — place search finds areas AND landmarks (malls, hospitals, schools,
// parks, temples, stations, offices). Roads are left out (many near-duplicate
// segments), and so are railway lines (only stations). Shared by all four place
// searches: home location, post location, My Locations and Explore.
const PLACE_SEARCH_KEYS = new Set(['place','boundary','amenity','shop','tourism','leisure','historic','building','office','railway','public_transport','aeroway']);
const RAIL_STOPS = new Set(['station','halt','subway_entrance','tram_stop']);
// Small fixtures nobody searches for as a landmark ("Nexus Mall Parking")
// Only big shops work as landmarks; single stores inside a mall are noise
const LANDMARK_SHOPS = new Set(['mall','department_store','supermarket','hypermarket','wholesale']);
const PLACE_SEARCH_SKIP = new Set(['parking','parking_entrance','parking_space','bicycle_parking','motorcycle_parking','toilets','bench','waste_basket','atm','vending_machine','drinking_water']);
function photonPlaces(features){
  const seen = new Set();
  return (features || [])
    .filter(f => {
      const p = f.properties;
      if(!p.name || !PLACE_SEARCH_KEYS.has(p.osm_key) || PLACE_SEARCH_SKIP.has(p.osm_value)) return false;
      if(p.osm_key === 'shop') return LANDMARK_SHOPS.has(p.osm_value);
      return p.osm_key !== 'railway' || RAIL_STOPS.has(p.osm_value);
    })
    .map(f => {
      const p = f.properties;
      // Villages outside the city often have no city, so fall back to the taluk
      // ("Yelahanka taluku" → "Yelahanka"). Without it the three Thindlus all read
      // "Thindlu, Karnataka" and the de-dupe below kept only one (final polish, Arun).
      const taluk = (p.county || '').replace(/\s+taluk[ua]?$/i, '').trim();
      const area = p.city || taluk;
      const city = area && area !== p.name ? area : null;
      const isArea = p.osm_key === 'place' || p.osm_key === 'boundary';
      // Landmarks show their locality so "Forum Mall" reads "Forum Mall, Koramangala, Bengaluru"
      const parts = isArea ? [p.name, city, p.state] : [p.name, p.district || p.locality || p.street, city];
      return { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], display_name: parts.filter(Boolean).join(', ') };
    })
    .filter(r => !seen.has(r.display_name) && seen.add(r.display_name));
}
let _homeLocSearchTimer = null;
let _homeLocSearchResults = [];

function _onHomeLocSearchInput(){
  clearTimeout(_homeLocSearchTimer);
  const q = document.getElementById('homeLocSearchIn').value.trim();
  const dd = document.getElementById('homeLocSearchDD');
  if(q.length < 4){ dd.classList.add('hide'); dd.innerHTML = ''; return; }
  _homeLocSearchTimer = setTimeout(()=>_runHomeLocSearch(q), 400);
}

async function _runHomeLocSearch(q){
  const dd = document.getElementById('homeLocSearchDD');
  try {
    // Photon (photon.komoot.io) instead of Nominatim's /search — Nominatim needs a
    // complete word to match ("Banash" returns nothing until "Banashankari" is fully
    // typed), so it can't do autocomplete-as-you-type. Photon is free, no API key,
    // built on the same OSM data, and matches on partial words from the 3rd character.
    // bbox hard-restricts to ~40km around the city currently shown on the map (confirmed
    // via manual testing that Photon actually excludes out-of-box results, unlike
    // Nominatim's viewbox+bounded=0 which barely affected ranking).
    let geoParams = '';
    if(_homeLocMap){
      const c = _homeLocMap.getCenter();
      const latDelta = 0.35; // ~39km
      const lonDelta = latDelta / Math.cos(c.lat * Math.PI / 180);
      geoParams = `&lat=${c.lat}&lon=${c.lng}&bbox=${c.lng-lonDelta},${c.lat-latDelta},${c.lng+lonDelta},${c.lat+latDelta}`;
    }
    const r = await fetch(`https://photon.komoot.io/api/?limit=10&q=${encodeURIComponent(q)}${geoParams}`);
    const { features } = await r.json();
    _homeLocSearchResults = photonPlaces(features);
    if(!_homeLocSearchResults.length){ dd.classList.add('hide'); dd.innerHTML = ''; return; }
    dd.innerHTML = '';
    _homeLocSearchResults.forEach((m, i) => {
      const row = document.createElement('div');
      row.textContent = '📍 ' + m.display_name.split(',').slice(0,3).map(x=>x.trim()).join(', ');
      row.style.cssText = 'padding:9px 12px;font-size:12.5px;cursor:pointer;border-bottom:1px solid var(--border);';
      row.onclick = () => _pickHomeLocSearchResult(i);
      dd.appendChild(row);
    });
    dd.classList.remove('hide');
  } catch(_){
    dd.classList.add('hide'); dd.innerHTML = '';
  }
}

function _pickHomeLocSearchResult(i){
  const m = _homeLocSearchResults[i];
  if(!m) return;
  document.getElementById('homeLocSearchIn').value = m.display_name.split(',').slice(0,3).map(x=>x.trim()).join(', ');
  document.getElementById('homeLocSearchDD').classList.add('hide');
  if(_homeLocMap) _homeLocMap.flyTo([+m.lat, +m.lon], 15);
}

async function _resolveHomeLocAddr(lat, lng){
  document.getElementById('homeLocAddr').textContent = 'Getting address…';
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
    const g = await r.json();
    const addr = g.display_name?.split(',').slice(0,3).map(x=>x.trim()).join(', ') || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    _homeLocCoords.address = addr;
    document.getElementById('homeLocAddr').textContent = '📍 ' + addr;
  } catch(_){
    _homeLocCoords.address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    document.getElementById('homeLocAddr').textContent = '📍 ' + _homeLocCoords.address;
  }
}

async function saveHomeLocation(){
  if(!_homeLocCoords) return;
  const btn = document.getElementById('saveHomeLocBtn');
  btn.disabled = true; btn.innerHTML = '<div class="loading-spin"></div>';
  try {
    const data = await apiPut('/api/auth/home-location', {
      home_lat: _homeLocCoords.lat,
      home_lng: _homeLocCoords.lng,
      home_address: _homeLocCoords.address||null,
    });
    ST.profile = data.profile;
    // Also create a user_pin so the header badge and map centre reflect the saved location
    // (profiles.home_* and user_pins are separate stores; without this the header stays at the HTML default)
    await apiPost('/api/pins', {
      label: document.getElementById('homeLocLabelIn').value.trim() || 'Home',
      lat: _homeLocCoords.lat,
      lng: _homeLocCoords.lng,
      is_default: true,
    });
    toast('Home location saved!');
    _closeAuthModal();
  } catch(e){
    toast('Could not save location. Continuing…');
    _closeAuthModal();
  }
}

function skipHomeLocation(){ _closeAuthModal(); }

async function _closeAuthModal(){
  showLoadingSplash();
  document.getElementById('authModal').classList.add('hide');
  if(_homeLocMap){ _homeLocMap.remove(); _homeLocMap = null; }
  await initApp();
}

// ── Sign Out ──────────────────────────────────────────────────────
async function logout(){
  const name = ST.createdFor || ST.profile?.full_name || 'User';
  const uid  = ST.user?.id;
  if(uid && ST.session) saveToMultiSessions(uid, { session: ST.session });
  try { await apiPost('/api/auth/logout', {}); } catch(_){}
  localStorage.removeItem('mapit_invite');
  localStorage.removeItem('mapit_created_for');
  document.getElementById('adminMenuItem').classList.add('hide');
  ST.session = null; ST.user = null; ST.profile = null;
  ST.inviteCode = ''; ST.createdFor = ''; ST.authProvider = null;
  ST.userPins = []; ST.activePin = null;
  ST.listings = []; ST.savedIds = new Set();
  toast(`👋 ${name} signed out.`);
  setTimeout(()=>location.reload(), 1800);
}

function showLoadingSplash(){
  const s = document.getElementById('splashScreen');
  s.classList.remove('hide');
  document.getElementById('splashMsg').textContent = 'Loading your map…';
}

function toggleAvatarMenu(){
  document.getElementById('uavMenu').classList.toggle('open');
}

async function changeNickname(){
  const current = ST.profile?.nickname || '';
  document.getElementById('uavMenu').classList.remove('open');
  const newNick = await mapitDialog({
    title: 'Change your display name',
    message: 'This is the nickname other people see.',
    input: { value: current, maxlength: 30, placeholder: 'e.g. Priya' },
    okText: 'Save',
  });
  if(newNick === null) return;
  const trimmed = newNick.trim();
  if(!trimmed){ toast('Nickname cannot be empty.'); return; }
  if(trimmed === current) return;
  try {
    const data = await apiPut('/api/auth/nickname', { nickname: trimmed });
    ST.profile = { ...ST.profile, nickname: trimmed };
    const uid = ST.user?.id;
    if(uid) saveToMultiSessions(uid, { nickname: trimmed });
    const displayName = trimmed;
    document.getElementById('uavName').textContent = displayName;
    document.getElementById('uavChipName').textContent = displayName.split(' ')[0];
    document.getElementById('uavInitial').textContent = getInitials(displayName);
    document.getElementById('uavMenu').classList.remove('open');
    toast('Nickname updated to "' + trimmed + '"');
  } catch(e){ toast('Could not update nickname. Please try again.'); }
}

document.addEventListener('click', e => {
  if(!document.getElementById('uavBtn').contains(e.target)){
    document.getElementById('uavMenu').classList.remove('open');
  }
  if(!document.getElementById('radBox').contains(e.target)) closeRadMenu();
  if(!document.getElementById('pinBox').contains(e.target)) closePinMenu();
});

// ── Collapsible sidebar, desktop only (Session 9G) ──
// The user's own collapse/expand is remembered per browser. Opening a listing
// from the rail expands the panel temporarily (ST.sbAutoOpened) and closing
// that listing folds it back.
const SB_COLLAPSED_KEY = 'mapit_sb_collapsed';
const isDesktop = () => window.matchMedia('(min-width:769px)').matches;
function isSidebarCollapsed(){ return document.getElementById('main').classList.contains('sb-collapsed'); }
function setSidebarCollapsed(collapsed, persist=true){
  document.getElementById('main').classList.toggle('sb-collapsed', collapsed);
  const h = document.getElementById('sbHandle');
  const label = collapsed ? 'Expand side panel' : 'Collapse side panel';
  h.textContent = collapsed ? '›' : '‹';
  h.title = label; h.setAttribute('aria-label', label); h.setAttribute('aria-expanded', String(!collapsed));
  if(persist){ try { localStorage.setItem(SB_COLLAPSED_KEY, collapsed ? '1' : '0'); } catch(_){} }
  // Leaflet must re-measure after the width animation, or the newly exposed strip stays grey
  setTimeout(() => { if(map) map.invalidateSize(); }, 260);
  updateKwPill();
}
function toggleSidebar(){ ST.sbAutoOpened = false; setSidebarCollapsed(!isSidebarCollapsed()); }
function expandSidebarForDetail(){
  if(isDesktop() && isSidebarCollapsed()){ ST.sbAutoOpened = true; setSidebarCollapsed(false, false); }
}
// Tab icons in the rail show lists, so they open the panel (a deliberate choice, remembered)
function expandFromRail(){ if(isDesktop() && isSidebarCollapsed()){ ST.sbAutoOpened = false; setSidebarCollapsed(false); } }

// ── Radius dropdown chip (Session 9G) ──
function toggleRadMenu(e){
  e.stopPropagation();
  closePinMenu();
  const open = document.getElementById('radMenu').classList.toggle('open');
  document.getElementById('radChip').setAttribute('aria-expanded', open);
}
// ── My location dropdown (Session 9G) ──
// In Explore mode the button just switches back to "Near me"; when already
// active it opens the saved-locations menu. Labels are user-typed, so items
// are built with textContent, never innerHTML.
function onMyLocationClick(e){
  e.stopPropagation();
  if(ST.exploreMode){ setSearchMode('pin'); return; }
  const menu = document.getElementById('pinMenu');
  if(menu.classList.contains('open')){ closePinMenu(); return; }
  closeRadMenu();
  menu.innerHTML = '';
  ST.userPins.forEach(p=>{
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pmi' + (p.id===ST.activePin?.id ? ' on' : '');
    const tick = document.createElement('span'); tick.className = 'pmi-tick'; tick.textContent = p.id===ST.activePin?.id ? '✓' : '';
    const name = document.createElement('span'); name.className = 'pmi-name'; name.textContent = p.label;
    b.append(tick, name);
    b.onclick = () => { closePinMenu(); if(p.id!==ST.activePin?.id) setDefaultPin(p.id, true); else goHomeArea(); };
    menu.appendChild(b);
  });
  const m = document.createElement('button');
  m.type = 'button'; m.className = 'pmi manage';
  m.textContent = ST.userPins.length ? '＋ Add or manage locations…' : '＋ Set your location…';
  m.onclick = () => { closePinMenu(); openPinsModal(); };
  menu.appendChild(m);
  menu.classList.add('open');
  document.getElementById('smPin').setAttribute('aria-expanded','true');
}
function closePinMenu(){
  document.getElementById('pinMenu').classList.remove('open');
  document.getElementById('smPin').setAttribute('aria-expanded','false');
}
function closeRadMenu(){
  document.getElementById('radMenu').classList.remove('open');
  document.getElementById('radChip').setAttribute('aria-expanded', 'false');
}
document.addEventListener('keydown', e => { if(e.key === 'Escape'){ closeRadMenu(); closePinMenu(); } });

// The header wraps to two rows on phones, so #main's height follows the
// header's real height instead of assuming 56px. Leaflet must be told when
// its container is resized, or tiles render with grey gaps.
new ResizeObserver(() => {
  const h = document.getElementById('hdr').offsetHeight;
  document.documentElement.style.setProperty('--hdr-h', h + 'px');
  if(typeof map !== 'undefined' && map) map.invalidateSize();
}).observe(document.getElementById('hdr'));

