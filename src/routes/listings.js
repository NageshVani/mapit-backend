// ============================================================
// Listings Routes
// GET    /api/listings           — get listings (with radius filter)
// GET    /api/listings/:id       — get single listing with photos + seller
// POST   /api/listings           — create new listing
// PUT    /api/listings/:id       — update listing
// DELETE /api/listings/:id       — delete listing
// PUT    /api/listings/:id/sold  — mark as sold
// GET    /api/listings/mine      — get current user's own listings
// POST   /api/listings/:id/save  — save/unsave a listing (toggle)
// GET    /api/listings/saved     — get user's saved listings
// POST   /api/listings/:id/view  — increment view count
// POST   /api/listings/:id/feedback — submit feedback on a listing
// ============================================================
const express         = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');
const { createError } = require('../middleware/errorHandler');

const router = express.Router();

// Valid categories and statuses
const VALID_CATEGORIES = ['re', 'veh', 'hh', 'furn', 'electronics']; // furn kept for legacy data
const VALID_STATUSES   = ['active', 'sold', 'expired'];

// ── GET pending listings (admin review) ──────────────────────
// GET /api/listings/pending/all
router.get('/pending/all', requireAuth, async (req, res, next) => {
  try {
    const { data: listings, error } = await supabaseAdmin
      .from('listings')
      .select('*, profiles(full_name, avatar_color)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) return next(createError(error.message));
    res.json({ listings: listings || [] });
  } catch (err) { next(err); }
});

// ── Approve listing (admin) ───────────────────────────────────
// PUT /api/listings/:id/approve
router.put('/:id/approve', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data: listing, error } = await supabaseAdmin
      .from('listings')
      .update({ status: 'active' })
      .eq('id', id)
      .select()
      .single();
    if (error) return next(createError(error.message));
    res.json({ listing, message: 'Listing approved and is now live.' });
  } catch (err) { next(err); }
});

// ── GET listings with radius filter ──────────────────────────
// GET /api/listings?lat=12.93&lng=77.62&radius=5000&category=re&subcategory=Buy&q=flat
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const {
      lat, lng,
      radius    = 5000,   // metres — default 5 km
      category,
      subcategory,
      q,                  // search query
      limit     = 50,
      offset    = 0,
    } = req.query;

    let listings;

    if (lat && lng) {
      // Use PostGIS proximity search
      const { data, error } = await supabaseAdmin.rpc('listings_within_radius', {
        user_lat:  parseFloat(lat),
        user_lng:  parseFloat(lng),
        radius_m:  parseInt(radius) >= 999000 ? 999000 : parseInt(radius),
      });

      if (error) return next(createError(error.message));
      listings = data || [];
    } else {
      // No location — return all active listings
      const { data, error } = await supabaseAdmin
        .from('listings')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) return next(createError(error.message));
      listings = data || [];
    }

    // Apply filters in-memory after PostGIS query
    if (category && category !== 'all') {
      listings = listings.filter(l => l.category === category);
    }
    if (subcategory && subcategory !== 'All Types') {
      listings = listings.filter(l => l.subcategory === subcategory);
    }
    if (q) {
      const ql = q.toLowerCase();
      listings = listings.filter(l =>
        l.title?.toLowerCase().includes(ql) ||
        l.address?.toLowerCase().includes(ql) ||
        l.subcategory?.toLowerCase().includes(ql)
      );
    }

    // Paginate
    const total     = listings.length;
    const paginated = listings.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    // Get photos for each listing (cover photo only for list view)
    const listingIds = paginated.map(l => l.id);
    let photosMap = {};
    if (listingIds.length > 0) {
      const { data: photos } = await supabaseAdmin
        .from('listing_photos')
        .select('listing_id, public_url, sort_order')
        .in('listing_id', listingIds)
        .eq('sort_order', 0);

      (photos || []).forEach(p => { photosMap[p.listing_id] = p.public_url; });
    }

    // Get seller profiles
    const sellerIds = [...new Set(paginated.map(l => l.seller_id))];
    let sellersMap = {};
    if (sellerIds.length > 0) {
      const { data: sellers } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, trust_badge, avg_rating, review_count, avatar_color')
        .in('id', sellerIds);

      (sellers || []).forEach(s => { sellersMap[s.id] = s; });
    }

    // Compose response
    const result = paginated.map(l => ({
      ...l,
      cover_photo: photosMap[l.id] || null,
      seller:      sellersMap[l.seller_id] || null,
    }));

    res.json({ listings: result, total, limit: parseInt(limit), offset: parseInt(offset) });
  } catch (err) { next(err); }
});

