/**
 * Operational application error.
 *
 * Services throw AppError with an explicit HTTP status and machine-readable
 * code; the central error handler turns it into the JSON error response.
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);

    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace?.(this, AppError);
  }
}

module.exports = AppError;
