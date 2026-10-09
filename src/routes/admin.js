// ============================================================
// Admin Overview Routes — admin-only
// GET  /api/admin/overview     — total users, active users (30d), region
//   breakdown, and signup-rate (7d/30d + 8-week trend, for sizing the
//   planned phone-OTP SMS volume against real data instead of guesses)
// GET  /api/admin/cost-report  — Session 9F: last-7-days vs. trailing
//   4-week-average cost/usage per metric, >30%-move flag, rule-based cause
// POST /api/admin/map-load-ping — Session 9F: requireAuth only (NOT
//   requireAdmin) — every logged-in user's browser calls this once per
//   map init, it's the Mapbox-tile-volume proxy the cost-report reads
// ============================================================
// Cross-cutting metrics (users + listings + chat), so it lives in its own
// file rather than being bolted onto users.js or listings.js.
const express          = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { createError }  = require('../middleware/errorHandler');
const { bucketAddress } = require('../utils/bangaloreAreas');
const { logAuditEvent } = require('../utils/auditLog');
const { getAnthropicCostUsd } = require('../utils/anthropicCost');

const router = express.Router();

const REGION_CAP = 6;  // top N regions shown individually; the rest collapse into "Other"
const SIGNUP_WEEKS = 8; // trailing weeks shown in the signup sparkline

// Mapbox has no usage/spend API at all (confirmed via Mapbox's own docs,
// 2026-08-30 scoping) — this is a deliberate ESTIMATE, not a real figure,
// and must always be labeled as such wherever it's shown. TILES_PER_PING
// is the midpoint of the 15-30-tiles-per-map-session estimate from the
// Session 9D Mapbox cost research; RATE_PER_1000 uses Mapbox's lowest
// overage tier ($0.50/1,000) as the closest "just above free tier" proxy
// — good enough for trend-flagging (">30% move"), explicitly not
// reconciled to Mapbox's literal invoice.
const MAPBOX_TILES_PER_PING = 20;
const MAPBOX_RATE_PER_1000  = 0.50;

// Monday-start week bucket (UTC) for a given date/timestamp.
function weekStartUTC(d) {
  const dt = new Date(d);
  const day = dt.getUTCDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day; // days back to that week's Monday
  dt.setUTCDate(dt.getUTCDate() + diff);
  dt.setUTCHours(0, 0, 0, 0);
  return dt;
}