// ── My listings ───────────────────────────────────────────────
// GET /api/listings/mine/all
router.get('/mine/all', requireAuth, async (req, res, next) => {
  try {
    const { status } = req.query;

    let query = supabaseAdmin
      .from('listings')
      .select('*')
      .eq('seller_id', req.user.id)
      .order('created_at', { ascending: false });

    if (status && VALID_STATUSES.includes(status)) {
      query = query.eq('status', status);
    }

    const { data: listings, error } = await query;
    if (error) return next(createError(error.message));

    res.json({ listings: listings || [] });
  } catch (err) { next(err); }
});

// ── Get saved listings ────────────────────────────────────────
// GET /api/listings/saved/all
router.get('/saved/all', requireAuth, async (req, res, next) => {
  try {
    const { data: saved, error } = await supabaseAdmin
      .from('saved_listings')
      .select('listing_id, saved_at, listings(*)')
      .eq('user_id', req.user.id)
      .order('saved_at', { ascending: false });

    if (error) return next(createError(error.message));

    const listings = (saved || []).map(s => ({
      ...s.listings,
      saved_at: s.saved_at,
    }));

    res.json({ listings });
  } catch (err) { next(err); }
});

// ── GET single listing ────────────────────────────────────────
// GET /api/listings/:id
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: listing, error } = await supabaseAdmin
      .from('listings')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !listing) return next(createError('Listing not found.', 404));

    // Photos (all, sorted)
    const { data: photos } = await supabaseAdmin
      .from('listing_photos')
      .select('*')
      .eq('listing_id', id)
      .order('sort_order');

    // Seller profile
    const { data: seller } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, trust_badge, avg_rating, review_count, avatar_color, created_at')
      .eq('id', listing.seller_id)
      .single();

    // Is this listing saved by the current user?
    const { data: saved } = await supabaseAdmin
      .from('saved_listings')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('listing_id', id)
      .maybeSingle();

    res.json({
      listing: {
        ...listing,
        photos: photos || [],
        seller: seller || null,
        is_saved: !!saved,
      },
    });
  } catch (err) { next(err); }
});

// ── POST create listing ───────────────────────────────────────
// POST /api/listings
// Body: { category, subcategory, title, description, price, price_label,
//         lat, lng, address, specs, details }
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const {
      category, subcategory, title, description,
      price, price_label,
      lat, lng, address, specs, details,
    } = req.body;

    // Validation
    if (!category || !subcategory || !title || !lat || !lng) {
      return next(createError('category, subcategory, title, lat and lng are required.'));
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return next(createError(`Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`));
    }
    if (title.length > 80) return next(createError('Title must be 80 characters or less.'));
    if (price && parseFloat(price) < 0) return next(createError('Price cannot be negative.'));

    const { data: listing, error } = await supabaseAdmin
      .from('listings')
      .insert({
        seller_id:   req.user.id,
        category,
        subcategory,
        title:       title.trim(),
        description: description?.trim() || null,
        price:       parseFloat(price) || 0,
        price_label: price_label?.trim() || null,
        lat:         parseFloat(lat),
        lng:         parseFloat(lng),
        address:     address?.trim() || null,
        specs:       specs || [],
        details:     details || {},
        status:      'pending', // goes to verification queue
      })
      .select()
      .single();

    if (error) return next(createError(error.message));

    res.status(201).json({ listing, message: 'Listing submitted for review. It will go live within 4 hours.' });
  } catch (err) { next(err); }
});

