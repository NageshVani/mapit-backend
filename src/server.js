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
app.use(helmet());
app.use(morgan('dev'));

// ── CORS ─────────────────────────────────────────────────────
// Allow requests from the frontend (update APP_URL in .env)
const allowedOrigins = [
  process.env.APP_URL || 'http://localhost:3000',
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'https://maopit.co.in',
  'https://www.maopit.co.in',
];
app.use(cors({
  origin: (origin, cb) => {
    // allow server-to-server calls (no origin) and listed origins
    if (!origin || allowedOrigins.includes(origin)) cb(null, true);
    else cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// ── Body parsing ─────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Global rate limiter ──────────────────────────────────────
// Max 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again in 15 minutes.' },
});
app.use(limiter);

// Stricter limiter for auth endpoints (prevent OTP abuse)
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: parseInt(process.env.OTP_RATE_LIMIT) || 5,
  message: { error: 'Too many login attempts. Please wait 1 hour.' },
});

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
app.use('/api/auth',     authLimiter, authRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/pins',     pinRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/uploads',  uploadRoutes);

// ── 404 handler ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Error handler ────────────────────────────────────────────
app.use(errorHandler);

// ── Start server ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🗺  MapIt backend running on http://localhost:${PORT}`);
  console.log(`📋  Health check: http://localhost:${PORT}/health`);
  console.log(`🌍  Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = app;
