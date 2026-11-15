// MapIt frontend: main.js. Split from MapIt_MVP_v1.html lines 5850-5887 on 2026-11-15. Load order is set in public/index.html. Functions are global on purpose (inline onclick=).
// ═══════════════════════════════════════════════
// KEYWORD SEARCH
// ═══════════════════════════════════════════════
function clearKeyword(){
  ST.q = '';
  const inp = document.getElementById('srchIn');
  if(inp) inp.value = '';
  document.getElementById('srchClear').style.display = 'none';
  updateKwPill();
  drawMarkers();
  renderSidebar();
}

// Session 9J — the box sits in the sidebar, which is hidden in phone Map view
// and folded into the rail on desktop. An active keyword then shows as a
// clearable pill on the map, so pins never vanish without explanation.
function updateKwPill(){
  const pill = document.getElementById('kwPill'), inp = document.getElementById('srchIn');
  if(!pill || !inp) return;
  const typed = inp.value.trim();
  document.getElementById('kwPillTxt').textContent = typed;   // user-typed: text only
  pill.classList.toggle('hide', !(ST.q && inp.offsetParent === null));
}
function openSearchFromRail(){
  expandFromRail();
  setTimeout(() => document.getElementById('srchIn').focus(), 260);
}

document.getElementById('srchIn').addEventListener('input', e => {
  ST.q = e.target.value.trim().toLowerCase();
  document.getElementById('srchClear').style.display = ST.q ? 'block' : 'none';
  updateKwPill();
  drawMarkers();
  renderSidebar();
});

// Restore the collapsed side panel. Moved here from auth.js in the frontend split: it calls
// updateKwPill() (this file), so it must run after every file has loaded, before init().
try { if(localStorage.getItem(SB_COLLAPSED_KEY) === '1') setSidebarCollapsed(true, false); } catch(_){}

// Kick off
init();
