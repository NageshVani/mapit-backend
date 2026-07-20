// ============================================================
// MapIt Backend — Main Server
// ============================================================
// Polyfill for Node.js < 18 without built-in fetch API
if (!globalThis.fetch) {
  const nodeFetch = require('node-fetch');
  globalThis.fetch = nodeFetch;
  globalThis.Headers = nodeFetch.Headers;
  globalThis.Request = nodeFetch.Request;
  globalThis.Response = nodeFetch.Response;
}

// WebSocket polyfill for Node.js < 22
if (!globalThis.WebSocket) {
  try {
    globalThis.WebSocket = require('ws');
  } catch (e) {
    // ws not installed, will fail later if needed
  }
}

require('dotenv').config();
const Sentry = require('@sentry/node');

// Sentry must init before the rest of the app so it can instrument everything
// that follows. Without SENTRY_DSN (e.g. local dev) the SDK no-ops silently —
// same fail-open pattern as the other optional integrations in this app.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  sendDefaultPii: false, // Rule 8: never send PII (emails, phone numbers, cookies) to a third party
});

const path       = require('path');
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');

const authRoutes         = require('./routes/auth');
const listingRoutes      = require('./routes/listings');
const pinRoutes          = require('./routes/pins');
const messageRoutes      = require('./routes/messages');
const conversationRoutes = require('./routes/conversations');
const userRoutes         = require('./routes/users');
const uploadRoutes       = require('./routes/uploads');
const { errorHandler } = require('./middleware/errorHandler');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Security & logging ───────────────────────────────────────
// CSP allowlist built from an audit of MapIt_MVP_v1.html's actual external
// resources (Leaflet CDN, Supabase JS CDN, Google Fonts, CartoDB tiles,
// Nominatim/Photon geocoding, Supabase Realtime for chat). script-src and
// style-src keep 'unsafe-inline' as a deliberate, documented gap — the
// frontend has 118 inline onclick= handlers and 168 inline style=
// attributes; removing them for a nonce-based CSP is a separate, larger
// refactor (tracked in CONTEXT.md), not part of this pass. Every other
// directive is a real allowlist, not a wildcard.
const supabaseHost = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).host : '';
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net'],
      // Helmet defaults script-src-attr to 'none', which governs inline onclick=
      // handlers *separately* from script-src as of CSP3 — without this override,
      // every one of the app's 118 onclick= handlers would silently stop firing.
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
      fontSrc:     ["'self'", 'data:', 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
      // cdnjs.cloudflare.com: Leaflet's default marker icon (home-location
      // and post-listing pickers use L.marker() with no custom icon, unlike
      // the emoji divIcons the main map's listing pins use) — missed in the
      // original Session 7 CSP audit since it only showed up as a broken
      // image, not a console error.
      imgSrc:      ["'self'", 'data:', 'https://*.basemaps.cartocdn.com', 'https://cdnjs.cloudflare.com', ...(supabaseHost ? [`https://${supabaseHost}`] : [])],
      connectSrc:  ["'self'", 'https://nominatim.openstreetmap.org', 'https://photon.komoot.io', ...(supabaseHost ? [`https://${supabaseHost}`, `wss://${supabaseHost}`] : [])],
      objectSrc:   ["'none'"],
      baseUri:     ["'self'"],
      frameAncestors: ["'none'"],
      formAction:  ["'self'"],
    },
  },
}));
app.use(morgan('dev'));

// ── CORS ─────────────────────────────────────────────────────
// Allow requests from the frontend (update APP_URL in .env)
const allowedOrigins = [
  'https://mapit.co.in',
  'https://www.mapit.co.in',
  'https://uat.mapit.co.in',
  // dev: add APP_URL env var (e.g. http://localhost:3001) locally only — never committed
  ...(process.env.APP_URL ? [process.env.APP_URL] : []),
];
app.use(cors({
  origin: (origin, cb) => {
    // allow server-to-server calls (no origin) and listed origins
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    // allow all Vercel preview deployments — case-insensitive to handle uppercase in deployment hash URLs
    if (/^https:\/\/mapit-backend(-[a-zA-Z0-9-]+)?\.vercel\.app$/i.test(origin)) return cb(null, true);
    const corsErr = new Error('Not allowed by CORS'); corsErr.statusCode = 403; cb(corsErr);
  },
  credentials: true,
}));

// ── Body parsing ─────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Trust Vercel's proxy so rate limiters use the real client IP from X-Forwarded-For,
// not the shared Vercel edge IP (which would bucket all users together).
app.set('trust proxy', 1);

// ── Global rate limiter ──────────────────────────────────────
// Max 200 requests per 15 minutes per real client IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again in 15 minutes.' },
});
app.use(limiter);

// ── Health check ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'MapIt Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ── Public runtime config ────────────────────────────────────
// Frontend needs the Supabase URL + anon key to open a Realtime connection
// for live chat. The anon key is meant to be public (RLS is the real
// boundary) — never expose SUPABASE_SERVICE_ROLE_KEY here.
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl:      process.env.SUPABASE_URL,
    supabaseAnonKey:  process.env.SUPABASE_ANON_KEY,
  });
});

// ── Routes ───────────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/listings',      listingRoutes);
app.use('/api/pins',          pinRoutes);
app.use('/api/messages',      messageRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/users',         userRoutes);
app.use('/api/uploads',       uploadRoutes);

// ── Admin dashboard (clean URL) ─────────────────────────────────
// Client-side check inside admin.html is just a friendly front door —
// every admin API route is independently gated by requireAdmin.
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// ── Frontend static files ─────────────────────────────────────
// Serves public/index.html at mapit.co.in (API routes above take priority)
app.use(express.static(path.join(__dirname, '../public')));

// ── 404 handler ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Error handler ────────────────────────────────────────────
// Sentry's handler reports the error upstream, then re-throws to our own
// handler below so the JSON response shape to clients is unchanged.
Sentry.setupExpressErrorHandler(app);
app.use(errorHandler);

// ── Start server (local dev only — Vercel uses module.exports) ─
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\nMapIt backend running on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}\n`);
  });
}

module.exports = app;
