const AppError = require('../errors/AppError');

/**
 * Central error handler. Services throw AppError with an explicit status and
 * code; anything unknown becomes a 500 and its message is hidden in production.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
  let finalError = error;

  // Prisma unique-constraint violations become a 409 safety net.
  if (error?.code === 'P2002') {
    finalError = new AppError(
      'This record already exists.',
      409,
      'DUPLICATE_RECORD',
    );
  }

  const statusCode = Number(finalError.statusCode || 500);
  const isAppError = Boolean(finalError.isOperational);

  if (statusCode >= 500 && !isAppError) {
    console.error('Unhandled API error:', finalError);
  }

  const response = {
    success: false,
    message:
      process.env.NODE_ENV === 'production' && statusCode >= 500
        ? 'An unexpected server error occurred.'
        : finalError.message || 'An unexpected server error occurred.',
    code: finalError.code || 'INTERNAL_ERROR',
  };

  if (finalError.details) {
    response.errors = finalError.details;
  }

  return res.status(statusCode).json(response);
}

module.exports = errorHandler;
