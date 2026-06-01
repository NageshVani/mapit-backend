// ============================================================
// Messages Routes — Chat between buyers and sellers
// GET  /api/messages/inbox        — all conversations for user
// GET  /api/messages/:listing_id/:other_user_id — get thread
// POST /api/messages              — send a message
// PUT  /api/messages/:id/read     — mark message as read
// ============================================================
const express         = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');
const { createError } = require('../middleware/errorHandler');

const router = express.Router();

// ── Get inbox (all conversations) ────────────────────────────
// GET /api/messages/inbox
router.get('/inbox', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Get the latest message per (listing_id, other_user) conversation
    const { data: messages, error } = await supabaseAdmin
      .from('messages')
      .select(`
        id, listing_id, sender_id, receiver_id, content, is_read, sent_at,
        listings(id, title, price_label, category, status),
        sender:profiles!sender_id(id, full_name, avatar_color),
        receiver:profiles!receiver_id(id, full_name, avatar_color)
      `)
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('sent_at', { ascending: false });

    if (error) return next(createError(error.message));

    // Group by listing + other user to get unique conversations
    const conversationMap = new Map();
    (messages || []).forEach(msg => {
      const otherId  = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
      const key      = `${msg.listing_id}__${otherId}`;
      if (!conversationMap.has(key)) {
        conversationMap.set(key, {
          listing:      msg.listings,
          other_user:   msg.sender_id === userId ? msg.receiver : msg.sender,
          last_message: { content: msg.content, sent_at: msg.sent_at, is_read: msg.is_read },
          unread_count: (!msg.is_read && msg.receiver_id === userId) ? 1 : 0,
        });
      } else if (!msg.is_read && msg.receiver_id === userId) {
        conversationMap.get(key).unread_count++;
      }
    });

    res.json({ conversations: Array.from(conversationMap.values()) });
  } catch (err) { next(err); }
});

// ── Get message thread ────────────────────────────────────────
// GET /api/messages/:listing_id/:other_user_id
router.get('/:listing_id/:other_user_id', requireAuth, async (req, res, next) => {
  try {
    const { listing_id, other_user_id } = req.params;
    const userId = req.user.id;

    const { data: messages, error } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('listing_id', listing_id)
      .or(
        `and(sender_id.eq.${userId},receiver_id.eq.${other_user_id}),` +
        `and(sender_id.eq.${other_user_id},receiver_id.eq.${userId})`
      )
      .order('sent_at', { ascending: true });

    if (error) return next(createError(error.message));

    // Mark unread messages as read
    const unreadIds = (messages || [])
      .filter(m => !m.is_read && m.receiver_id === userId)
      .map(m => m.id);

    if (unreadIds.length > 0) {
      await supabaseAdmin
        .from('messages')
        .update({ is_read: true })
        .in('id', unreadIds);
    }

    // Get the other user's profile
    const { data: otherUser } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, trust_badge, avg_rating, avatar_color')
      .eq('id', other_user_id)
      .single();

    res.json({ messages: messages || [], other_user: otherUser || null });
  } catch (err) { next(err); }
});

// ── Send a message ────────────────────────────────────────────
// POST /api/messages
// Body: { receiver_id, content, listing_id? }
// listing_id is optional — omit for admin feedback replies
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { listing_id, receiver_id, content } = req.body;

    if (!receiver_id || !content) {
      return next(createError('receiver_id and content are required.'));
    }
    if (content.trim().length === 0) return next(createError('Message cannot be empty.'));
    if (content.length > 500) return next(createError('Message must be 500 characters or less.'));
    if (receiver_id === req.user.id) return next(createError('You cannot message yourself.'));

    // Listing validation — only when listing_id is provided
    if (listing_id) {
      const { data: listing } = await supabaseAdmin
        .from('listings')
        .select('id, status, seller_id')
        .eq('id', listing_id)
        .single();

      if (!listing) return next(createError('Listing not found.', 404));
      if (listing.status === 'sold') {
        return next(createError('This listing has already been sold.'));
      }

      // Increment inquiry count for first message from buyer
      if (req.user.id !== listing.seller_id) {
        const { count } = await supabaseAdmin
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('listing_id', listing_id)
          .eq('sender_id', req.user.id);

        if (count === 0) {
          const { data: cur } = await supabaseAdmin
            .from('listings')
            .select('inquiry_count')
            .eq('id', listing_id)
            .single()
            .catch(() => ({ data: null }));
          if (cur) {
            await supabaseAdmin
              .from('listings')
              .update({ inquiry_count: (cur.inquiry_count || 0) + 1 })
              .eq('id', listing_id)
              .catch(() => {});
          }
        }
      }
    }

    const { data: message, error } = await supabaseAdmin
      .from('messages')
      .insert({
        listing_id,
        sender_id:   req.user.id,
        receiver_id,
        content:     content.trim(),
      })
      .select()
      .single();

    if (error) return next(createError(error.message));

    res.status(201).json({ message });
  } catch (err) { next(err); }
});

// ── Mark message as read ──────────────────────────────────────
// PUT /api/messages/:id/read
router.put('/:id/read', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: msg } = await supabaseAdmin
      .from('messages')
      .select('receiver_id')
      .eq('id', id)
      .single();

    if (!msg) return next(createError('Message not found.', 404));
    if (msg.receiver_id !== req.user.id) {
      return next(createError('You can only mark your own received messages as read.', 403));
    }

    await supabaseAdmin
      .from('messages')
      .update({ is_read: true })
      .eq('id', id);

    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
