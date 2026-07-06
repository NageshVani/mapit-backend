// ============================================================
// Global Error Handler
// Catches any error passed via next(err) in route handlers.
// Returns a consistent JSON error response.
// ============================================================
function errorHandler(err, req, res, next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  const statusCode = err.statusCode || err.status || 500;

  res.status(statusCode).json({
    error: err.message || 'An unexpected server error occurred.',
    // stack only in dev for 5xx — never for 4xx (which may be user-visible)
    ...(process.env.NODE_ENV === 'development' && statusCode >= 500 && { stack: err.stack }),
  });
}

// Helper — create an error with a specific HTTP status code
function createError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

module.exports = { errorHandler, createError };
