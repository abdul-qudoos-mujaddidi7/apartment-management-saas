const AppError = require('../errors/AppError');

/**
 * Matched no route — return a JSON 404 instead of an HTML Express default.
 */
function notFound(req, res, next) {
  return next(new AppError('Route not found.', 404, 'ROUTE_NOT_FOUND'));
}

module.exports = notFound;