// ── PUT update listing ────────────────────────────────────────
// PUT /api/listings/:id
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Ensure listing belongs to current user
    const { data: existing } = await supabaseAdmin
      .from('listings')
      .select('seller_id')
      .eq('id', id)
      .single();

    if (!existing) return next(createError('Listing not found.', 404));
    if (existing.seller_id !== req.user.id) {
      return next(createError('You can only edit your own listings.', 403));
    }

    const allowedFields = [
      'title', 'description', 'price', 'price_label',
      'condition', 'address', 'specs',
    ];
    const updates = {};
    allowedFields.forEach(f => {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    });

    if (Object.keys(updates).length === 0) {
      return next(createError('No valid fields to update.'));
    }

    const { data: listing, error } = await supabaseAdmin
      .from('listings')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return next(createError(error.message));

    res.json({ listing });
  } catch (err) { next(err); }
});

// ── DELETE listing ────────────────────────────────────────────
// DELETE /api/listings/:id
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: existing } = await supabaseAdmin
      .from('listings')
      .select('seller_id')
      .eq('id', id)
      .single();

    if (!existing) return next(createError('Listing not found.', 404));
    if (existing.seller_id !== req.user.id) {
      return next(createError('You can only delete your own listings.', 403));
    }

    const { error } = await supabaseAdmin
      .from('listings')
      .delete()
      .eq('id', id);

    if (error) return next(createError(error.message));

    res.json({ message: 'Listing deleted successfully.' });
  } catch (err) { next(err); }
});

// ── Mark as sold ──────────────────────────────────────────────
// PUT /api/listings/:id/sold
router.put('/:id/sold', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { agreed_price, buyer_id } = req.body;

    const { data: existing } = await supabaseAdmin
      .from('listings')
      .select('seller_id, price')
      .eq('id', id)
      .single();

    if (!existing) return next(createError('Listing not found.', 404));
    if (existing.seller_id !== req.user.id) {
      return next(createError('Only the seller can mark this as sold.', 403));
    }

    // Update listing status
    const { data: listing, error } = await supabaseAdmin
      .from('listings')
      .update({ status: 'sold' })
      .eq('id', id)
      .select()
      .single();

    if (error) return next(createError(error.message));

    // Create transaction record
    if (buyer_id) {
      await supabaseAdmin.from('transactions').insert({
        listing_id:     id,
        buyer_id,
        seller_id:      req.user.id,
        original_price: existing.price,
        agreed_price:   agreed_price ? parseFloat(agreed_price) : null,
        status:        'completed',
        completed_at:   new Date().toISOString(),
      });
    }

    res.json({ listing, message: 'Listing marked as sold.' });
  } catch (err) { next(err); }
});

// ── My listings ───────────────────────────────────────────────
// ── Save / unsave listing ─────────────────────────────────────
// POST /api/listings/:id/save  (toggles)
router.post('/:id/save', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if already saved
    const { data: existing } = await supabaseAdmin
      .from('saved_listings')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('listing_id', id)
      .maybeSingle();

    if (existing) {
      // Unsave
      await supabaseAdmin.from('saved_listings').delete().eq('id', existing.id);
      return res.json({ saved: false, message: 'Listing removed from saved.' });
    } else {
      // Save
      await supabaseAdmin.from('saved_listings').insert({
        user_id:    req.user.id,
        listing_id: id,
      });
      return res.json({ saved: true, message: 'Listing saved to favourites.' });
    }
  } catch (err) { next(err); }
});

// ── Increment view count ──────────────────────────────────────
// POST /api/listings/:id/view
router.post('/:id/view', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    await supabaseAdmin.rpc('increment_view_count', { listing_id: id }).catch(() => {
      // Fallback if RPC not available
      supabaseAdmin
        .from('listings')
        .select('view_count')
        .eq('id', id)
        .single()
        .then(({ data }) => {
          if (data) {
            supabaseAdmin
              .from('listings')
              .update({ view_count: (data.view_count || 0) + 1 })
              .eq('id', id);
          }
        });
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
