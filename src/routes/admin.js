// ============================================================
// Admin Overview Routes — admin-only
// GET /api/admin/overview — total users, active users (30d), region
// breakdown, and signup-rate (7d/30d + 8-week trend, for sizing the
// planned phone-OTP SMS volume against real data instead of guesses)
// ============================================================
// Cross-cutting metrics (users + listings + chat), so it lives in its own
// file rather than being bolted onto users.js or listings.js.
const express          = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { createError }  = require('../middleware/errorHandler');
const { bucketAddress } = require('../utils/bangaloreAreas');

const router = express.Router();

const REGION_CAP = 6;  // top N regions shown individually; the rest collapse into "Other"
const SIGNUP_WEEKS = 8; // trailing weeks shown in the signup sparkline

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

module.exports = router;
