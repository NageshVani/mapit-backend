// ============================================================
// IT Rules 2021 compliance audit log — fire-and-forget event capture
// ============================================================
// Writes to audit_log (migration 014). Rule 8: never log PII to console —
// this module writes IP/user-agent to the DB row itself, never to stdout.
// Fire-and-forget by design, same pattern as notifySeller.js: a logging
// failure must never fail the request it's attached to.
const { supabaseAdmin } = require('../config/supabase');

// eventType: 'signup' | 'login' | 'listing_created' | 'message_sent'
async function logAuditEvent(eventType, req, userId, metadata = null) {
  try {
    await supabaseAdmin.from('audit_log').insert({
      event_type: eventType,
      user_id:    userId || null,
      ip_address: req.ip || null,
      user_agent: req.headers['user-agent'] || null,
      metadata,
    });
  } catch (err) {
    console.error(`audit_log insert failed for event "${eventType}":`, err.message);
  }
}

module.exports = { logAuditEvent };
