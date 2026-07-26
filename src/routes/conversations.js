// ============================================================
// Conversations Routes — real-time chat (Session 6)
// GET  /api/conversations                — all conversations for user, with last message + unread count
// POST /api/conversations                — get-or-create a conversation for a listing
// GET  /api/conversations/:id/messages   — full message history for a conversation (marks unread as read)
// POST /api/conversations/:id/messages   — send a message
// All writes go through supabaseAdmin (service role) — RLS on conversations/
// chat_messages exists as defense-in-depth and is the real boundary only for
// the browser's direct Realtime subscription (never for these REST routes).
// ============================================================
const express            = require('express');
const { supabaseAdmin }  = require('../config/supabase');
const { requireAuth }    = require('../middleware/auth');
const { createError }    = require('../middleware/errorHandler');
const { scoreAndNotify } = require('../utils/notifySeller');

const router = express.Router();

// ── List conversations for the current user ───────────────────
// GET /api/conversations
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;

    const { data: conversations, error } = await supabaseAdmin
      .from('conversations')
      .select(`
        id, listing_id, buyer_id, seller_id, created_at,
        listings(id, title, price_label, status),
        buyer:profiles!buyer_id(id, nickname, full_name, avatar_color),
        seller:profiles!seller_id(id, nickname, full_name, avatar_color)
      `)
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error) return next(createError(error.message));

    const convIds = (conversations || []).map(c => c.id);
    let messagesByConv = new Map();
    if (convIds.length > 0) {
      const { data: allMessages, error: msgErr } = await supabaseAdmin
        .from('chat_messages')
        .select('id, conversation_id, sender_id, content, sent_at, read_at')
        .in('conversation_id', convIds)
        .order('sent_at', { ascending: false });

      if (msgErr) return next(createError(msgErr.message));

      (allMessages || []).forEach(m => {
        if (!messagesByConv.has(m.conversation_id)) messagesByConv.set(m.conversation_id, []);
        messagesByConv.get(m.conversation_id).push(m);
      });
    }

    const result = (conversations || []).map(c => {
      const msgs = messagesByConv.get(c.id) || [];
      const unread_count = msgs.filter(m => m.sender_id !== userId && !m.read_at).length;
      const otherUser = c.buyer_id === userId ? c.seller : c.buyer;
      return {
        id: c.id,
        listing_id: c.listing_id,
        buyer_id: c.buyer_id,
        listing: c.listings,
        other_user: otherUser,
        last_message: msgs[0] ? { content: msgs[0].content, sent_at: msgs[0].sent_at } : null,
        unread_count,
      };
    });

    res.json({ conversations: result });
  } catch (err) { next(err); }
});

// ── Get-or-create a conversation for a listing ─────────────────
// POST /api/conversations
// Body: { listing_id }
// Always called by the buyer — sellers reach an existing conversation via the inbox.
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { listing_id } = req.body;
    if (!listing_id) return next(createError('listing_id is required.'));

    const { data: listing } = await supabaseAdmin
      .from('listings')
      .select('id, seller_id, title, status')
      .eq('id', listing_id)
      .single();

    if (!listing) return next(createError('Listing not found.', 404));
    if (listing.seller_id === req.user.id) {
      return next(createError('You cannot start a conversation on your own listing.'));
    }

    const { data: existing } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('listing_id', listing_id)
      .eq('buyer_id', req.user.id)
      .eq('seller_id', listing.seller_id)
      .maybeSingle();

    if (existing) return res.json({ conversation: existing });

    const { data: created, error } = await supabaseAdmin
      .from('conversations')
      .insert({ listing_id, buyer_id: req.user.id, seller_id: listing.seller_id })
      .select()
      .single();

    if (error) return next(createError(error.message));

    res.status(201).json({ conversation: created });
  } catch (err) { next(err); }
});

// ── Helper: load a conversation and verify the requester is a participant ──
async function loadParticipantConversation(conversationId, userId) {
  const { data: conversation } = await supabaseAdmin
    .from('conversations')
    .select('id, listing_id, buyer_id, seller_id')
    .eq('id', conversationId)
    .single();

  if (!conversation) return { error: createError('Conversation not found.', 404) };
  if (conversation.buyer_id !== userId && conversation.seller_id !== userId) {
    return { error: createError('You are not a participant in this conversation.', 403) };
  }
  return { conversation };
}

// ── Get message history for a conversation ─────────────────────
// GET /api/conversations/:id/messages
router.get('/:id/messages', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { conversation, error: participantError } = await loadParticipantConversation(id, req.user.id);
    if (participantError) return next(participantError);

    const { data: messages, error } = await supabaseAdmin
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', id)
      .order('sent_at', { ascending: true });

    if (error) return next(createError(error.message));

    const unreadIds = (messages || [])
      .filter(m => m.sender_id !== req.user.id && !m.read_at)
      .map(m => m.id);

    if (unreadIds.length > 0) {
      await supabaseAdmin
        .from('chat_messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', unreadIds);
    }

    res.json({ messages: messages || [], conversation });
  } catch (err) { next(err); }
});

// ── Send a message ──────────────────────────────────────────────
// POST /api/conversations/:id/messages
// Body: { content }
router.post('/:id/messages', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) return next(createError('Message cannot be empty.'));
    if (content.length > 500) return next(createError('Message must be 500 characters or less.'));

    const { conversation, error: participantError } = await loadParticipantConversation(id, req.user.id);
    if (participantError) return next(participantError);

    const { count: priorCount } = await supabaseAdmin
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', id);
    const isFirstMessage = priorCount === 0;

    const { data: message, error } = await supabaseAdmin
      .from('chat_messages')
      .insert({ conversation_id: id, sender_id: req.user.id, content: content.trim() })
      .select()
      .single();

    if (error) return next(createError(error.message));

    // Fire-and-forget: never block or fail the response on scoring/email errors.
    // Only the buyer's first message on a listing triggers the seller notification.
    if (isFirstMessage && conversation.buyer_id === req.user.id) {
      const { data: listing } = await supabaseAdmin
        .from('listings')
        .select('id, seller_id, title')
        .eq('id', conversation.listing_id)
        .single();
      if (listing) {
        scoreAndNotify(listing, req.user.id, content.trim())
          .catch(err => console.error('Lead scoring/notification pipeline failed:', err.message));
      }
    }

    res.status(201).json({ message });
  } catch (err) { next(err); }
});

module.exports = router;
