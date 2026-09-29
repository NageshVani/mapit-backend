// ============================================================
// Anthropic Cost Report — thin wrapper around the Admin API's
// GET /v1/organizations/cost_report (Session 9F).
//
// Uses a SEPARATE credential from the main ANTHROPIC_API_KEY used by
// contentModeration.js/feedbackDraft.js/leadScoring.js — this is an
// Admin API key (sk-ant-admin...), org-management only, never sends
// messages. Requires an Organization to exist in Anthropic Console
// (Session 9F build item 1, Nagesh's account-level task, not yet done
// as of this file's writing) — until ANTHROPIC_ADMIN_KEY is set, every
// function here fails open to `null`, same fail-open convention as the
// other Claude-backed utilities in this app, so the rest of the Cost &
// Usage tab still renders.
//
// No SDK: the Usage & Cost Admin API is explicitly raw-HTTP-only, not
// wrapped by any Anthropic SDK (confirmed via the API's own docs) — so
// this is the one Claude-related integration in this app where raw
// fetch isn't a style choice, it's the only option.
// ============================================================
const ANTHROPIC_COST_URL = 'https://api.anthropic.com/v1/organizations/cost_report';
const TIMEOUT_MS = 8000; // awaited directly by the admin's page load — bounded, but not as tight as the fire-and-forget scoring calls

// getAnthropicCostUsd(startISO, endISO) sums every cost bucket's `amount`
// (returned in cents as a decimal string, per Anthropic's own docs) across
// the given window and returns the total in USD, or null on any failure
// (missing key, network error, timeout, non-2xx, unparseable response) —
// the caller (src/routes/admin.js) shows "Admin API key not configured /
// unavailable" instead of a number when this returns null.
async function getAnthropicCostUsd(startISO, endISO) {
  if (!process.env.ANTHROPIC_ADMIN_KEY) {
    console.warn('ANTHROPIC_ADMIN_KEY not set — Anthropic cost row unavailable');
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let totalCents = 0;
    let page = null;
    // Bounded by construction: callers only ever request <=31-day windows
    // (the Cost API's own per-request max), so this loop runs once in
    // practice — the has_more/next_page handling is defensive, not load-bearing.
    do {
      const params = new URLSearchParams({ starting_at: startISO, ending_at: endISO, limit: '31' });
      if (page) params.set('page', page);
      const res = await fetch(`${ANTHROPIC_COST_URL}?${params.toString()}`, {
        headers: {
          'x-api-key': process.env.ANTHROPIC_ADMIN_KEY,
          'anthropic-version': '2023-06-01',
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(`Anthropic Cost API error ${res.status}: ${body}`);
        return null;
      }

      const data = await res.json();
      (data?.data || []).forEach(bucket => {
        (bucket?.results || []).forEach(item => {
          const cents = parseFloat(item?.amount);
          if (!Number.isNaN(cents)) totalCents += cents;
        });
      });
      page = data?.has_more ? data?.next_page : null;
    } while (page);

    return totalCents / 100;
  } catch (err) {
    console.error('Anthropic cost report fetch failed:', err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { getAnthropicCostUsd };
