/**
 * Wrap an async route handler so rejections flow into the central
 * error handler instead of crashing the request.
 */
function asyncHandler(handler) {
  return function wrappedAsyncHandler(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
