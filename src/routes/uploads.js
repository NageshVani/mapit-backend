// ============================================================
// Upload Routes — Listing photos to Supabase Storage
// POST /api/uploads/listing/:listing_id  — upload photos
// DELETE /api/uploads/photo/:photo_id    — delete a photo
// PUT  /api/uploads/photo/:photo_id/order — reorder photos
// ============================================================
const express         = require('express');
const multer          = require('multer');
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');
const { createError } = require('../middleware/errorHandler');

const router = express.Router();

// Multer: store file in memory (we stream to Supabase)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_PHOTO_SIZE) || 5 * 1024 * 1024, // 5MB
    files:    parseInt(process.env.MAX_PHOTOS_PER_LISTING) || 5,
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, WebP and HEIC images are allowed.'));
    }
  },
});

// ── Upload photos for a listing ───────────────────────────────
// POST /api/uploads/listing/:listing_id
// Form-data: photos[] (multiple files)
router.post('/listing/:listing_id', requireAuth, upload.array('photos', 5), async (req, res, next) => {
  try {
    const { listing_id } = req.params;
    const files = req.files;

    if (!files || files.length === 0) {
      return next(createError('No photos uploaded. Send files in the "photos" field.'));
    }

    // Verify listing belongs to current user
    const { data: listing } = await supabaseAdmin
      .from('listings')
      .select('seller_id')
      .eq('id', listing_id)
      .single();

    if (!listing) return next(createError('Listing not found.', 404));
    if (listing.seller_id !== req.user.id) {
      return next(createError('You can only upload photos to your own listings.', 403));
    }

    // Check existing photo count
    const { count: existingCount } = await supabaseAdmin
      .from('listing_photos')
      .select('*', { count: 'exact', head: true })
      .eq('listing_id', listing_id);

    const maxPhotos = parseInt(process.env.MAX_PHOTOS_PER_LISTING) || 5;
    if ((existingCount || 0) + files.length > maxPhotos) {
      return next(createError(`Maximum ${maxPhotos} photos per listing. You already have ${existingCount}.`));
    }

    const bucket  = process.env.STORAGE_BUCKET || 'listing-photos';
    const results = [];

    for (let i = 0; i < files.length; i++) {
      const file      = files[i];
      const ext       = file.originalname.split('.').pop().toLowerCase();
      const filename  = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const storagePath = `${req.user.id}/${listing_id}/${filename}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabaseAdmin.storage
        .from(bucket)
        .upload(storagePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError.message);
        continue; // skip failed uploads
      }

      // Get public URL
      const { data: urlData } = supabaseAdmin.storage
        .from(bucket)
        .getPublicUrl(storagePath);

      // Save to database
      const { data: photo } = await supabaseAdmin
        .from('listing_photos')
        .insert({
          listing_id,
          storage_path: storagePath,
          public_url:   urlData.publicUrl,
          sort_order:   (existingCount || 0) + i,
        })
        .select()
        .single();

      if (photo) results.push(photo);
    }

    if (results.length === 0) {
      return next(createError('All uploads failed. Please try again.'));
    }

    res.status(201).json({
      photos:  results,
      message: `${results.length} photo(s) uploaded successfully.`,
    });
  } catch (err) {
    // Handle multer errors
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(createError('File too large. Maximum size is 5MB per photo.'));
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return next(createError('Too many files. Maximum 5 photos per upload.'));
    }
    next(err);
  }
});

// ── Delete a photo ────────────────────────────────────────────
// DELETE /api/uploads/photo/:photo_id
router.delete('/photo/:photo_id', requireAuth, async (req, res, next) => {
  try {
    const { photo_id } = req.params;

    // Get photo + check ownership
    const { data: photo } = await supabaseAdmin
      .from('listing_photos')
      .select('*, listings(seller_id)')
      .eq('id', photo_id)
      .single();

    if (!photo) return next(createError('Photo not found.', 404));
    if (photo.listings.seller_id !== req.user.id) {
      return next(createError('You can only delete photos from your own listings.', 403));
    }

    // Delete from storage
    const bucket = process.env.STORAGE_BUCKET || 'listing-photos';
    await supabaseAdmin.storage.from(bucket).remove([photo.storage_path]);

    // Delete from database
    await supabaseAdmin.from('listing_photos').delete().eq('id', photo_id);

    res.json({ message: 'Photo deleted successfully.' });
  } catch (err) { next(err); }
});

// ── Reorder photos ────────────────────────────────────────────
// PUT /api/uploads/photo/:photo_id/order
// Body: { sort_order }
router.put('/photo/:photo_id/order', requireAuth, async (req, res, next) => {
  try {
    const { photo_id }  = req.params;
    const { sort_order } = req.body;

    if (sort_order === undefined || isNaN(parseInt(sort_order))) {
      return next(createError('sort_order must be a number.'));
    }

    const { data: photo } = await supabaseAdmin
      .from('listing_photos')
      .select('*, listings(seller_id)')
      .eq('id', photo_id)
      .single();

    if (!photo) return next(createError('Photo not found.', 404));
    if (photo.listings.seller_id !== req.user.id) {
      return next(createError('You can only reorder photos on your own listings.', 403));
    }

    const { data: updated, error } = await supabaseAdmin
      .from('listing_photos')
      .update({ sort_order: parseInt(sort_order) })
      .eq('id', photo_id)
      .select()
      .single();

    if (error) return next(createError(error.message));

    res.json({ photo: updated });
  } catch (err) { next(err); }
});

module.exports = router;