router.get('/overview', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Trailing SIGNUP_WEEKS window (oldest week's Monday → now), used for
    // both the 8-week sparkline and (since it's a superset) the 7d/30d tiles.
    const currentWeekStart = weekStartUTC(new Date());
    const weekStarts = Array.from({ length: SIGNUP_WEEKS }, (_, i) => {
      const ws = new Date(currentWeekStart);
      ws.setUTCDate(ws.getUTCDate() - (SIGNUP_WEEKS - 1 - i) * 7);
      return ws;
    });
    const signupWindowStart = weekStarts[0].toISOString();

    const [
      { count: totalUsers, error: usersErr },
      { data: recentListings, error: listingsErr },
      { data: recentMessages, error: messagesErr },
      { data: allListings, error: addrErr },
      { data: recentSignups, error: signupsErr },
    ] = await Promise.all([
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('listings').select('seller_id').gte('created_at', thirtyDaysAgo),
      supabaseAdmin.from('chat_messages').select('sender_id').gte('sent_at', thirtyDaysAgo),
      supabaseAdmin.from('listings').select('address'),
      supabaseAdmin.from('profiles').select('created_at').gte('created_at', signupWindowStart),
    ]);

    if (usersErr)    return next(createError(usersErr.message));
    if (listingsErr) return next(createError(listingsErr.message));
    if (messagesErr) return next(createError(messagesErr.message));
    if (addrErr)      return next(createError(addrErr.message));
    if (signupsErr)   return next(createError(signupsErr.message));

    // Active = posted a listing OR sent a chat message in the last 30 days.
    const activeUserIds = new Set([
      ...(recentListings || []).map(l => l.seller_id).filter(Boolean),
      ...(recentMessages || []).map(m => m.sender_id).filter(Boolean),
    ]);

    // Region breakdown — bucket every listing's free-text address, cap to
    // the top N individually shown regions, fold the rest into "Other".
    const counts = {};
    (allListings || []).forEach(l => {
      const region = bucketAddress(l.address);
      counts[region] = (counts[region] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, REGION_CAP).filter(([name]) => name !== 'Other');
    const otherCount = sorted
      .filter(([name], i) => name === 'Other' || i >= REGION_CAP)
      .reduce((sum, [, c]) => sum + c, 0);
    const regions = top.map(([name, count]) => ({ name, count }));
    if (otherCount > 0) regions.push({ name: 'Other', count: otherCount });

    // Signup rate — bucket into the SIGNUP_WEEKS trailing weeks for the
    // sparkline, then derive 7d/30d rollups from the same fetched rows
    // (the window already covers 56 days, a superset of both).
    const weekly = weekStarts.map(ws => ({ week_start: ws.toISOString().slice(0, 10), count: 0 }));
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgoMs = Date.parse(thirtyDaysAgo);
    let signups7d = 0;
    let signups30d = 0;
    (recentSignups || []).forEach(p => {
      if (!p.created_at) return;
      const t = Date.parse(p.created_at);
      if (t >= sevenDaysAgo) signups7d++;
      if (t >= thirtyDaysAgoMs) signups30d++;
      const key = weekStartUTC(p.created_at).toISOString().slice(0, 10);
      const bucket = weekly.find(w => w.week_start === key);
      if (bucket) bucket.count++;
    });

    res.json({
      total_users: totalUsers || 0,
      active_users: activeUserIds.size,
      regions,
      signups: {
        last_7d: signups7d,
        last_30d: signups30d,
        weekly, // oldest → newest, Monday-start weeks, current week included (partial)
      },
    });
  } catch (err) { next(err); }
});

// ── Map-load ping (Session 9F) ────────────────────────────────
// POST /api/admin/map-load-ping
// Called once per Leaflet map init (browse map, home-location picker,
// post-listing picker, add-pin picker) by ANY logged-in user's browser —
// deliberately requireAuth only, not requireAdmin. Fire-and-forget from
// the frontend's side; this handler itself still responds normally so a
// slow/failed write never surfaces as a visible error to a regular user.
// Body: { surface: 'browse'|'home'|'post'|'addpin' }
router.post('/map-load-ping', requireAuth, async (req, res, next) => {
  try {
    const { surface } = req.body || {};
    logAuditEvent('map_load', req, req.user.id, { surface: surface || 'unknown' })
      .catch(err => console.error('map_load audit insert failed:', err.message));
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── Cost & Usage report (Session 9F) ──────────────────────────
// GET /api/admin/cost-report
// Last-7-days vs. trailing-4-week-average for each metric, %-change,
// a >30%-move flag, and a RULE-BASED (not LLM-generated) probable-cause
// line — deliberately deterministic/auditable for a financial figure.
// Anthropic's row uses the real Cost Admin API (true USD) when
// ANTHROPIC_ADMIN_KEY is configured; Mapbox's row is always a labeled
// ESTIMATE (see the constants above — Mapbox has no usage API at all).
// WhatsApp OTP row is simply absent until Session 9C's BSP is live and
// wired — not broken, just not here yet.
router.get('/cost-report', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const now = Date.now();
    const recentStart = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const baselineStart = new Date(now - 35 * 24 * 60 * 60 * 1000);
    const nowIso = new Date(now).toISOString();
    const recentStartIso = recentStart.toISOString();
    const baselineStartIso = baselineStart.toISOString();

    const [
      { count: signups7d, error: s7Err },
      { count: signupsBaseline, error: sbErr },
      { count: listings7d, error: l7Err },
      { count: listingsBaseline, error: lbErr },
      { count: mapPings7d, error: m7Err },
      { count: mapPingsBaseline, error: mbErr },
      anthropic7d,
      anthropicBaseline,
    ] = await Promise.all([
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', recentStartIso),
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', baselineStartIso).lt('created_at', recentStartIso),
      supabaseAdmin.from('listings').select('*', { count: 'exact', head: true }).gte('created_at', recentStartIso),
      supabaseAdmin.from('listings').select('*', { count: 'exact', head: true }).gte('created_at', baselineStartIso).lt('created_at', recentStartIso),
      supabaseAdmin.from('audit_log').select('*', { count: 'exact', head: true }).eq('event_type', 'map_load').gte('created_at', recentStartIso),
      supabaseAdmin.from('audit_log').select('*', { count: 'exact', head: true }).eq('event_type', 'map_load').gte('created_at', baselineStartIso).lt('created_at', recentStartIso),
      getAnthropicCostUsd(recentStartIso, nowIso),
      getAnthropicCostUsd(baselineStartIso, recentStartIso),
    ]);
    if (s7Err) return next(createError(s7Err.message));
    if (sbErr) return next(createError(sbErr.message));
    if (l7Err) return next(createError(l7Err.message));
    if (lbErr) return next(createError(lbErr.message));
    if (m7Err) return next(createError(m7Err.message));
    if (mbErr) return next(createError(mbErr.message));

    // baselineAvg = average per matching 7-day window across the trailing
    // 4 weeks (days 8-35 ago), so it's directly comparable to the last-7d
    // figure rather than a raw 28-day total.
    const weeklyAvg = (baselineTotal) => (baselineTotal || 0) / 4;
    const pctChange = (recent, baseline) => {
      if (!baseline) return recent > 0 ? 100 : 0;
      return ((recent - baseline) / baseline) * 100;
    };
    const round1 = n => Math.round(n * 10) / 10;
    const round2 = n => Math.round(n * 100) / 100;

    const metrics = [];

    // Signups
    {
      const baseline = weeklyAvg(signupsBaseline);
      const pct = pctChange(signups7d || 0, baseline);
      metrics.push({
        metric: 'Signups', last_7d: signups7d || 0, trailing_4wk_avg: round1(baseline),
        pct_change: round1(pct), flagged: Math.abs(pct) > 30,
        cause: pct > 30 ? 'Higher signup volume than the trailing average' : pct < -30 ? 'Lower signup volume than the trailing average' : '—',
        estimated: false,
      });
    }

    // Listings
    let listingsPct = 0;
    {
      const baseline = weeklyAvg(listingsBaseline);
      listingsPct = pctChange(listings7d || 0, baseline);
      metrics.push({
        metric: 'Listings', last_7d: listings7d || 0, trailing_4wk_avg: round1(baseline),
        pct_change: round1(listingsPct), flagged: Math.abs(listingsPct) > 30,
        cause: listingsPct > 30 ? 'Higher listing volume than the trailing average' : listingsPct < -30 ? 'Lower listing volume than the trailing average' : '—',
        estimated: false,
      });
    }

    // Anthropic $ (real, via Cost Admin API — absent if no admin key configured)
    if (anthropic7d == null || anthropicBaseline == null) {
      metrics.push({
        metric: 'Anthropic ($)', last_7d: null, trailing_4wk_avg: null,
        pct_change: null, flagged: false,
        cause: 'Admin API key not configured — see Session 9F build item 1',
        estimated: false, unavailable: true,
      });
    } else {
      const baseline = weeklyAvg(anthropicBaseline);
      const pct = pctChange(anthropic7d, baseline);
      // Rule-based cause: is the $ move roughly explained by listing-volume
      // change (Session 9E's moderation calls scale with listings), or did
      // cost move disproportionately (worth a closer look — e.g. a model
      // or prompt change)?
      let cause = '—';
      if (Math.abs(pct) > 30) {
        cause = Math.abs(pct - listingsPct) <= 15
          ? 'Roughly tracks listing volume change'
          : 'Cost moved independently of listing volume — check for a model or prompt change';
      }
      metrics.push({
        metric: 'Anthropic ($)', last_7d: round2(anthropic7d), trailing_4wk_avg: round2(baseline),
        pct_change: round1(pct), flagged: Math.abs(pct) > 30, cause, estimated: false,
      });
    }

    // Mapbox $ (ESTIMATE — see constants above; always labeled as such)
    {
      const pingsToUsd = pings => (pings * MAPBOX_TILES_PER_PING / 1000) * MAPBOX_RATE_PER_1000;
      const recentUsd = pingsToUsd(mapPings7d || 0);
      const baselineUsd = weeklyAvg(pingsToUsd(mapPingsBaseline || 0));
      const pct = pctChange(recentUsd, baselineUsd);
      metrics.push({
        metric: 'Mapbox ($, estimated)', last_7d: round2(recentUsd), trailing_4wk_avg: round2(baselineUsd),
        pct_change: round1(pct), flagged: Math.abs(pct) > 30,
        cause: Math.abs(pct) > 30 ? 'Tracks map-load ping volume (estimate — not a real invoice figure)' : '—',
        estimated: true,
      });
    }

    // WhatsApp OTP row deliberately absent — Session 9C's BSP isn't live yet.

    res.json({
      metrics,
      quick_links: [
        { label: 'Anthropic Console — Usage', url: 'https://console.anthropic.com/settings/usage' },
        { label: 'Anthropic Console — Cost', url: 'https://console.anthropic.com/settings/cost' },
        { label: 'Mapbox — Statistics', url: 'https://account.mapbox.com/statistics/' },
      ],
    });
  } catch (err) { next(err); }
});

module.exports = router;
