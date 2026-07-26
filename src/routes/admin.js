// ============================================================
// Admin Overview Routes — admin-only
// GET /api/admin/overview — total users, active users (30d), region breakdown
// ============================================================
// Cross-cutting metrics (users + listings + chat), so it lives in its own
// file rather than being bolted onto users.js or listings.js.
const express          = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { createError }  = require('../middleware/errorHandler');
const { bucketAddress } = require('../utils/bangaloreAreas');

const router = express.Router();

const REGION_CAP = 6; // top N regions shown individually; the rest collapse into "Other"

router.get('/overview', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      { count: totalUsers, error: usersErr },
      { data: recentListings, error: listingsErr },
      { data: recentMessages, error: messagesErr },
      { data: allListings, error: addrErr },
    ] = await Promise.all([
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('listings').select('seller_id').gte('created_at', thirtyDaysAgo),
      supabaseAdmin.from('chat_messages').select('sender_id').gte('sent_at', thirtyDaysAgo),
      supabaseAdmin.from('listings').select('address'),
    ]);

    if (usersErr)    return next(createError(usersErr.message));
    if (listingsErr) return next(createError(listingsErr.message));
    if (messagesErr) return next(createError(messagesErr.message));
    if (addrErr)      return next(createError(addrErr.message));

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

    res.json({
      total_users: totalUsers || 0,
      active_users: activeUserIds.size,
      regions,
    });
  } catch (err) { next(err); }
});

module.exports = router;
