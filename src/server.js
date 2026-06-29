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
const path       = require('path');
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');

const authRoutes     = require('./routes/auth');
const listingRoutes  = require('./routes/listings');
const pinRoutes      = require('./routes/pins');
const messageRoutes  = require('./routes/messages');
const userRoutes     = require('./routes/users');
const uploadRoutes   = require('./routes/uploads');
const { errorHandler } = require('./middleware/errorHandler');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Security & logging ───────────────────────────────────────
// CSP disabled: frontend uses inline scripts + external CDNs (Leaflet, Font Awesome, Google Fonts)
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('dev'));

// ── CORS ─────────────────────────────────────────────────────
// Allow requests from the frontend (update APP_URL in .env)
const allowedOrigins = [
  process.env.APP_URL || 'http://localhost:3000',
  'http://localhost:3001',          // local Express dev server (Express runs on 3001)
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'https://mapit.co.in',
  'https://www.mapit.co.in',
  'https://uat.mapit.co.in',        // UAT subdomain
];
app.use(cors({
  origin: (origin, cb) => {
    // allow server-to-server calls (no origin) and listed origins
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    // allow all Vercel preview deployments — case-insensitive to handle uppercase in deployment hash URLs
    if (/^https:\/\/mapit-backend(-[a-zA-Z0-9-]+)?\.vercel\.app$/i.test(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
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

// ── Routes ───────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/pins',     pinRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/uploads',  uploadRoutes);

// ── Frontend static files ─────────────────────────────────────
// Serves public/index.html at mapit.co.in (API routes above take priority)
app.use(express.static(path.join(__dirname, '../public')));

// ── 404 handler ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Error handler ────────────────────────────────────────────
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
